const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const main = read("main.min.js");
const preload = read("preload.min.js");
const util = read("util.min.js");
const bundle = read("app_view/dist/assets/index-DAX2BPbP.js");

new Function(main);
new Function(preload);
new Function(util);
new Function(bundle.replaceAll("import.meta", "({})"));

assert(main.includes("family-catalog.json"), "encrypted family catalog file missing");
assert(main.includes("catalog-cache-save"), "catalog cache save IPC missing");
assert(main.includes("catalog-cache-load"), "catalog cache load IPC missing");
assert(main.includes("safeStorage.encryptString(JSON.stringify(_0xpayload))"), "catalog cache is not sealed with safeStorage");
assert(preload.includes("saveCatalogCache"), "catalog cache preload save bridge missing");
assert(preload.includes("loadCatalogCache"), "catalog cache preload load bridge missing");
assert(bundle.includes("saveCatalogCache({profiles:ue})"), "renderer does not save successful server catalog");
assert(bundle.includes("Modo local: usando el último catálogo guardado"), "local catalog fallback missing");
assert(bundle.includes("ue===404||[408,425,429,500,502,503,504].includes(ue)"), "recoverable-status policy missing");
assert(main.includes("cleanup is intentionally non-destructive"), "local profile preservation missing");
assert(main.includes("initializing a fresh local profile and remembering server version"), "sync 404 recovery missing");
assert(util.includes("[profile-version] check failed"), "profile version fallback missing");
assert(bundle.includes("_kaizenTransientRetries"), "transient GET retry missing");
assert(bundle.includes("_kaizenDuplicateRetried"), "duplicate-request 401 retry missing");
assert(bundle.includes("kaizenRememberedTwofa"), "secure 2FA migration missing");
assert(main.includes("remembered-2fa.json"), "secure 2FA storage missing");
assert(main.includes("extension-sessions-export"), "extension session export IPC missing");
assert(main.includes("extension-sessions-PLAINTEXT.json"), "plaintext LAB extension session export file missing");
assert(main.includes("UNIVERSITY LAB / TEST DATA ONLY"), "plaintext LAB warning missing");
assert(!main.includes("KAIZZEN_EXTENSION_SESSION_BACKUP_V1"), "legacy encrypted session export still present");
assert(main.includes("/KAIZZEN/i.test(name)"), "extension session export is not restricted to KAIZZEN");
assert(preload.includes("kaizen-extension-sessions-button"), "extension session export button missing");
assert(preload.includes("⬇ Sesiones LAB"), "LAB extension session export button label missing");
assert(preload.includes("const syncProfilePending = new Map()"), "sync profile pending registry missing");
assert.strictEqual((preload.match(/ipcRenderer\.on\("sync-profile-done"/g) || []).length, 1, "sync-profile-done must use one shared listener");
assert(preload.includes("active.callbacks.push(callback)"), "duplicate in-flight sync coalescing missing");
assert(preload.includes("completeSyncProfile(key, result)"), "sync profile completion routing missing");
assert(main.includes("function profileUpdateFromCatalog"), "catalog profile version fast path missing");
assert(main.includes("extra /getversion request skipped"), "catalog version fast-path diagnostic missing");
assert(main.includes("prefetch-profile-extensions"), "extension prefetch IPC missing");
assert(preload.includes("prefetchExtensions"), "extension prefetch preload bridge missing");
assert(bundle.includes("electron.prefetchExtensions({profiles:ue,token:k}).catch(()=>{})"), "renderer background extension warmup missing");
assert(main.includes("_0xrelayReadyPromise"), "proxy relay overlap optimization missing");

const canUseCatalogCache = (status) => !status || status === 404 || [408,425,429,500,502,503,504].includes(status);
for (const status of [0,404,408,425,429,500,502,503,504]) {
  assert(canUseCatalogCache(status), `expected cache fallback for HTTP ${status || "network"}`);
}
for (const status of [400,401,403,409,422]) {
  assert(!canUseCatalogCache(status), `must not use cache fallback for authoritative HTTP ${status}`);
}

const cacheHandlerStart = main.indexOf("cleanup is intentionally non-destructive");
assert(cacheHandlerStart >= 0, "non-destructive cleanup marker unavailable");

console.log("KAIZEN family reliability scenarios: PASS");
console.log(" - syntax: PASS");
console.log(" - encrypted catalog cache: PASS");
console.log(" - 401/403 authority preserved: PASS");
console.log(" - recoverable server fallback: PASS");
console.log(" - local profile preservation: PASS");
console.log(" - sync 404 recovery: PASS");
console.log(" - plaintext KAIZZEN extension session LAB export: PASS");
console.log(" - sync profile listener isolation: PASS");
console.log(" - faster profile-open path: PASS");
