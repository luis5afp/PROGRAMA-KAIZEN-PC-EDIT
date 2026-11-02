"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../../runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS");
const specs=[
  ["KAIZZEN_MAIN","KAIZZEN-MAIN","2.5.9","index-B-06emjA.js"],
  ["KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.6","index-DhjpRuHp.js"],
  ["KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.9","index-DtDn-2PW.js"]
];
for(const [folder,name,version,file] of specs){
  const dir=path.join(root,folder);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"),"utf8"));
  assert.equal(manifest.name,name);
  assert.equal(manifest.version,version);
  const src=fs.readFileSync(path.join(dir,"assets",file),"utf8");
  assert(src.includes('kZ=t=>!!(t?.isLock||(t?.is_premium&&t.isLock!==false))'),
    folder+": el permiso explicito isLock=false debe permitir Premium");
  assert(src.includes('onClick:n,role:"button",tabIndex:0'),
    folder+": las tarjetas deben responder al clic y teclado");
  assert(src.includes("Requiere acceso"),
    folder+": usar aviso pequeño en lugar de overlay bloqueante");
  const start=src.indexOf('if(u){try{const S=new URL(t);');
  assert(start>0,folder+": falta la apertura pública en perfil restringido");
  const end=src.indexOf('return!1}let b=',start);
  assert(end>start,folder+": la ruta restringida debe terminar sin inyección");
  const fallback=src.slice(start,end);
  assert(fallback.includes('S.protocol')&&fallback.includes('S.username')&&
    fallback.includes('S.password'),folder+": validar URL HTTP(S) pública");
  assert(fallback.includes('chrome.windows.create({url:S.href')&&
    fallback.includes('window.open(S.href'),folder+": intentar abrir página pública");
  assert(!/storage\.local|product:|set_proxy|wipe_site_session|cookie/i.test(fallback),
    folder+": no instalar cookies o sesiones en rama restringida");
  assert(src.slice(end,end+7000).includes("chrome.storage.local.set"),
    folder+": conservar apertura original cuando está autorizada");
}
console.log("KAIZEN R3: tres catálogos verificados; clic, página pública y permisos PASS");
