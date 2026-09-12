"use strict"

const { app } = require("electron")
const fs = require("fs")
const fsp = require("fs/promises")
const path = require("path")
const crypto = require("crypto")
const puppeteerCore = require("puppeteer-core")
const { BACKEND_HOST } = require("../config")

let seq = 0
const captures = new Map()
const profileNames = new Map()
const writeQueues = new Map()

const now = () => new Date().toISOString()
const id = source => `${now().replace(/[:.]/g, "-")}_${process.pid}_${String(++seq).padStart(6, "0")}_${source}`
const hash = b => crypto.createHash("sha256").update(b).digest("hex")
const safeName = value => String(value || "unknown").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 140) || "unknown"
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

function captureMode(value) {
  try {
    const u = new URL(String(value || ""))
    const h = u.hostname.toLowerCase()
    if (u.origin === new URL(BACKEND_HOST).origin) return "full-lab"
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost") || h.endsWith(".test") || h.endsWith(".invalid") || h.endsWith(".example")) return "full-lab"
    return "metadata-only-third-party"
  } catch { return "metadata-only-third-party" }
}

function profileDir(meta) {
  const dir = path.join(app.getPath("userData"), "KAIZEN-Inspector", "conexion", now().slice(0, 10), "profiles", safeName(meta.profileUniqueName || meta.profileFolder || `port-${meta.debugPort}`))
  fs.mkdirSync(path.join(dir, "bodies"), { recursive: true })
  return dir
}
function queueWrite(key, job) {
  const prev = writeQueues.get(key) || Promise.resolve()
  const next = prev.then(job, job).catch(e => console.warn("[inspector-profile] write skipped:", e?.message || e))
  writeQueues.set(key, next)
  next.finally(() => { if (writeQueues.get(key) === next) writeQueues.delete(key) })
  return next
}
async function writeProfileMeta(meta) {
  try {
    const dir = profileDir(meta)
    await fsp.writeFile(path.join(dir, "profile.json"), JSON.stringify({
      profileName: meta.profileName || profileNames.get(meta.profileUniqueName) || null,
      profileUniqueName: meta.profileUniqueName,
      profileFolder: meta.profileFolder,
      debugPort: meta.debugPort,
      browserPid: meta.browserPid,
      browserExecutable: meta.browserExecutable,
      proxyServer: meta.proxyServer || "",
      captureScope: meta.captureScope,
      updatedAt: now(),
    }, null, 2), "utf8")
  } catch {}
}
async function append(meta, entry, body, opts = {}) {
  const dir = profileDir(meta)
  const eventId = entry.id || id(String(entry.type || "event").toLowerCase())
  const row = {
    format: "KAIZZEN_PROFILE_CONNECTION_V1",
    id: eventId,
    capturedAt: entry.capturedAt || now(),
    profileName: meta.profileName || profileNames.get(meta.profileUniqueName) || null,
    profileUniqueName: meta.profileUniqueName,
    profileFolder: meta.profileFolder,
    debugPort: meta.debugPort,
    browserPid: meta.browserPid,
    ...entry,
  }
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
  }
  const line = `${JSON.stringify(row)}\n`
  await fsp.appendFile(path.join(dir, eventFile(row)), line, "utf8")
}
function enqueue(meta, entry, body, opts) {
  const dir = profileDir(meta)
  return queueWrite(dir, () => append(meta, entry, body, opts))
}

function learnProfileNamesFromBody(body, mime) {
  if (!body || !/json/i.test(String(mime || ""))) return
  let value
  try { value = JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body)) } catch { return }
  const seen = new Set()
  const walk = v => {
    if (!v || typeof v !== "object" || seen.has(v)) return
    seen.add(v)
    if (!Array.isArray(v)) {
      const unique = v.profileUniqueName || v.profile_unique_name || v.uniqueName || null
      const name = v.profileName || v.profile_name || v.name || v.title || null
      if (unique && name && String(unique).length < 200 && String(name).length < 300) {
        const key = String(unique), display = String(name)
        if (profileNames.get(key) !== display) {
          profileNames.set(key, display)
          const state = captures.get(key)
          if (state) {
            state.meta.profileName = display
            void writeProfileMeta(state.meta)
            enqueue(state.meta, { type: "PROFILE_NAME_RESOLVED", source: "profile-chrome-cdp", direction: "local", resolvedName: display })
          }
        }
      }
    }
    if (Array.isArray(v)) for (const item of v) walk(item)
    else for (const item of Object.values(v)) walk(item)
  }
  walk(value)
}

function parseChromeLaunch(command, args, child) {
  try {
    const exe = path.basename(String(command || "")).toLowerCase()
    const list = Array.isArray(args) ? args.map(String) : []
    const portArg = list.find(x => x.startsWith("--remote-debugging-port="))
    const dataArg = list.find(x => x.startsWith("--user-data-dir="))
    if (!portArg || !dataArg || !(exe === "chrome.exe" || exe === "chrome" || exe.includes("chrom"))) return null
    const debugPort = Number(portArg.slice("--remote-debugging-port=".length)) || 0
    if (!debugPort) return null
    const userDataRaw = dataArg.slice("--user-data-dir=".length).replace(/^[\"']|[\"']$/g, "")
    const normalized = userDataRaw.replace(/\\/g, "/").replace(/\/+$/, "")
    const profileFolder = normalized.split("/").filter(Boolean).pop() || `port-${debugPort}`
    const profileUniqueName = `${profileFolder}.zip`
    const proxyArg = list.find(x => x.startsWith("--proxy-server="))
    return {
      profileUniqueName,
      profileFolder,
      profileName: profileNames.get(profileUniqueName) || null,
      debugPort,
      browserPid: Number(child?.pid || 0),
      browserExecutable: String(command || ""),
      proxyServer: proxyArg ? proxyArg.slice("--proxy-server=".length) : "",
      captureScope: "full-for-backend-and-lab-origins; metadata-only-for-third-party-origins",
    }
  } catch { return null }
}
async function waitForDebugPort(port, timeoutMs = 25000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  return false
}

async function attachTarget(state, target) {
  if (!target || state.stopped || state.targets.has(target)) return
  const targetType = String(target.type?.() || "")
  if (!["page", "service_worker", "background_page", "webview"].includes(targetType)) return
  state.targets.add(target)
  let client
  try {
    client = await target.createCDPSession()
    state.clients.add(client)
    const reqs = new Map(), resps = new Map(), sockets = new Map()
    await client.send("Network.enable", { maxTotalBufferSize: 64 * 1024 * 1024, maxResourceBufferSize: 32 * 1024 * 1024, maxPostDataSize: 32 * 1024 * 1024 })

    client.on("Network.requestWillBeSent", p => {
      try {
        const r = p?.request
        if (!r?.url) return
        const mode = captureMode(r.url), full = mode === "full-lab"
        const requestId = String(p.requestId || ""), connectionId = id("request")
        const row = {
          type: "REQUEST", connectionId, requestId, source: "profile-chrome-cdp", direction: "client-to-server",
          method: String(r.method || "GET").toUpperCase(), url: String(r.url), captureMode: mode,
          resourceType: String(p?.type || ""), documentURL: String(p?.documentURL || ""),
          initiator: full ? (p?.initiator || null) : null, timestamp: p?.timestamp ?? null, wallTime: p?.wallTime ?? null,
          headers: full ? headers(r.headers) : undefined, hasPostData: full ? Boolean(r.hasPostData) : undefined,
          captureLevel: "application-plaintext-after-TLS",
        }
        reqs.set(requestId, row)
        if (!full) return void enqueue(state.meta, row)
        if (typeof r.postData === "string") enqueue(state.meta, row, Buffer.from(r.postData, "utf8"), { mimeType: header(row.headers, "content-type"), encoding: "cdp-postData", text: true })
        else if (r.hasPostData) client.send("Network.getRequestPostData", { requestId })
          .then(x => enqueue(state.meta, row, Buffer.from(String(x?.postData || ""), "utf8"), { mimeType: header(row.headers, "content-type"), encoding: "cdp-postData", text: true }))
          .catch(e => enqueue(state.meta, { ...row, postDataUnavailable: true, postDataError: String(e?.message || e || "unknown") }))
        else enqueue(state.meta, row, Buffer.alloc(0), { mimeType: header(row.headers, "content-type"), text: true })
      } catch {}
    })
    client.on("Network.requestWillBeSentExtraInfo", p => {
      const base = reqs.get(String(p?.requestId || ""))
      if (!base || base.captureMode !== "full-lab") return
      enqueue(state.meta, { type: "REQUEST_EXTRA", connectionId: base.connectionId, requestId: base.requestId, source: "profile-chrome-cdp", direction: "client-to-server", method: base.method, url: base.url, captureMode: base.captureMode, headers: headers(p?.headers), associatedCookies: p?.associatedCookies || [], connectTiming: p?.connectTiming || null })
    })
    client.on("Network.responseReceived", p => {
      try {
        const r = p?.response
        if (!r?.url) return
        const requestId = String(p.requestId || ""), base = reqs.get(requestId)
        const mode = base?.captureMode || captureMode(r.url), full = mode === "full-lab"
        resps.set(requestId, {
          type: "RESPONSE", connectionId: base?.connectionId || id("response"), requestId, source: "profile-chrome-cdp", direction: "server-to-client",
          method: base?.method || "", url: String(r.url), captureMode: mode, status: Number(r.status || 0), statusText: String(r.statusText || ""),
          headers: full ? headers(r.headers) : undefined, mimeType: String(r.mimeType || ""), protocol: String(r.protocol || ""),
          remoteIPAddress: String(r.remoteIPAddress || ""), remotePort: Number(r.remotePort || 0), resourceType: String(p?.type || ""),
          timing: full ? (r.timing || null) : null, securityDetails: full ? (r.securityDetails || null) : null,
          securityState: String(r.securityState || ""), encodedDataLength: Number(r.encodedDataLength || 0), timestamp: p?.timestamp ?? null,
          captureLevel: "application-plaintext-after-TLS",
        })
      } catch {}
    })
    client.on("Network.responseReceivedExtraInfo", p => {
      const requestId = String(p?.requestId || ""), base = resps.get(requestId) || reqs.get(requestId)
      if (!base || base.captureMode !== "full-lab") return
      enqueue(state.meta, { type: "RESPONSE_EXTRA", connectionId: base.connectionId, requestId, source: "profile-chrome-cdp", direction: "server-to-client", method: base.method || "", url: base.url || "", captureMode: base.captureMode, statusCode: Number(p?.statusCode || 0), headers: headers(p?.headers), headersText: String(p?.headersText || ""), blockedCookies: p?.blockedCookies || [] })
    })
    client.on("Network.loadingFinished", p => {
      const requestId = String(p?.requestId || ""), row = resps.get(requestId)
      if (!row) return
      if (row.captureMode !== "full-lab") {
        enqueue(state.meta, row)
        reqs.delete(requestId); resps.delete(requestId)
        return
      }
      client.send("Network.getResponseBody", { requestId })
        .then(x => {
          const b = x?.base64Encoded ? Buffer.from(String(x.body || ""), "base64") : Buffer.from(String(x?.body || ""), "utf8")
          return enqueue(state.meta, row, b, { mimeType: row.mimeType, encoding: x?.base64Encoded ? "decoded-from-cdp-base64" : "cdp-text", text: !x?.base64Encoded })
        })
        .catch(e => enqueue(state.meta, { ...row, bodyUnavailable: true, bodyError: String(e?.message || e || "unknown") }))
        .finally(() => { reqs.delete(requestId); resps.delete(requestId) })
    })
    client.on("Network.loadingFailed", p => {
      const requestId = String(p?.requestId || ""), base = reqs.get(requestId)
      if (base) enqueue(state.meta, { type: "REQUEST_ERROR", connectionId: base.connectionId, requestId, source: "profile-chrome-cdp", direction: "client-to-server", method: base.method, url: base.url, captureMode: base.captureMode, error: String(p?.errorText || "loadingFailed"), canceled: Boolean(p?.canceled), blockedReason: String(p?.blockedReason || "") })
      reqs.delete(requestId); resps.delete(requestId)
    })
    client.on("Network.webSocketCreated", p => {
      if (!p?.url) return
      const requestId = String(p.requestId || ""), mode = captureMode(p.url)
      sockets.set(requestId, { connectionId: id("websocket"), requestId, url: String(p.url), captureMode: mode })
      enqueue(state.meta, { type: "WEBSOCKET_CREATED", ...sockets.get(requestId), source: "profile-chrome-cdp", direction: "bidirectional", initiator: mode === "full-lab" ? (p?.initiator || null) : null, captureLevel: "application-plaintext-after-TLS" })
    })
    client.on("Network.webSocketWillSendHandshakeRequest", p => {
      const ws = sockets.get(String(p?.requestId || "")); if (!ws) return
      enqueue(state.meta, { type: "WEBSOCKET_HANDSHAKE_REQUEST", ...ws, source: "profile-chrome-cdp", direction: "client-to-server", headers: ws.captureMode === "full-lab" ? headers(p?.request?.headers) : undefined, requestTime: p?.request?.requestTime ?? null, wallTime: p?.wallTime ?? null })
    })
    client.on("Network.webSocketHandshakeResponseReceived", p => {
      const ws = sockets.get(String(p?.requestId || "")); if (!ws) return
      enqueue(state.meta, { type: "WEBSOCKET_HANDSHAKE_RESPONSE", ...ws, source: "profile-chrome-cdp", direction: "server-to-client", status: Number(p?.response?.status || 0), statusText: String(p?.response?.statusText || ""), headers: ws.captureMode === "full-lab" ? headers(p?.response?.headers) : undefined, headersText: ws.captureMode === "full-lab" ? String(p?.response?.headersText || "") : undefined })
    })
    const onFrame = direction => p => {
      const ws = sockets.get(String(p?.requestId || "")); if (!ws || ws.captureMode !== "full-lab") return
      const f = p?.response || {}, binary = Number(f.opcode) === 2, payload = String(f.payloadData || "")
      enqueue(state.meta, { type: direction === "client-to-server" ? "WEBSOCKET_FRAME_SENT" : "WEBSOCKET_FRAME_RECEIVED", ...ws, source: "profile-chrome-cdp", direction, opcode: Number(f.opcode || 0), mask: Boolean(f.mask), captureLevel: "application-plaintext-after-TLS" }, binary ? Buffer.from(payload, "base64") : Buffer.from(payload, "utf8"), { mimeType: binary ? "application/octet-stream" : "text/plain", encoding: binary ? "decoded-from-cdp-base64" : "utf8", text: !binary })
    }
    client.on("Network.webSocketFrameSent", onFrame("client-to-server"))
    client.on("Network.webSocketFrameReceived", onFrame("server-to-client"))
    client.on("Network.webSocketClosed", p => {
      const requestId = String(p?.requestId || ""), ws = sockets.get(requestId); if (!ws) return
      enqueue(state.meta, { type: "WEBSOCKET_CLOSED", ...ws, source: "profile-chrome-cdp", direction: "local", timestamp: p?.timestamp ?? null })
      sockets.delete(requestId)
    })
    client.on("Network.eventSourceMessageReceived", p => {
      const requestId = String(p?.requestId || ""), base = resps.get(requestId) || reqs.get(requestId)
      if (!base) return
      if (base.captureMode === "full-lab") enqueue(state.meta, { type: "EVENTSOURCE_MESSAGE", connectionId: base.connectionId, requestId, source: "profile-chrome-cdp", direction: "server-to-client", url: base.url, captureMode: base.captureMode, eventName: String(p?.eventName || ""), eventId: String(p?.eventId || ""), timestamp: p?.timestamp ?? null, captureLevel: "application-plaintext-after-TLS" }, Buffer.from(String(p?.data || ""), "utf8"), { mimeType: "text/event-stream", encoding: "utf8", text: true })
      else enqueue(state.meta, { type: "EVENTSOURCE_MESSAGE", connectionId: base.connectionId, requestId, source: "profile-chrome-cdp", direction: "server-to-client", url: base.url, captureMode: base.captureMode, eventName: String(p?.eventName || ""), eventId: String(p?.eventId || ""), timestamp: p?.timestamp ?? null })
    })
    client.on("Disconnected", () => state.clients.delete(client))
  } catch (e) {
    try { if (client) await client.detach() } catch {}
    state.clients.delete(client)
  }
}

async function startCapture(meta, child) {
  const key = meta.profileUniqueName || `port-${meta.debugPort}`
  if (captures.has(key)) return
  const state = { meta, browser: null, clients: new Set(), targets: new WeakSet(), stopped: false }
  captures.set(key, state)
  await writeProfileMeta(meta)
  enqueue(meta, { type: "PROFILE_CAPTURE_ARMED", source: "profile-chrome-cdp", direction: "local", policy: "passive-network-observation", noFetchInterception: true })
  try {
    if (!await waitForDebugPort(meta.debugPort)) throw new Error(`CDP port ${meta.debugPort} did not answer`)
    if (state.stopped) return
    const browser = await puppeteerCore.connect({ browserURL: `http://127.0.0.1:${meta.debugPort}`, defaultViewport: null })
    state.browser = browser
    enqueue(meta, { type: "PROFILE_CAPTURE_START", source: "profile-chrome-cdp", direction: "local", browserVersion: await browser.version().catch(() => ""), policy: "passive-network-observation", noFetchInterception: true })
    for (const target of browser.targets()) void attachTarget(state, target)
    browser.on("targetcreated", target => void attachTarget(state, target))
    browser.on("targetchanged", target => void attachTarget(state, target))
    browser.on("disconnected", () => stopCapture(key, "browser-disconnected"))
  } catch (e) {
    enqueue(meta, { type: "PROFILE_CAPTURE_ERROR", source: "profile-chrome-cdp", direction: "local", error: String(e?.message || e || "unknown") })
    captures.delete(key)
  }
  if (child?.once) child.once("exit", () => stopCapture(key, "process-exit"))
}

function stopCapture(key, reason = "stop") {
  const state = captures.get(key)
  if (!state || state.stopped) return
  state.stopped = true
  captures.delete(key)
  for (const client of state.clients) { try { client.detach().catch(() => {}) } catch {} }
  state.clients.clear()
  try { state.browser?.disconnect() } catch {}
  enqueue(state.meta, { type: "PROFILE_CAPTURE_STOP", source: "profile-chrome-cdp", direction: "local", reason })
}
function stopAllProfileCaptures() {
  for (const key of [...captures.keys()]) stopCapture(key, "app-shutdown")
}
function inspectChromeSpawn(command, args, child) {
  const meta = parseChromeLaunch(command, args, child)
  if (meta) void startCapture(meta, child)
  return meta
}

module.exports = { inspectChromeSpawn, stopAllProfileCaptures, learnProfileNamesFromBody, captureMode }
