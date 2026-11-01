"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {validate} = require("../scripts/verify-original-extensions");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kaizen-original-bundle-"));
const root = path.join(tmp, "KAIZEN_EXTENSIONS");
const profiles = [
  ["KAIZZEN_MAIN", "KAIZZEN-MAIN", "2.5.6"],
  ["KAIZZEN_GOOGLE", "KAIZZEN-GOOGLE", "1.0.3"],
  ["KAIZZEN_CUSTOM", "KAIZZEN-CUSTOM", "1.0.6"]
];
try {
  fs.mkdirSync(root);
  for (const [folder, name, version] of profiles) {
    const dir = path.join(root, folder);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      manifest_version: 3, name, version,
      action: {default_title: "KAIZEN"},
      background: {service_worker: "backgroundScript.js"}
    }));
    fs.writeFileSync(path.join(dir, "index.html"), "<main>Test local</main>");
    fs.writeFileSync(path.join(dir, "backgroundScript.js"), "// Local mock");
  }
  assert.equal(validate(root), true);
  const missing = path.join(root, "KAIZZEN_MAIN", "backgroundScript.js");
  fs.rmSync(missing);
  assert.throws(() => validate(root), /Archivo ausente/);
  fs.writeFileSync(missing, "// Local mock");
  const manifest = path.join(root, "KAIZZEN_GOOGLE", "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({
    manifest_version: 3, name: "KAIZZEN-GOOGLE", version: "0.0.1",
    action: {default_title: "KAIZEN"}, background: {service_worker: "backgroundScript.js"}
  }));
  assert.throws(() => validate(root), /Manifiesto no reconocido/);
  fs.rmSync(path.join(root, "KAIZZEN_CUSTOM"), {recursive: true});
  assert.throws(() => validate(root), /Carpeta ausente/);
  assert.throws(() => validate(path.join(tmp, "does-not-exist")), /No existe/);
  console.log("KAIZEN original extension bundle gate: PASS");
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}
