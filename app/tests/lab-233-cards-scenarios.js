"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const lab=require("../lab/kaizen-233-core");
const root=path.resolve(__dirname,"../lab");

function blankFields(){return {email:{value:""},password:{value:""}};}
const cards=lab.makeCatalog("authorized");
const stats=lab.metrics(cards);
assert.deepEqual(stats,{received:233,authorized:233,restricted:0,credentialPairs:233,eligible:233});
assert.equal(new Set(cards.map(c=>c.id)).size,233,"cada tarjeta ficticia tiene ID único");
assert(cards.every(card=>card.synthetic===true&&card.isLock===false));
assert(cards.every(card=>card.d.endsWith(".invalid/login")));
assert(cards.every(card=>card.e.endsWith("@kaizen.invalid")));
assert(cards.every(card=>card.k.startsWith("SOLO-PRUEBA-")));

let completed=0;
for(const card of cards){
  const origin=new URL(card.d).origin;
  const session=lab.beginAutofill(card,origin,1000);
  assert.equal(session.ok,true);
  const fields=blankFields();
  const result=lab.fillFakeForm(fields,session,origin,1001);
  assert.equal(result.ok,true);
  assert.equal(fields.email.value,card.e);
  assert.equal(fields.password.value,card.k);
  completed++;
}
assert.equal(completed,233,"todos los formularios simulados deben autocompletarse");

const first=cards[0];
const origin=new URL(first.d).origin;
const active=lab.beginAutofill(first,origin,3000);
const denied=blankFields();
assert.equal(lab.fillFakeForm(denied,active,"https://foreign.invalid",3001).reason,
  "origin-mismatch");
assert.equal(denied.email.value,"");
assert.equal(lab.fillFakeForm(denied,active,origin,active.expiresAt+1).reason,"expired");
assert.equal(denied.password.value,"");
assert.equal(lab.beginAutofill(first,"https://foreign.invalid",3000).reason,"origin-mismatch");

const blocked=lab.makeCatalog("locked");
assert.deepEqual(lab.metrics(blocked),
  {received:233,authorized:0,restricted:233,credentialPairs:0,eligible:0});
assert(blocked.every(card=>lab.beginAutofill(card,new URL(card.d).origin).reason==="locked"));
const missing=lab.makeCatalog("missing-credentials");
assert.deepEqual(lab.metrics(missing),
  {received:233,authorized:233,restricted:0,credentialPairs:0,eligible:0});
assert(missing.every(card=>lab.beginAutofill(card,new URL(card.d).origin).reason==="missing-credentials"));

assert.equal(lab.beginAutofill({...first,synthetic:false},origin).reason,"not-lab-data");
assert.throws(()=>lab.makeCatalog("unknown"),RangeError);
assert.throws(()=>lab.makeCatalog("authorized",234),RangeError);

const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const ui=fs.readFileSync(path.join(root,"kaizen-233-ui.js"),"utf8");
const core=fs.readFileSync(path.join(root,"kaizen-233-core.js"),"utf8");
new Function(ui);
new Function(core);
assert(html.includes("connect-src 'none'"),"Content Security Policy must disable network connections");
assert(html.includes("form-action 'none'"),"Form must not submit");
assert(html.includes('src="./kaizen-233-core.js"'));
assert(html.includes('src="./kaizen-233-ui.js"'));
assert(!/(?:\bfetch\s*\(|XMLHttpRequest|sendBeacon|chrome\.storage|localStorage|sessionStorage|form\.submit\s*\()/i.test(ui),
  "lab UI must not send or persist data");
assert(!/(?:\bfetch\s*\(|XMLHttpRequest|sendBeacon|chrome\.storage|localStorage|sessionStorage|form\.submit\s*\()/i.test(core),
  "lab core must not send or persist data");
const originalRoot=path.resolve(__dirname,"../../runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS");
for(const [profile,asset] of [
  ["KAIZZEN_MAIN","index-B-06emjA.js"],
  ["KAIZZEN_GOOGLE","index-DhjpRuHp.js"],
  ["KAIZZEN_CUSTOM","index-DtDn-2PW.js"]
]){
  const real=fs.readFileSync(path.join(originalRoot,profile,"assets",asset),"utf8");
  assert(real.includes('kZ=t=>!!(t?.isLock||(t?.is_premium&&t.isLock!==false))'),
    profile+" must retain real server authorization");
  assert(real.includes("Página pública abierta sin sesión gestionada"),
    profile+" must retain public-only behavior for locked cards");
}
const main=fs.readFileSync(path.join(__dirname,"..","main.kaizen-1.5.24.js"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,"..","package.json"),"utf8"));
assert.equal(pkg.version,"1.5.41");
for(const marker of [
  "openLaboratoryWindow",
  "Laboratorio 233 tarjetas · SOLO PRUEBAS",
  'partition:"kaizen-1541-lab-memory-only"',
  "nodeIntegration:false",
  "contextIsolation:true",
  "sandbox:true",
  "webSecurity:true",
  'setWindowOpenHandler(()=>({action:"deny"}))',
  "setPermissionRequestHandler",
  "setPermissionCheckHandler",
  'path.join(__dirname,"lab","index.html")'
])assert(main.includes(marker),"El menú Electron debe integrar el laboratorio aislado: "+marker);
assert(!main.includes("app/lab/index.html?token="),"No deben inyectarse tokens en el laboratorio");
console.log("PASS: 233 ficticias recibidas, 233 autorizadas, 0 restringidas, 233 credenciales ficticias y 233 simulaciones de autocompletado.");
console.log("PASS: 233 bloqueadas no rellenan, 233 sin credenciales no rellenan, dominio/TTL verificados, sin red ni persistencia.");
