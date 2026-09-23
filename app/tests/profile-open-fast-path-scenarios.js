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

assert(!main.includes("async function prefetchExtensionsForProfiles"), "background extension prefetch helper reintroduced");
assert(!main.includes("prefetch-profile-extensions"), "background extension prefetch IPC reintroduced");
assert(!preload.includes("prefetchExtensions:"), "background extension prefetch bridge reintroduced");
assert(!bundle.includes("electron.prefetchExtensions({profiles:ue,token:k})"), "catalog extension warmup reintroduced");
assert(main.includes("launch failed for"), "structured launch failure handling missing");
assert(main.includes("return{error:!![],message:_0xmessage,profileUniqueName:_0xkey}"), "main does not return a structured launch error");
assert(bundle.includes('if(Q&&Q.error)throw new Error(Q.message||"No se pudo abrir el perfil")'), "renderer does not recognize structured launch errors");
assert(bundle.includes('se.status="play"'), "renderer does not restore play state after a launch error");
assert(bundle.includes('Ye.error(Q?.message||"No se pudo abrir el perfil")'), "renderer does not surface the launch error");

const relayStart = main.indexOf("_0xrelayReadyPromise=Promise.resolve");
const catalogCheck = main.indexOf("profileUpdateFromCatalog(_0x3c11a7,_0x555f1b)");
const relayAwait = main.indexOf("if(_0xrelayReadyPromise){const _0xrelayReady=await _0xrelayReadyPromise");
const spawnIndex = main.indexOf("spawn(_0x34b1ed");
assert(relayStart >= 0, "proxy relay readiness promise missing");
assert(catalogCheck > relayStart, "catalog/profile preparation should overlap relay startup");
assert(relayAwait > catalogCheck, "proxy readiness is still awaited too early");
assert(spawnIndex > relayAwait, "browser spawn must still wait for proxy readiness");

console.log("KAIZEN faster profile-open scenarios: PASS");
console.log(" - catalog profileVersion fast path: PASS");
console.log(" - remote /getversion retained as fallback: PASS");
console.log(" - applied profile version persisted after successful cookie import: PASS");
console.log(" - background extension prefetch disabled: PASS");
console.log(" - failed launch restores profile button: PASS");
console.log(" - proxy relay preparation overlaps other launch work: PASS");
console.log(" - browser still waits for relay readiness before spawn: PASS");
