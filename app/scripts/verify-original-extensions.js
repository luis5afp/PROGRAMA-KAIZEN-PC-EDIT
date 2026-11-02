"use strict";

// Verifica archivos y versiones reales, no fixtures de las pruebas unitarias.
// Ejecutar sobre la carpeta que se entregará junto al .exe de Windows.
const fs = require("node:fs");
const path = require("node:path");

const profiles = [
  {folder: "KAIZZEN_MAIN", name: "KAIZZEN-MAIN", version: "2.5.9"},
  {folder: "KAIZZEN_GOOGLE", name: "KAIZZEN-GOOGLE", version: "1.0.6"},
  {folder: "KAIZZEN_CUSTOM", name: "KAIZZEN-CUSTOM", version: "1.0.9"}
];

function fail(message) {
  throw new Error("[paquetes originales] " + message);
}
function regularFile(file, root) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(root + path.sep)) fail("Ruta fuera del paquete: " + file);
  if (!fs.existsSync(resolved)) fail("Archivo ausente: " + file);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("Archivo no regular: " + file);
  return resolved;
}
function validate(input) {
  const base = path.resolve(input || "");
  if (!input || !fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    fail("No existe KAIZEN_EXTENSIONS. No se puede distribuir un portable incompleto.");
  }
  for (const {folder, name, version} of profiles) {
    const ext = path.join(base, folder);
    if (!fs.existsSync(ext) || !fs.lstatSync(ext).isDirectory() || fs.lstatSync(ext).isSymbolicLink()) {
      fail("Carpeta ausente o inválida: " + folder);
    }
    const manifest = JSON.parse(fs.readFileSync(regularFile(path.join(ext, "manifest.json"), base), "utf8"));
    if (manifest.manifest_version !== 3 || manifest.name !== name || manifest.version !== version ||
        manifest.action?.default_title !== "KAIZEN" || Object.hasOwn(manifest, "key")) {
      fail("Manifiesto no reconocido para " + folder + " (se requiere " + name + " " + version + ")");
    }
    const worker = manifest.background?.service_worker;
    if (typeof worker !== "string" || !worker || path.isAbsolute(worker) ||
        worker.split(/[\\/]/).some(part => !part || part === "." || part === "..")) {
      fail("Service worker inválido en " + folder);
    }
    regularFile(path.join(ext, "index.html"), base);
    regularFile(path.join(ext, worker), base);
    console.log("[paquetes originales] OK: " + name + " v" + version);
  }
  return true;
}

if (require.main === module) {
  try {
    validate(process.argv[2]);
    console.log("[paquetes originales] Los tres paquetes tienen archivos y versiones esperados.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = {validate};
