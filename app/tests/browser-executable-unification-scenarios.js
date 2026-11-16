"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {bundledChromiumExecutable}=require("../kaizen-chromium-path");

// On Windows, the official Chromium binary is beside KAIZEN's EXE.
// It is never resolved relative to resources/, Chrome for Testing, or PATH.
const installRoot=path.resolve(__dirname,"..","..");
const official=path.join(installRoot,"KAIZEN_CHROMIUM","chrome-win","chrome.exe");
assert.equal(
  bundledChromiumExecutable(true,path.join(installRoot,"KAIZEN-PC.exe")),
  official
);
assert.equal(
  bundledChromiumExecutable(false,"ignored",path.join(installRoot,"app")),
  official
);

const appRoot=path.join(__dirname,"..");
const host=fs.readFileSync(path.join(appRoot,"kaizen-original-extensions-host.js"),"utf8");
const legacy=fs.readFileSync(path.join(appRoot,"main.min.js"),"utf8");
const readme=fs.readFileSync(path.join(installRoot,"README.md"),"utf8");

assert(host.includes('require("./kaizen-chromium-path")'));
assert(host.includes("bundledChromiumExecutable(app.isPackaged)"));
assert(host.includes("spawn(chrome,args"));
assert(host.includes('"--disable-extensions-except="+loadPaths'));
assert(host.includes('"--load-extension="+loadPaths'));

// Evaluate the legacy launcher browser lookup without loading or running its
// obfuscated Electron core. Both the guest/local and classic profile modes
// must resolve to the exact same executable as the explicit selector.
const table=legacy.match(
  /const KAIZEN_CHROMIUM_EXE=require\('\.\/kaizen-chromium-path'\)\.bundledChromiumExecutable\(app\.isPackaged\),BROWSER_PATHS=\{'nstchrome':KAIZEN_CHROMIUM_EXE,'chrome':KAIZEN_CHROMIUM_EXE\}/
);
assert(table,"El launcher heredado debe usar la ruta Chromium compartida");
const selected=vm.runInNewContext(table[0]+";BROWSER_PATHS",{
  app:{isPackaged:true},
  require:request=>{
    assert.equal(request,"./kaizen-chromium-path");
    return {bundledChromiumExecutable:()=>official};
  }
});
assert.equal(selected.chrome,official);
assert.equal(selected.nstchrome,official);
assert(!legacy.includes("path['join'](basePath,_0x305491(0x25d),_0x305491(0x15f))"),
  "No debe usar el navegador antiguo dentro de resources/");
assert(legacy.includes("Falta Chromium oficial incluido; instala el Setup completo"),
  "No debe recurrir a un navegador viejo si falta Chromium");
assert(legacy.includes("const _0x220fcc=_0x323ee9===_0x4de0c3(0x183)"),
  "Mantener los modos de perfil diferenciados aunque el EXE sea común");
assert(legacy.includes("_0x24524b[_0x4de0c3(0x278)]&&_0x386b41"),
  "La ruta heredada debe solicitar sus extensiones también en Chromium oficial");
assert(legacy.includes("guest-open-profile")&&legacy.includes("openBrowserGuarded"),
  "El botón Invitado conserva su catálogo local y su flujo de apertura");
assert(readme.includes("El paquete NSIS incluye"),
  "Las actualizaciones deben usar un instalador completo con metadatos");

console.log("PASS: Invitado y Perfiles Chromium comparten Chromium oficial sin mezclar perfiles.");
