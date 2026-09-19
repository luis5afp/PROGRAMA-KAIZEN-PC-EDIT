"use strict"

const { app } = require("electron")
const fs = require("fs")
const fsp = require("fs/promises")
const path = require("path")
const crypto = require("crypto")
const http = require("http")
const https = require("https")
const childProcess = require("child_process")
const { BACKEND_HOST } = require("../config")
const { inspectChromeSpawn, stopAllProfileCaptures, learnProfileNamesFromBody } = require("./profileChromeCapture")

let started = false
let seq = 0
let spawnPatched = false
const patched = new WeakSet()
const attached = new WeakSet()
const writeQueues = new Map()
const timelineSeqByDir = new Map()

const origin = (() => { try { return new URL(BACKEND_HOST).origin } catch { return String(BACKEND_HOST || "").replace(/\/$/, "") } })()
const isBackend = value => { try { return new URL(String(value || "")).origin === new URL(BACKEND_HOST).origin } catch { return false } }
const now = () => new Date().toISOString()
const id = source => `${now().replace(/[:.]/g, "-")}_${process.pid}_${String(++seq).padStart(6, "0")}_${source}`
const hash = b => crypto.createHash("sha256").update(b).digest("hex")
const safeName = value => String(value || "extension").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 140) || "extension"
function eventFile(entry) {
  const t = String(entry?.type || "EVENT").toUpperCase()
  if (t === "PROXY") return "proxy.ndjson"
  if (t.includes("ERROR") || t.includes("FAILED")) return "errors.ndjson"
  if (t.startsWith("WEBSOCKET")) return "websocket.ndjson"
  if (t.startsWith("EVENTSOURCE")) return "sse.ndjson"
  if (t === "REQUEST" || t === "REQUEST_EXTRA") return "requests.ndjson"
  if (t === "RESPONSE" || t === "RESPONSE_EXTRA") return "responses.ndjson"
  return "events.ndjson"
}

function nextTimelineSeq(dir) {
  const next = (timelineSeqByDir.get(dir) || 0) + 1
  timelineSeqByDir.set(dir, next)
  return next
}
function makeTimelineEntry(row, file, timelineSeq) {
  return {
    format: "KAIZZEN_TIMELINE_V1",
    seq: timelineSeq,
    capturedAt: row.capturedAt || now(),
    type: String(row.type || "EVENT"),
    id: row.id || null,
    connectionId: row.connectionId || null,
    requestId: row.requestId || null,
    source: row.source || null,
    direction: row.direction || null,
    method: row.method || null,
    url: row.url || null,
    status: row.status ?? row.statusCode ?? null,
    protocol: row.protocol || null,
    resourceType: row.resourceType || null,
    captureMode: row.captureMode || null,
    error: row.error || row.bodyError || row.postDataError || null,
    file,
    bodyFile: row.bodyFile || null,
    bodyBytes: Number.isFinite(row.bodyBytes) ? row.bodyBytes : null,
    bodySha256: row.bodySha256 || null,
    profileName: row.profileName || null,
    profileUniqueName: row.profileUniqueName || null,
    debugPort: row.debugPort ?? null,
  }
}

const headers = h => {
  const out = {}
  for (const [k, v] of Object.entries(h || {})) {
    try { out[String(k)] = Array.isArray(v) ? v.map(String) : v == null ? "" : String(v) } catch {}
  }
  return out
}
const header = (h, name) => {
  const wanted = String(name).toLowerCase()
  for (const [k, v] of Object.entries(h || {})) if (String(k).toLowerCase() === wanted) return Array.isArray(v) ? v.join(", ") : String(v)
  return ""
}
const rawResponseHead = res => {
  try {
    const status = `HTTP/${String(res?.httpVersion || "")} ${Number(res?.statusCode || 0)} ${String(res?.statusMessage || "")}`.trimEnd()
    const raw = Array.isArray(res?.rawHeaders) ? res.rawHeaders : []
    const lines = [status]
    for (let i = 0; i < raw.length; i += 2) lines.push(`${String(raw[i] ?? "")}: ${String(raw[i + 1] ?? "")}`)
    return `${lines.join("\r\n")}\r\n\r\n`
  } catch { return "" }
}
const textMime = mime => /^(text\/)|json|javascript|xml|x-www-form-urlencoded|graphql/i.test(String(mime || ""))
const ext = mime => {
  const m = String(mime || "").toLowerCase()
  if (m.includes("json")) return ".json"
  if (m.includes("html")) return ".html"
  if (m.includes("javascript")) return ".js"
  if (m.includes("css")) return ".css"
  if (m.includes("xml")) return ".xml"
  if (m.includes("pdf")) return ".pdf"
  if (m.includes("png")) return ".png"
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg"
  if (m.includes("zip")) return ".zip"
  if (m.startsWith("text/")) return ".txt"
  return ".bin"
}

function dayDir() {
  const dir = path.join(app.getPath("userData"), "KAIZEN-Inspector", "conexion", now().slice(0, 10))
  fs.mkdirSync(path.join(dir, "bodies"), { recursive: true })
  return dir
}

function extensionDownloadInfo(value) {
  try {
    const u = new URL(String(value || ""))
    const raw = u.searchParams.get("filepath") || ""
    let decoded = raw
    try { decoded = decodeURIComponent(raw) } catch {}
    const normalized = decoded.replace(/\\/g, "/").replace(/^\/+/, "")
    const marker = "extensionsData/"
    const index = normalized.toLowerCase().indexOf(marker.toLowerCase())
    if (index === -1) return null
    const tail = normalized.slice(index + marker.length).replace(/^\/+/, "")
    if (!tail || tail.includes("../")) return null
    const fileName = path.posix.basename(tail)
    const baseName = safeName(fileName.replace(/\.zip$/i, ""))
    return { fileName: fileName || `${baseName}.zip`, baseName, filepath: normalized }
  } catch { return null }
}

async function preserveExtensionArchive(dir, row) {
  try {
    if (String(row?.type || "").toUpperCase() !== "RESPONSE") return
    const status = Number(row?.status ?? row?.statusCode ?? 0)
    if (status < 200 || status >= 300 || !row?.bodyFile || !row?.bodySha256) return
    const info = extensionDownloadInfo(row.url)
    if (!info) return

    const src = path.join(dir, String(row.bodyFile))
    const extRoot = path.join(dir, "extensions")
    const originalRoot = path.join(extRoot, "original")
    const immutableRoot = path.join(originalRoot, info.baseName)
    await fsp.mkdir(immutableRoot, { recursive: true })

    const immutableName = `${row.bodySha256}.zip`
    const immutableDest = path.join(immutableRoot, immutableName)
    try {
      await fsp.link(src, immutableDest)
    } catch (error) {
      if (error?.code !== "EEXIST") await fsp.copyFile(src, immutableDest)
    }

    const alias = path.join(originalRoot, `${info.baseName}.zip`)
    try { await fsp.unlink(alias) } catch (error) { if (error?.code !== "ENOENT") throw error }
    try { await fsp.link(src, alias) } catch { await fsp.copyFile(src, alias) }

    const record = {
      format: "KAIZZEN_EXTENSION_ORIGINAL_V1",
      capturedAt: row.capturedAt || now(),
      extensionName: info.baseName,
      requestedFilepath: info.filepath,
      sourceUrl: row.url || "",
      connectionId: row.connectionId || null,
      bodyFile: row.bodyFile,
      originalFile: `original/${info.baseName}.zip`,
      immutableFile: `original/${info.baseName}/${immutableName}`,
      bytes: Number(row.bodyBytes || 0),
      sha256: row.bodySha256,
      preservation: "exact-response-bytes; hard-link-when-possible",
    }
    await fsp.mkdir(extRoot, { recursive: true })
    await fsp.appendFile(path.join(extRoot, "original-downloads.ndjson"), `${JSON.stringify(record)}\n`, "utf8")
  } catch (error) {
    console.warn("[inspector-ext] original extension archive skipped:", error?.message || error)
  }
}

async function append(entry, body, opts = {}) {
  try {
    const dir = dayDir()
    const eventId = entry.id || id(String(entry.type || "event").toLowerCase())
    const row = { format: "KAIZZEN_CONNECTION_V2", id: eventId, capturedAt: entry.capturedAt || now(), backendOrigin: origin, ...entry }
    if (body != null) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8")
      const mime = String(opts.mimeType || entry.mimeType || "")
      const name = `${eventId}${ext(mime)}`
      await fsp.writeFile(path.join(dir, "bodies", name), buf)
      row.bodyFile = `bodies/${name}`
      row.bodyBytes = buf.length
      row.bodySha256 = hash(buf)
      row.bodyEncoding = opts.encoding || "raw-bytes"
      if ((opts.text || textMime(mime)) && buf.length <= 256 * 1024) row.bodyText = buf.toString("utf8")
      learnProfileNamesFromBody(buf, mime)
    }
    if (body == null && row.bodyText && textMime(entry.mimeType || "")) { try { learnProfileNamesFromBody(Buffer.from(String(row.bodyText), "utf8"), entry.mimeType || "") } catch {} }
    await preserveExtensionArchive(dir, row)
    const file = eventFile(row)
    const timelineSeq = nextTimelineSeq(dir)
    row.timelineSeq = timelineSeq
    const line = `${JSON.stringify(row)}\n`
    await fsp.appendFile(path.join(dir, file), line, "utf8")
    const timeline = makeTimelineEntry(row, file, timelineSeq)
    await fsp.appendFile(path.join(dir, "timeline.ndjson"), `${JSON.stringify(timeline)}\n`, "utf8")
} catch (e) {
    console.warn("[inspector] conexion write skipped:", e?.message || e)
  }
}
function queueWrite(key, job) {
  const prev = writeQueues.get(key) || Promise.resolve()
  const next = prev.then(job, job).catch(e => console.warn("[inspector] queued conexion write skipped:", e?.message || e))
  writeQueues.set(key, next)
  next.finally(() => { if (writeQueues.get(key) === next) writeQueues.delete(key) })
  return next
}
const enqueue = (entry, body, opts) => setImmediate(() => { const key = dayDir(); void queueWrite(key, () => append(entry, body, opts)) })

function collector(name, mime) {
  let stream = null
  let relative = null
  let bytes = 0
  const h = crypto.createHash("sha256")
  const texts = []
  let textBytes = 0
  const keepText = textMime(mime)
  try {
    const dir = dayDir()
    relative = `bodies/${name}${ext(mime)}`
    stream = fs.createWriteStream(path.join(dir, relative), { flags: "w" })
    stream.on("error", () => {})
  } catch {}
  return {
    write(chunk, encoding) {
      try {
        const b = Buffer.isBuffer(chunk) ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(String(chunk), encoding || "utf8")
        bytes += b.length
        h.update(b)
        if (stream) stream.write(b)
        if (keepText && textBytes < 256 * 1024) { const remain = 256 * 1024 - textBytes; texts.push(b.subarray(0, remain)); textBytes += Math.min(remain, b.length) }
      } catch {}
    },
    end(cb) {
      const done = () => {
        let bodySha256 = ""
        try { bodySha256 = h.digest("hex") } catch {}
        const meta = { bodyFile: relative, bodyBytes: bytes, bodySha256, bodyEncoding: "raw-bytes" }
        if (keepText && bytes <= 256 * 1024) { try { meta.bodyText = Buffer.concat(texts, textBytes).toString("utf8") } catch {} }
        cb(meta)
      }
      try { stream ? stream.end(done) : done() } catch { done() }
    },
  }
}

function requestUrl(protocol, args) {
  try {
    const x = args[0]
    if (typeof x === "string" || x instanceof URL) return new URL(String(x)).toString()
    if (x && typeof x === "object") {
      const p = x.protocol || protocol
      const host = x.hostname || x.host || "localhost"
      const port = x.port ? `:${x.port}` : ""
      return `${p}//${host}${port}${x.path || x.pathname || "/"}`
    }
  } catch {}
  return ""
}

function patchTransport(mod, protocol) {
  if (patched.has(mod)) return
  patched.add(mod)
  const original = mod.request
  mod.request = function (...args) {
    const url = requestUrl(protocol, args)
    const req = original.apply(this, args)
    if (!isBackend(url)) return req

    const connectionId = id("node")
    let reqBody = null
    const originalWrite = req.write
    const originalEnd = req.end

    req.write = function (chunk, encoding) {
      const hs = headers(req.getHeaders?.() || {})
      if (!reqBody) reqBody = collector(`${connectionId}_request`, header(hs, "content-type"))
      reqBody.write(chunk, encoding)
      return originalWrite.apply(this, arguments)
    }
    req.end = function (chunk, encoding) {
      if (chunk != null && chunk !== "") {
        const hs = headers(req.getHeaders?.() || {})
        if (!reqBody) reqBody = collector(`${connectionId}_request`, header(hs, "content-type"))
        reqBody.write(chunk, typeof encoding === "string" ? encoding : undefined)
      }
      return originalEnd.apply(this, arguments)
    }

    req.once("finish", () => {
      const hs = headers(req.getHeaders?.() || {})
      const base = {
        type: "REQUEST", connectionId, source: "electron-main-node", direction: "client-to-server",
        method: String(req.method || "GET").toUpperCase(), url, headers: hs,
        rawRequestHead: typeof req._header === "string" ? req._header : "",
        captureLevel: "application-plaintext-after-TLS",
      }
      if (reqBody) reqBody.end(meta => enqueue({ ...base, ...meta }))
      else enqueue(base, Buffer.alloc(0), { mimeType: header(hs, "content-type"), text: true })
    })

    req.on("response", res => {
      const hs = headers(res.headers || {})
      const mime = header(hs, "content-type")
      const body = collector(`${connectionId}_response`, mime)
      res.on("data", chunk => body.write(chunk))
      res.once("end", () => body.end(meta => enqueue({
        type: "RESPONSE", connectionId, source: "electron-main-node", direction: "server-to-client",
        method: String(req.method || "GET").toUpperCase(), url, status: Number(res.statusCode || 0),
        statusText: String(res.statusMessage || ""), headers: hs,
        httpVersion: String(res.httpVersion || ""),
        rawHeaders: Array.isArray(res.rawHeaders) ? res.rawHeaders.map(String) : [],
        rawResponseHead: rawResponseHead(res),
        mimeType: mime, captureLevel: "application-plaintext-after-TLS", ...meta,
      })))
    })
    req.on("error", e => enqueue({ type: "REQUEST_ERROR", connectionId, source: "electron-main-node", direction: "client-to-server", method: String(req.method || "GET").toUpperCase(), url, error: String(e?.message || e || "unknown") }))
    return req
  }
}

function parseProxy(raw) {
  const text = String(raw || "").trim()
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(text)
  const Protocol = (m ? m[1] : "socks5").toLowerCase()
  const rest = (m ? m[2] : text).replace(/\/+$/, "")
  let Host = "", Port = 0, Username = "", Password = ""
  const at = rest.lastIndexOf("@")
  if (at !== -1) {
    const creds = rest.slice(0, at), split = creds.indexOf(":")
    try { Username = decodeURIComponent(split === -1 ? creds : creds.slice(0, split)); Password = split === -1 ? "" : decodeURIComponent(creds.slice(split + 1)) }
    catch { Username = split === -1 ? creds : creds.slice(0, split); Password = split === -1 ? "" : creds.slice(split + 1) }
    const authority = rest.slice(at + 1), i = authority.lastIndexOf(":")
    Host = i === -1 ? authority : authority.slice(0, i)
    Port = i === -1 ? 0 : Number(authority.slice(i + 1))
  } else {
    const p = rest.split(":")
    Host = p[0] || ""; Port = Number(p[1]) || 0
    if (p.length >= 3) { Username = p[2] || ""; Password = p.slice(3).join(":") }
  }
  const HasCredentials = Boolean(Username || Password)
  const SanitizedRaw = `${Protocol}://${HasCredentials ? "***:***@" : ""}${Host}${Port ? ":" + Port : ""}`
  return {
    raw: SanitizedRaw,
    Protocol,
    Host,
    Port,
    Username: Username ? "[REDACTED]" : "",
    Password: Password ? "[REDACTED]" : "",
    HasCredentials,
  }
}

function patchProxySpawn() {
  if (spawnPatched) return
  spawnPatched = true
  const original = childProcess.spawn
  childProcess.spawn = function (command, args, options) {
    const child = original.apply(this, arguments)
    try {
      const list = Array.isArray(args) ? args.map(String) : []
      const p = list.find(x => x.startsWith("--proxy="))
      if (p && list.some(x => /proxyServer\.js$/i.test(x.replace(/\\/g, "/")))) {
        const local = list.find(x => x.startsWith("--port="))
        enqueue({ type: "PROXY", source: "proxy-relay-launch", direction: "local-config", ...parseProxy(p.slice(8)), LocalRelayPort: local ? Number(local.slice(7)) || 0 : 0 })
      }
      inspectChromeSpawn(command, args, child)
    } catch {}
    return child
  }
}

function attachRenderer(wc) {
  if (!wc || wc.isDestroyed?.() || attached.has(wc)) return
  attached.add(wc)
  const reqs = new Map(), resps = new Map(), sockets = new Map()
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3")
    wc.debugger.sendCommand("Network.enable", { maxTotalBufferSize: 100 * 1024 * 1024, maxResourceBufferSize: 50 * 1024 * 1024, maxPostDataSize: 50 * 1024 * 1024 }).catch(() => {})
    wc.debugger.on("message", (_e, method, p) => {
      try {
        const requestId = String(p?.requestId || "")
        if (method === "Network.requestWillBeSent") {
          const r = p?.request
          if (!r || !isBackend(r.url)) return
          const connectionId = id("renderer")
          const row = {
            type: "REQUEST", connectionId, requestId, source: "electron-renderer-cdp", direction: "client-to-server",
            method: String(r.method || "GET").toUpperCase(), url: String(r.url), headers: headers(r.headers),
            resourceType: String(p?.type || ""), hasPostData: Boolean(r.hasPostData),
            postDataEntries: Array.isArray(r.postDataEntries) ? r.postDataEntries : null,
            documentURL: String(p?.documentURL || ""), initiator: p?.initiator || null,
            timestamp: p?.timestamp ?? null, wallTime: p?.wallTime ?? null,
            mixedContentType: String(r.mixedContentType || ""), referrerPolicy: String(r.referrerPolicy || ""),
            captureLevel: "application-plaintext-after-TLS",
          }
          reqs.set(requestId, row)
          if (typeof r.postData === "string") enqueue(row, Buffer.from(r.postData, "utf8"), { mimeType: header(row.headers, "content-type"), encoding: "cdp-postData", text: true })
          else if (r.hasPostData) wc.debugger.sendCommand("Network.getRequestPostData", { requestId })
            .then(x => enqueue(row, Buffer.from(String(x?.postData || ""), "utf8"), { mimeType: header(row.headers, "content-type"), encoding: "cdp-postData", text: true }))
            .catch(e => enqueue({ ...row, postDataUnavailable: true, postDataError: String(e?.message || e || "unknown") }))
          else enqueue(row, Buffer.alloc(0), { mimeType: header(row.headers, "content-type"), text: true })
          return
        }
        if (method === "Network.requestWillBeSentExtraInfo") {
          const base = reqs.get(requestId)
          if (base) enqueue({ type: "REQUEST_EXTRA", connectionId: base.connectionId, requestId, source: "electron-renderer-cdp", direction: "client-to-server", method: base.method, url: base.url, headers: headers(p?.headers), associatedCookies: p?.associatedCookies || [], connectTiming: p?.connectTiming || null })
          return
        }
        if (method === "Network.responseReceived") {
          const r = p?.response
          if (!r || !isBackend(r.url)) return
          const base = reqs.get(requestId)
          resps.set(requestId, {
            type: "RESPONSE", connectionId: base?.connectionId || id("renderer"), requestId,
            source: "electron-renderer-cdp", direction: "server-to-client", method: base?.method || "",
            url: String(r.url), status: Number(r.status || 0), statusText: String(r.statusText || ""),
            headers: headers(r.headers), mimeType: String(r.mimeType || ""), protocol: String(r.protocol || ""),
            remoteIPAddress: String(r.remoteIPAddress || ""), remotePort: Number(r.remotePort || 0),
            fromDiskCache: Boolean(r.fromDiskCache), fromServiceWorker: Boolean(r.fromServiceWorker),
            resourceType: String(p?.type || ""), timing: r.timing || null, securityDetails: r.securityDetails || null,
            securityState: String(r.securityState || ""), encodedDataLength: Number(r.encodedDataLength || 0),
            timestamp: p?.timestamp ?? null, captureLevel: "application-plaintext-after-TLS",
          })
          return
        }
        if (method === "Network.responseReceivedExtraInfo") {
          const base = resps.get(requestId) || reqs.get(requestId)
          if (base) enqueue({ type: "RESPONSE_EXTRA", connectionId: base.connectionId, requestId, source: "electron-renderer-cdp", direction: "server-to-client", method: base.method || "", url: base.url || "", statusCode: Number(p?.statusCode || 0), headers: headers(p?.headers), headersText: String(p?.headersText || ""), blockedCookies: p?.blockedCookies || [] })
          return
        }
        if (method === "Network.webSocketCreated") {
          if (!isBackend(p?.url)) return
          sockets.set(requestId, { connectionId: id("websocket"), requestId, url: String(p?.url || "") })
          enqueue({ type: "WEBSOCKET_CREATED", ...sockets.get(requestId), source: "electron-renderer-cdp", direction: "bidirectional", initiator: p?.initiator || null, captureLevel: "application-plaintext-after-TLS" })
          return
        }
        if (method === "Network.webSocketWillSendHandshakeRequest") {
          const ws = sockets.get(requestId); if (!ws) return
          enqueue({ type: "WEBSOCKET_HANDSHAKE_REQUEST", ...ws, source: "electron-renderer-cdp", direction: "client-to-server", headers: headers(p?.request?.headers), requestTime: p?.request?.requestTime ?? null, wallTime: p?.wallTime ?? null })
          return
        }
        if (method === "Network.webSocketHandshakeResponseReceived") {
          const ws = sockets.get(requestId); if (!ws) return
          enqueue({ type: "WEBSOCKET_HANDSHAKE_RESPONSE", ...ws, source: "electron-renderer-cdp", direction: "server-to-client", status: Number(p?.response?.status || 0), statusText: String(p?.response?.statusText || ""), headers: headers(p?.response?.headers), headersText: String(p?.response?.headersText || "") })
          return
        }
        if (method === "Network.webSocketFrameSent" || method === "Network.webSocketFrameReceived") {
          const ws = sockets.get(requestId); if (!ws) return
          const frame = p?.response || {}
          const binary = Number(frame.opcode) === 2
          const payload = String(frame.payloadData || "")
          const body = binary ? Buffer.from(payload, "base64") : Buffer.from(payload, "utf8")
          enqueue({ type: method.endsWith("Sent") ? "WEBSOCKET_FRAME_SENT" : "WEBSOCKET_FRAME_RECEIVED", ...ws, source: "electron-renderer-cdp", direction: method.endsWith("Sent") ? "client-to-server" : "server-to-client", opcode: Number(frame.opcode || 0), mask: Boolean(frame.mask), captureLevel: "application-plaintext-after-TLS" }, body, { mimeType: binary ? "application/octet-stream" : "text/plain", encoding: binary ? "decoded-from-cdp-base64" : "utf8", text: !binary })
          return
        }
        if (method === "Network.webSocketClosed" || method === "Network.webSocketFrameError") {
          const ws = sockets.get(requestId); if (!ws) return
          enqueue({ type: method === "Network.webSocketClosed" ? "WEBSOCKET_CLOSED" : "WEBSOCKET_FRAME_ERROR", ...ws, source: "electron-renderer-cdp", direction: "local", timestamp: p?.timestamp ?? null, errorMessage: String(p?.errorMessage || "") })
          if (method === "Network.webSocketClosed") sockets.delete(requestId)
          return
        }
        if (method === "Network.eventSourceMessageReceived") {
          const base = resps.get(requestId) || reqs.get(requestId)
          if (!base) return
          enqueue({ type: "EVENTSOURCE_MESSAGE", connectionId: base.connectionId, requestId, source: "electron-renderer-cdp", direction: "server-to-client", url: base.url, eventName: String(p?.eventName || ""), eventId: String(p?.eventId || ""), timestamp: p?.timestamp ?? null, captureLevel: "application-plaintext-after-TLS" }, Buffer.from(String(p?.data || ""), "utf8"), { mimeType: "text/event-stream", encoding: "utf8", text: true })
          return
        }
        if (method === "Network.loadingFailed") {
          const base = reqs.get(requestId)
          if (base) enqueue({ type: "REQUEST_ERROR", connectionId: base.connectionId, requestId, source: "electron-renderer-cdp", direction: "client-to-server", method: base.method, url: base.url, error: String(p?.errorText || "loadingFailed"), canceled: Boolean(p?.canceled), blockedReason: String(p?.blockedReason || "") })
          reqs.delete(requestId); resps.delete(requestId); return
        }
        if (method === "Network.loadingFinished") {
          const row = resps.get(requestId)
          if (!row) return
          wc.debugger.sendCommand("Network.getResponseBody", { requestId })
            .then(x => {
              const b = x?.base64Encoded ? Buffer.from(String(x.body || ""), "base64") : Buffer.from(String(x?.body || ""), "utf8")
              enqueue(row, b, { mimeType: row.mimeType, encoding: x?.base64Encoded ? "decoded-from-cdp-base64" : "cdp-text", text: !x?.base64Encoded })
            })
            .catch(e => enqueue({ ...row, bodyUnavailable: true, bodyError: String(e?.message || e || "unknown") }))
            .finally(() => { reqs.delete(requestId); resps.delete(requestId) })
        }
      } catch {}
    })
    wc.once("destroyed", () => { reqs.clear(); resps.clear(); sockets.clear() })
  } catch (e) { console.warn("[inspector] renderer conexion capture unavailable:", e?.message || e) }
}

function startFullConnectionCapture() {
  if (started) return
  started = true
  patchTransport(http, "http:")
  patchTransport(https, "https:")
  patchProxySpawn()
  app.once("before-quit", () => { try { stopAllProfileCaptures() } catch {} })
  app.on("browser-window-created", (_e, win) => { try { attachRenderer(win?.webContents) } catch {} })
  enqueue({ type: "INSPECTOR_START", source: "launcher", direction: "local", policy: "passive-no-network-modification", captureLevel: "application-plaintext-after-TLS", redaction: "proxy-credentials-redacted; controlled-backend-capture-enabled; metadata-only-for-third-party-profile-traffic", encryptionAtRest: "none", outputs: ["conexion", "conexion.ndjson", "bodies/*", "extension-load.ndjson", "extensions/original-downloads.ndjson", "profiles/<profileUniqueName>/profile.json", "profiles/<profileUniqueName>/conexion", "profiles/<profileUniqueName>/bodies/*"] })
  console.log(`[inspector] passive conexion capture armed for ${origin}; per-profile Chrome CDP capture enabled`)
}

module.exports = { startFullConnectionCapture, isBackendUrl: isBackend, parseProxyRaw: parseProxy }
