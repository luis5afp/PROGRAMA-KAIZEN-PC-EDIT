"use strict"

const { app } = require("electron")
const fs = require("fs/promises")
const path = require("path")
const crypto = require("crypto")
const { BACKEND_HOST } = require("../config")

let started = false
let sequence = 0
const attachedWebContents = new WeakSet()

function backendOrigin() {
  try {
    return new URL(BACKEND_HOST).origin
  } catch (_) {
    return String(BACKEND_HOST || "").replace(/\/$/, "")
  }
}

function isBackendUrl(value) {
  try {
    const candidate = new URL(String(value || ""))
    const expected = new URL(BACKEND_HOST)
    return candidate.origin === expected.origin
  } catch (_) {
    return false
  }
}

function nowIso() {
  return new Date().toISOString()
}

function dayStamp() {
  return nowIso().slice(0, 10)
}

function fileStamp() {
  return nowIso().replace(/[:.]/g, "-")
}

function nextId(source) {
  sequence = (sequence + 1) % 1000000
  return `${fileStamp()}_${process.pid}_${String(sequence).padStart(6, "0")}_${source}`
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

function captureRoot() {
  return path.join(app.getPath("userData"), "KAIZEN-Inspector", "server-responses")
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return {}
  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    try {
      out[String(key)] = Array.isArray(value)
        ? value.map(item => String(item))
        : value == null
          ? ""
          : String(value)
    } catch (_) {}
  }
  return out
}

function extensionForMime(mimeType, isBase64) {
  if (isBase64) return ".b64"
  const mime = String(mimeType || "").toLowerCase()
  if (mime.includes("json")) return ".json"
  if (mime.includes("html")) return ".html"
  if (mime.includes("javascript")) return ".js"
  if (mime.includes("css")) return ".css"
  if (mime.startsWith("text/")) return ".txt"
  if (mime.includes("xml")) return ".xml"
  return ".txt"
}

async function persistCapture(record, bodyBuffer, bodyOptions = {}) {
  try {
    const root = captureRoot()
    const dayDir = path.join(root, dayStamp())
    const bodiesDir = path.join(dayDir, "bodies")
    await fs.mkdir(bodiesDir, { recursive: true })

    const id = record.id || nextId(record.source || "capture")
    const mimeType = bodyOptions.mimeType || record.mimeType || ""
    const isBase64 = Boolean(bodyOptions.base64Encoded)
    const extension = extensionForMime(mimeType, isBase64)
    const bodyName = `${id}${extension}`
    const bodyPath = path.join(bodiesDir, bodyName)

    let storedBuffer = Buffer.isBuffer(bodyBuffer)
      ? bodyBuffer
      : Buffer.from(bodyBuffer == null ? "" : String(bodyBuffer), "utf8")

    await fs.writeFile(bodyPath, storedBuffer)

    const indexRecord = {
      ...record,
      id,
      capturedAt: record.capturedAt || nowIso(),
      backendOrigin: backendOrigin(),
      bodyFile: path.join("bodies", bodyName).replace(/\\/g, "/"),
      bodyEncoding: isBase64 ? "base64-text" : "utf8-or-binary-buffer",
      bodyBytes: storedBuffer.length,
      bodySha256: hashBuffer(storedBuffer),
    }

    await fs.appendFile(
      path.join(dayDir, "responses.ndjson"),
      `${JSON.stringify(indexRecord)}\n`,
      "utf8",
    )
  } catch (error) {
    // Inspector failures must never alter normal KAIZEN behavior.
    console.warn("[inspector] local capture write skipped:", error?.message || error)
  }
}

function persistWithoutBlocking(record, bodyBuffer, options) {
  setImmediate(() => {
    void persistCapture(record, bodyBuffer, options)
  })
}

function serializeAxiosBody(data) {
  try {
    if (Buffer.isBuffer(data)) {
      return { buffer: data, mimeType: "application/octet-stream" }
    }
    if (data instanceof ArrayBuffer) {
      return { buffer: Buffer.from(data), mimeType: "application/octet-stream" }
    }
    if (ArrayBuffer.isView(data)) {
      return {
        buffer: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
        mimeType: "application/octet-stream",
      }
    }
    if (typeof data === "string") {
      return { buffer: Buffer.from(data, "utf8"), mimeType: "text/plain" }
    }
    if (data == null) {
      return { buffer: Buffer.alloc(0), mimeType: "" }
    }
    return {
      buffer: Buffer.from(JSON.stringify(data, null, 2), "utf8"),
      mimeType: "application/json",
    }
  } catch (_) {
    return { buffer: Buffer.from(String(data), "utf8"), mimeType: "text/plain" }
  }
}

function installAxiosResponseCapture() {
  try {
    const axiosInstance = require("../axiosConfig")
    if (!axiosInstance?.interceptors?.response?.use) return
    if (axiosInstance.__kaizenPassiveCaptureInstalled) return

    Object.defineProperty(axiosInstance, "__kaizenPassiveCaptureInstalled", {
      value: true,
      enumerable: false,
      configurable: false,
    })

    const recordResponse = (response, errorResponse = false) => {
      try {
        const url = response?.config?.url
        if (!isBackendUrl(url)) return
        const serialized = serializeAxiosBody(response?.data)
        const contentType = response?.headers?.["content-type"] || serialized.mimeType
        persistWithoutBlocking(
          {
            id: nextId("main"),
            source: "electron-main-axios",
            direction: "server-to-client",
            url: String(url),
            method: String(response?.config?.method || "GET").toUpperCase(),
            status: Number(response?.status || 0),
            statusText: String(response?.statusText || ""),
            mimeType: String(contentType || ""),
            headers: normalizeHeaders(response?.headers),
            errorResponse: Boolean(errorResponse),
          },
          serialized.buffer,
          { mimeType: contentType || serialized.mimeType },
        )
      } catch (_) {}
    }

    axiosInstance.interceptors.response.use(
      response => {
        recordResponse(response, false)
        return response
      },
      error => {
        if (error?.response) recordResponse(error.response, true)
        return Promise.reject(error)
      },
    )

    console.log("[inspector] passive main-process response capture enabled")
  } catch (error) {
    console.warn("[inspector] axios capture unavailable:", error?.message || error)
  }
}

function attachRendererNetworkCapture(webContents) {
  if (!webContents || webContents.isDestroyed?.()) return
  if (attachedWebContents.has(webContents)) return
  attachedWebContents.add(webContents)

  const pending = new Map()

  try {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach("1.3")
    }

    webContents.debugger.sendCommand("Network.enable").catch(() => {})

    webContents.debugger.on("message", (_event, method, params) => {
      try {
        if (method === "Network.responseReceived") {
          const response = params?.response
          if (!response || !isBackendUrl(response.url)) return
          pending.set(params.requestId, {
            id: nextId("renderer"),
            source: "electron-renderer-cdp",
            direction: "server-to-client",
            url: String(response.url),
            method: "",
            status: Number(response.status || 0),
            statusText: String(response.statusText || ""),
            mimeType: String(response.mimeType || ""),
            headers: normalizeHeaders(response.headers),
            protocol: String(response.protocol || ""),
            remoteIPAddress: String(response.remoteIPAddress || ""),
            fromDiskCache: Boolean(response.fromDiskCache),
            fromServiceWorker: Boolean(response.fromServiceWorker),
            resourceType: String(params?.type || ""),
          })
          return
        }

        if (method === "Network.requestWillBeSent") {
          const request = params?.request
          const current = pending.get(params.requestId)
          if (current && request) {
            current.method = String(request.method || "")
          }
          return
        }

        if (method === "Network.loadingFailed") {
          pending.delete(params?.requestId)
          return
        }

        if (method !== "Network.loadingFinished") return
        const record = pending.get(params.requestId)
        if (!record) return
        pending.delete(params.requestId)

        webContents.debugger
          .sendCommand("Network.getResponseBody", { requestId: params.requestId })
          .then(result => {
            const text = result?.body == null ? "" : String(result.body)
            // Keep base64 exactly as DevTools returned it. For text responses this is
            // the raw decoded response body exposed by Chromium.
            persistWithoutBlocking(
              record,
              Buffer.from(text, "utf8"),
              {
                mimeType: record.mimeType,
                base64Encoded: Boolean(result?.base64Encoded),
              },
            )
          })
          .catch(error => {
            persistWithoutBlocking(
              {
                ...record,
                bodyUnavailable: true,
                bodyError: String(error?.message || error || "unknown"),
              },
              Buffer.alloc(0),
              { mimeType: record.mimeType },
            )
          })
      } catch (_) {}
    })

    webContents.once("destroyed", () => {
      pending.clear()
    })

    console.log("[inspector] passive renderer response capture enabled")
  } catch (error) {
    console.warn("[inspector] renderer capture unavailable:", error?.message || error)
  }
}

function startPassiveServerResponseCapture() {
  if (started) return
  started = true

  installAxiosResponseCapture()

  app.on("browser-window-created", (_event, browserWindow) => {
    try {
      attachRendererNetworkCapture(browserWindow?.webContents)
    } catch (_) {}
  })

  console.log(`[inspector] local-only capture armed for ${backendOrigin()}`)
}

module.exports = {
  startPassiveServerResponseCapture,
  isBackendUrl,
}
