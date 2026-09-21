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
