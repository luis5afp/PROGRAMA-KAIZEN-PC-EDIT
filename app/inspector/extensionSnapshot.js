"use strict"

const { app } = require("electron")
const fs = require("fs")
const fsp = require("fs/promises")
const path = require("path")
const crypto = require("crypto")
const childProcess = require("child_process")

let patched = false
const libraryPromises = new Map()
const scheduledProfiles = new Set()

const now = () => new Date().toISOString()
const safeName = value => String(value || "unknown").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 140) || "unknown"
const runtimeBase = () => app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..")
const dayRoot = () => path.join(app.getPath("userData"), "KAIZEN-Inspector", "conexion", now().slice(0, 10))

function chromeExtensionIdFromHex(hex) {
  return [...String(hex || "").slice(0, 32)].map(ch => String.fromCharCode(97 + parseInt(ch, 16))).join("")
}

function extensionIdForDir(dir, manifest) {
  try {
    if (manifest?.key) {
      const digest = crypto.createHash("sha256").update(Buffer.from(String(manifest.key), "base64")).digest("hex")
      return chromeExtensionIdFromHex(digest)
    }
  } catch {}
  try {
    let normalized = path.resolve(dir)
    if (/^[a-z]:/i.test(normalized)) normalized = normalized[0].toUpperCase() + normalized.slice(1)
    const digest = crypto.createHash("sha256").update(Buffer.from(normalized, "utf16le")).digest("hex")
    return chromeExtensionIdFromHex(digest)
  } catch { return "" }
}

async function sha256File(file) {
  return await new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256")
    const stream = fs.createReadStream(file)
    stream.on("data", chunk => h.update(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(h.digest("hex")))
  })
}

async function fileInventory(root) {
  const out = []
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) {
        const stat = await fsp.stat(full)
        out.push({
          path: path.relative(root, full).replace(/\\/g, "/"),
          bytes: stat.size,
          sha256: await sha256File(full),
        })
      }
    }
  }
  await walk(root)
  return out
}

async function readManifest(dir) {
  try { return JSON.parse(await fsp.readFile(path.join(dir, "manifest.json"), "utf8")) } catch { return null }
}

async function candidateExtensionDirs() {
  const base = runtimeBase()
  const candidates = []
  const fixed = [
    path.join(base, "extensionForSecurity", "ex1"),
    path.join(base, "extensionForSecurity", "ex2"),
    path.join(base, "proxy"),
  ]
  for (const dir of fixed) {
    try { if ((await fsp.stat(path.join(dir, "manifest.json"))).isFile()) candidates.push(dir) } catch {}
  }
  const library = path.join(base, "extensionsData")
  try {
    for (const entry of await fsp.readdir(library, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(library, entry.name)
      try { if ((await fsp.stat(path.join(dir, "manifest.json"))).isFile()) candidates.push(dir) } catch {}
    }
  } catch {}
  return [...new Set(candidates.map(x => path.resolve(x)))]
}

async function buildLibrary(root) {
  const extRoot = path.join(root, "extensions")
  const originalDir = path.join(extRoot, "original")
  const unpackedDir = path.join(extRoot, "unpacked")
  await fsp.mkdir(originalDir, { recursive: true })
  await fsp.mkdir(unpackedDir, { recursive: true })

  const catalog = []
  for (const dir of await candidateExtensionDirs()) {
    try {
      const manifest = await readManifest(dir)
      if (!manifest) continue
      const baseName = safeName(path.basename(dir))
      const siblingZip = `${dir}.zip`
      const capturedZip = path.join(originalDir, `${baseName}.zip`)
      const id = extensionIdForDir(dir, manifest)
      const item = {
        id,
        name: manifest.name || baseName,
        version: manifest.version || "",
        manifestVersion: manifest.manifest_version ?? null,
        sourceFolder: dir,
        capturedAt: now(),
        preservation: null,
      }

      for (const sourceZip of [capturedZip, siblingZip]) {
        try {
          const stat = await fsp.stat(sourceZip)
          if (!stat.isFile()) continue
          const destName = `${baseName}.zip`
          const dest = path.join(originalDir, destName)
          if (path.resolve(sourceZip).toLowerCase() !== path.resolve(dest).toLowerCase()) await fsp.copyFile(sourceZip, dest)
          item.preservation = {
            type: "original-zip-byte-for-byte",
            file: `original/${destName}`,
            bytes: stat.size,
            sha256: await sha256File(dest),
            source: sourceZip === capturedZip ? "diagnostic-response-archive" : "runtime-sibling-zip",
          }
          break
        } catch {}
      }

      if (!item.preservation) {
        const dest = path.join(unpackedDir, baseName)
        await fsp.rm(dest, { recursive: true, force: true })
        await fsp.cp(dir, dest, { recursive: true, force: true, errorOnExist: false })
        const files = await fileInventory(dest)
        item.preservation = {
          type: "unpacked-folder-exact-file-bytes",
          folder: `unpacked/${baseName}`,
          files,
        }
      }
      catalog.push(item)
    } catch (error) {
      console.warn("[inspector-ext] extension snapshot skipped:", error?.message || error)
    }
  }

  const index = {
    format: "KAIZZEN_EXTENSION_LIBRARY_V1",
    capturedAt: now(),
    scope: "KAIZEN-managed extensions only",
    note: "Downloaded ZIP responses are preserved as exact bytes when available. Folder-only extensions preserve each file byte-for-byte with per-file SHA-256.",
    extensions: catalog,
  }
  await fsp.writeFile(path.join(extRoot, "extensions.json"), JSON.stringify(index, null, 2), "utf8")
  return index
}

function ensureLibrary(root) {
  if (!libraryPromises.has(root)) {
    const promise = buildLibrary(root).catch(error => {
      console.warn("[inspector-ext] library snapshot failed:", error?.message || error)
      return { format: "KAIZZEN_EXTENSION_LIBRARY_V1", extensions: [], error: String(error?.message || error || "unknown") }
    })
    libraryPromises.set(root, promise)
  }
  return libraryPromises.get(root)
}

function parseChromeLaunch(command, args, child) {
  try {
    const exe = path.basename(String(command || "")).toLowerCase()
    if (!(exe === "chrome.exe" || exe === "chrome" || exe.includes("chrom"))) return null
    const list = Array.isArray(args) ? args.map(String) : []
    const portArg = list.find(x => x.startsWith("--remote-debugging-port="))
    const dataArg = list.find(x => x.startsWith("--user-data-dir="))
    if (!portArg || !dataArg) return null
    const debugPort = Number(portArg.slice("--remote-debugging-port=".length)) || 0
    if (!debugPort) return null
    const raw = dataArg.slice("--user-data-dir=".length).replace(/^[\"']|[\"']$/g, "")
    const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "")
    const profileFolder = normalized.split("/").filter(Boolean).pop() || `port-${debugPort}`
    const explicitPaths = []
    for (const arg of list) {
      if (!arg.startsWith("--load-extension=")) continue
      const value = arg.slice("--load-extension=".length)
      for (const p of value.split(",")) if (p.trim()) explicitPaths.push(path.resolve(p.trim().replace(/^[\"']|[\"']$/g, "")))
    }
    return {
      profileFolder,
      profileUniqueName: `${profileFolder}.zip`,
      debugPort,
      browserPid: Number(child?.pid || 0),
      browserExecutable: String(command || ""),
      explicitPaths,
    }
  } catch { return null }
}

async function activeExtensionIds(port) {
  const ids = new Set()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`)
    if (!res.ok) return ids
    const targets = await res.json()
    for (const target of Array.isArray(targets) ? targets : []) {
      const text = `${target?.url || ""} ${target?.title || ""}`
      const matches = text.match(/chrome-extension:\/\/([a-p]{32})/gi) || []
      for (const match of matches) {
        const m = /chrome-extension:\/\/([a-p]{32})/i.exec(match)
        if (m) ids.add(m[1].toLowerCase())
      }
    }
  } catch {}
  return ids
}

async function writeProfileExtensionIndex(meta) {
  const root = dayRoot()
  const library = await ensureLibrary(root)
  const activeIds = await activeExtensionIds(meta.debugPort)
  const explicit = new Set(meta.explicitPaths.map(x => path.resolve(x).toLowerCase()))
  const matched = []

  for (const ext of library.extensions || []) {
    const source = String(ext.sourceFolder || "")
    const active = ext.id && activeIds.has(String(ext.id).toLowerCase())
    const explicitLoaded = explicit.has(path.resolve(source).toLowerCase())
    if (active || explicitLoaded) matched.push({ ...ext, activeDetected: active, explicitLoadArgument: explicitLoaded })
  }

  const profileDir = path.join(root, "profiles", safeName(meta.profileUniqueName))
  await fsp.mkdir(profileDir, { recursive: true })
  const payload = {
    format: "KAIZZEN_PROFILE_EXTENSIONS_V1",
    capturedAt: now(),
    profileUniqueName: meta.profileUniqueName,
    profileFolder: meta.profileFolder,
    debugPort: meta.debugPort,
    browserPid: meta.browserPid,
    browserExecutable: meta.browserExecutable,
    scope: "KAIZEN-managed extensions only; no arbitrary Chrome extension enumeration",
    library: "../../extensions/extensions.json",
    activeExtensionIds: [...activeIds].sort(),
    extensions: matched,
  }
  await fsp.writeFile(path.join(profileDir, "extensions.json"), JSON.stringify(payload, null, 2), "utf8")
  console.log(`[inspector-ext] preserved ${matched.length} KAIZEN-managed extension(s) for ${meta.profileUniqueName}`)
}

function scheduleSnapshot(meta) {
  const key = `${meta.profileUniqueName}:${meta.browserPid}`
  if (scheduledProfiles.has(key)) return
  scheduledProfiles.add(key)
  const timer = setTimeout(() => {
    void writeProfileExtensionIndex(meta).catch(error => console.warn("[inspector-ext] profile extension index failed:", error?.message || error))
  }, 15000)
  try { timer.unref() } catch {}
}

function startExtensionSnapshotCapture() {
  if (patched) return
  patched = true
  const original = childProcess.spawn
  childProcess.spawn = function (command, args, options) {
    const child = original.apply(this, arguments)
    try {
      const meta = parseChromeLaunch(command, args, child)
      if (meta) scheduleSnapshot(meta)
    } catch {}
    return child
  }
  console.log("[inspector-ext] KAIZEN-managed extension preservation armed; snapshot delayed 15s to avoid startup impact")
}

module.exports = { startExtensionSnapshotCapture }
