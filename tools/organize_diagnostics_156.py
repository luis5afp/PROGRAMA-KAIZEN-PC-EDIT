from pathlib import Path
import json
import re

FILES = [
    Path('app/inspector/connectionCapture.js'),
    Path('app/inspector/profileChromeCapture.js'),
]

HELPER = '''function eventFile(entry) {\n  const t = String(entry?.type || "EVENT").toUpperCase()\n  if (t === "PROXY") return "proxy.ndjson"\n  if (t.includes("ERROR") || t.includes("FAILED")) return "errors.ndjson"\n  if (t.startsWith("WEBSOCKET")) return "websocket.ndjson"\n  if (t.startsWith("EVENTSOURCE")) return "sse.ndjson"\n  if (t === "REQUEST" || t === "REQUEST_EXTRA") return "requests.ndjson"\n  if (t === "RESPONSE" || t === "RESPONSE_EXTRA") return "responses.ndjson"\n  return "events.ndjson"\n}\n\n'''

for p in FILES:
    s = p.read_text(encoding='utf-8')
    if 'function eventFile(entry)' not in s:
        marker = 'const headers = h => {'
        if marker not in s:
            raise SystemExit(f'headers marker missing in {p}')
        s = s.replace(marker, HELPER + marker, 1)

    first_pat = re.compile(r'(?m)^(?P<i>[ \t]*)await fsp\.appendFile\(path\.join\(dir, "conexion"\), line, "utf8"\)\s*$')
    s, first_n = first_pat.subn(lambda m: f'{m.group("i")}await fsp.appendFile(path.join(dir, eventFile(row)), line, "utf8")', s, count=1)
    if first_n != 1:
        raise SystemExit(f'primary combined output line missing in {p}')

    second_pat = re.compile(r'(?m)^[ \t]*await fsp\.appendFile\(path\.join\(dir, "conexion\.ndjson"\), line, "utf8"\)\s*\n?')
    s, second_n = second_pat.subn('', s, count=1)
    if second_n != 1:
        raise SystemExit(f'duplicate combined output line missing in {p}')

    p.write_text(s, encoding='utf-8')

pkgp = Path('app/package.json')
pkg = json.loads(pkgp.read_text(encoding='utf-8'))
pkg['version'] = '1.5.6'
pkgp.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

for p in FILES:
    s = p.read_text(encoding='utf-8')
    for name in ['requests', 'responses', 'proxy', 'websocket', 'sse', 'errors', 'events']:
        if f'return "{name}.ndjson"' not in s:
            raise SystemExit(f'{name}.ndjson routing missing in {p}')
    if 'path.join(dir, "conexion")' in s or 'path.join(dir, "conexion.ndjson")' in s:
        raise SystemExit(f'legacy combined output still present in {p}')

print('Diagnostics output split successfully for 1.5.6')
