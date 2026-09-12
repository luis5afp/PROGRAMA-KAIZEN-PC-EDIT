from pathlib import Path
import json

p = Path('app/inspector/connectionCapture.js')
s = p.read_text(encoding='utf-8')

marker = 'const hash = b => crypto.createHash("sha256").update(b).digest("hex")\n'
if 'const safeName = value =>' not in s:
    if marker not in s:
        raise SystemExit('hash marker missing in connectionCapture.js')
    s = s.replace(marker, marker + 'const safeName = value => String(value || "extension").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 140) || "extension"\n', 1)

helper = '''function extensionDownloadInfo(value) {
  try {
    const u = new URL(String(value || ""))
    const raw = u.searchParams.get("filepath") || ""
    let decoded = raw
    try { decoded = decodeURIComponent(raw) } catch {}
    const normalized = decoded.replace(/\\\\/g, "/").replace(/^\\/+/, "")
    const marker = "extensionsData/"
    const index = normalized.toLowerCase().indexOf(marker.toLowerCase())
    if (index === -1) return null
    const tail = normalized.slice(index + marker.length).replace(/^\\/+/, "")
    if (!tail || tail.includes("../")) return null
    const fileName = path.posix.basename(tail)
    const baseName = safeName(fileName.replace(/\\.zip$/i, ""))
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
    await fsp.appendFile(path.join(extRoot, "original-downloads.ndjson"), `${JSON.stringify(record)}\\n`, "utf8")
  } catch (error) {
    console.warn("[inspector-ext] original extension archive skipped:", error?.message || error)
  }
}

'''
anchor = 'async function append(entry, body, opts = {}) {'
if 'function extensionDownloadInfo(value)' not in s:
    if anchor not in s:
        raise SystemExit('append anchor missing in connectionCapture.js')
    s = s.replace(anchor, helper + anchor, 1)

call_anchor = '    if (body == null && row.bodyText && textMime(entry.mimeType || "")) { try { learnProfileNamesFromBody(Buffer.from(String(row.bodyText), "utf8"), entry.mimeType || "") } catch {} }\n    const file = eventFile(row)'
call_new = '    if (body == null && row.bodyText && textMime(entry.mimeType || "")) { try { learnProfileNamesFromBody(Buffer.from(String(row.bodyText), "utf8"), entry.mimeType || "") } catch {} }\n    await preserveExtensionArchive(dir, row)\n    const file = eventFile(row)'
if 'await preserveExtensionArchive(dir, row)' not in s:
    if call_anchor not in s:
        raise SystemExit('append preservation insertion point missing')
    s = s.replace(call_anchor, call_new, 1)

p.write_text(s, encoding='utf-8')

p = Path('app/inspector/extensionSnapshot.js')
s = p.read_text(encoding='utf-8')

old = '      const siblingZip = `${dir}.zip`\n      const id = extensionIdForDir(dir, manifest)'
new = '      const siblingZip = `${dir}.zip`\n      const capturedZip = path.join(originalDir, `${baseName}.zip`)\n      const id = extensionIdForDir(dir, manifest)'
if 'const capturedZip = path.join(originalDir' not in s:
    if old not in s:
        raise SystemExit('siblingZip marker missing in extensionSnapshot.js')
    s = s.replace(old, new, 1)

old_block = '''      try {
        const stat = await fsp.stat(siblingZip)
        if (stat.isFile()) {
          const destName = `${baseName}.zip`
          const dest = path.join(originalDir, destName)
          await fsp.copyFile(siblingZip, dest)
          item.preservation = {
            type: "original-zip-byte-for-byte",
            file: `original/${destName}`,
            bytes: stat.size,
            sha256: await sha256File(dest),
          }
        }
      } catch {}'''
new_block = '''      for (const sourceZip of [capturedZip, siblingZip]) {
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
      }'''
if 'source: sourceZip === capturedZip ? "diagnostic-response-archive"' not in s:
    if old_block not in s:
        raise SystemExit('ZIP preservation block missing in extensionSnapshot.js')
    s = s.replace(old_block, new_block, 1)

s = s.replace(
    'Original ZIP files are copied byte-for-byte when available. Folder-only extensions preserve each file byte-for-byte with per-file SHA-256.',
    'Downloaded ZIP responses are preserved as exact bytes when available. Folder-only extensions preserve each file byte-for-byte with per-file SHA-256.'
)
p.write_text(s, encoding='utf-8')

pkgp = Path('app/package.json')
pkg = json.loads(pkgp.read_text(encoding='utf-8'))
pkg['version'] = '1.5.9'
pkgp.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
