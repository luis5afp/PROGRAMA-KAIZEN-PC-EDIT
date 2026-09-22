const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const main = read("main.min.js");
const preload = read("preload.min.js");
const bundle = read("app_view/dist/assets/index-DAX2BPbP.js");
const util = read("util.min.js");

new Function(main);
new Function(preload);
new Function(bundle.replaceAll("import.meta", "({})"));
new Function(util);

assert(main.includes("function profileUpdateFromCatalog"), "catalog version fast path missing");
assert(main.includes("_0xcatalogUpdate===null?await isProfileUpdateAvailable"), "remote profile version check is not fallback-only");
assert(main.includes("extra /getversion request skipped"), "fast-path diagnostic marker missing");
assert(main.includes("_0xserverVersionToMark"), "downloaded profile version tracking missing");
assert(main.includes("synchronized profile version"), "applied profile version persistence missing");
assert(util.includes("return ok > 0"), "cookie import does not report application success");
assert(util.includes("if (!fs.existsSync(cookiesPath)) return false"), "cookie import missing-file result must be false");

assert(main.includes("async function prefetchExtensionsForProfiles"), "background extension prefetch helper missing");
assert(main.includes("ipcMain.handle('prefetch-profile-extensions'"), "extension prefetch IPC missing");
assert(preload.includes("prefetchExtensions: (data) => ipcRenderer.invoke('prefetch-profile-extensions'"), "extension prefetch bridge missing");
assert(bundle.includes("electron.prefetchExtensions({profiles:ue,token:k}).catch(()=>{})"), "catalog does not start non-blocking extension warmup");

const relayStart = main.indexOf("_0xrelayReadyPromise=Promise.resolve");
const catalogCheck = main.indexOf("profileUpdateFromCatalog(_0x3c11a7,_0x555f1b)");
const relayAwait = main.indexOf("if(_0xrelayReadyPromise){const _0xrelayReady=await _0xrelayReadyPromise");
const spawnIndex = main.indexOf("spawn(_0x34b1ed");
assert(relayStart >= 0, "proxy relay readiness promise missing");
assert(catalogCheck > relayStart, "catalog/profile preparation should overlap relay startup");
assert(relayAwait > catalogCheck, "proxy readiness is still awaited too early");
assert(spawnIndex > relayAwait, "browser spawn must still wait for proxy readiness");

const prefetchCall = bundle.indexOf("electron.prefetchExtensions({profiles:ue,token:k}).catch(()=>{})");
const catalogApply = bundle.indexOf("await L(ue);return", prefetchCall);
assert(prefetchCall >= 0 && catalogApply > prefetchCall, "extension warmup must start before catalog render completes");

console.log("KAIZEN faster profile-open scenarios: PASS");
console.log(" - catalog profileVersion fast path: PASS");
console.log(" - remote /getversion retained as fallback: PASS");
console.log(" - applied profile version persisted after successful cookie import: PASS");
console.log(" - assigned extensions warmed in background: PASS");
console.log(" - proxy relay preparation overlaps other launch work: PASS");
console.log(" - browser still waits for relay readiness before spawn: PASS");
