"use strict";
// Verifica la compatibilidad de roles Android/Windows sin tocar el servidor.
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const bundle = fs.readFileSync(
  path.join(__dirname, "..", "app_view", "dist", "assets", "index-DAX2BPbP.js"),
  "utf8"
);
const expected='iN=["appcbl_soft","admin","specific","member","all_profile","manager"]';
assert.equal(bundle.split(expected).length-1,1,"La lista de seis roles debe aparecer exactamente una vez");
assert(bundle.includes('!iN.includes(v.role)'),"Debe conservarse la validación de rol del usuario");
assert(bundle.includes('n.role==="admin"?'),"Los privilegios y la interfaz de admin deben permanecer separados");
assert(bundle.includes('/api/verify-token'),"Debe conservarse la consulta real de sesión al servidor");
assert(bundle.includes('/api/users/login'),"Debe conservarse el inicio de sesión oficial");
assert(bundle.includes('/api/browser/get'),"Debe conservarse la consulta remota del catálogo");
assert(bundle.includes('/api/users/2fa/email/verify'),"Debe conservarse el flujo 2FA por correo");
assert(!bundle.includes('iN=["appcbl_soft","admin","specific","all_profile","manager"]'),
  "No debe permanecer la lista antigua de cinco roles");
const roleList=["appcbl_soft","admin","specific","member","all_profile","manager"];
assert.equal(roleList.includes("member"),true);
assert.equal(roleList.includes("anonymous"),false);
console.log("KAIZEN member-role compatibility: PASS");
