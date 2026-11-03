"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../../runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS");
const dirs=["KAIZZEN_MAIN","KAIZZEN_GOOGLE","KAIZZEN_CUSTOM"];
const src=fs.readFileSync(path.join(root,dirs[0],"authorized-field-aliases.js"),"utf8");
for(const dir of dirs){
  const current=fs.readFileSync(path.join(root,dir,"authorized-field-aliases.js"),"utf8");
  assert.equal(current,src,dir+": normalizador no coincide");
  const html=fs.readFileSync(path.join(root,dir,"index.html"),"utf8");
  assert(html.includes('src="/authorized-field-aliases.js"'),dir+": no se carga el adaptador");
  assert(html.indexOf("authorized-field-aliases.js")<html.indexOf('type="module"'),
    dir+": debe cargar antes del catálogo");
}
const context={};
context.globalThis=context;
vm.runInNewContext(src,context,{filename:"authorized-field-aliases.js"});
const normalize=context.__kzAuthorizedFieldAliases;
assert.equal(typeof normalize,"function");
const convert=product=>JSON.parse(JSON.stringify(normalize(product)));
const unlocked={id:1,isLock:false,lm:"form",email:"owned@example.test",password:"secret-TEST"};
const fixed=convert(unlocked);
assert.deepEqual(fixed,{e:"owned@example.test",k:"secret-TEST"});
assert(!Object.hasOwn(unlocked,"e")&&!Object.hasOwn(unlocked,"k"),"No modificar el original");
assert.deepEqual(convert({id:2,isLock:false,correo:"owner@test",clave:"mi-clave"}),{
  e:"owner@test",k:"mi-clave"
});
assert.deepEqual(convert({id:3,isLock:false,e:"canonical@test",k:"canonical-strong",
  email:"wrong@test",password:"wrong"}),{},"Preservar e/k originales");
assert.deepEqual(convert({id:4,isLock:false,email:"   ",password:""}),{},
  "No crear valores vacíos");
assert.deepEqual(convert({id:5,isLock:false,email:123,password:{value:"x"}}),{},
  "No interpretar tipos desconocidos");
assert.deepEqual(convert({id:6,isLock:true,email:"forbidden@test",password:"forbidden"}),{},
  "No preparar credenciales de productos restringidos");
assert.deepEqual(convert({id:7,isLock:"true",email:"forbidden@test",password:"forbidden"}),{},
  "Seguir la misma condición de bloqueo truthy que el catálogo");
assert.deepEqual(convert({id:8,is_premium:true,email:"forbidden@test",password:"forbidden"}),{},
  "No desbloquear premium");
assert.deepEqual(convert({id:9,is_premium:true,isLock:false,
  email:"owner@test",password:"ok"}),{e:"owner@test",k:"ok"},
  "Mantener compatibilidad premium explícitamente autorizada");
assert.deepEqual(convert({id:10,isLock:false,lm:"cookie",
  email:"owner@test",password:"unused"}),{},"No alterar flujo cookies");
assert.deepEqual(convert({isLock:false,login_email:"a@test",contrasena:" pass "}),
  {e:"a@test",k:" pass "},"No recortar contraseña original");
assert.equal(convert({isLock:false,username:"other",token:"token"}).e,undefined,
  "No usar identificadores ambiguos ni tokens");
const filenames={KAIZZEN_MAIN:"index-B-06emjA.js",
  KAIZZEN_GOOGLE:"index-DhjpRuHp.js",
  KAIZZEN_CUSTOM:"index-DtDn-2PW.js"};
for(const dir of dirs){
 const code=fs.readFileSync(path.join(root,dir,"assets",filenames[dir]),"utf8");
 assert(code.includes("...(globalThis.__kzAuthorizedFieldAliases?.("),
   dir+": no se aplicó el adaptador después de descifrar");
 assert(code.includes("kZ=t=>!!(t?.isLock"),dir+": no alterar restricciones");
 assert(code.includes("__kzDiagnosticRawBatch"),dir+": no perder diagnóstico original");
 new Function(code);
}
assert(!src.includes("chrome.storage")&&!src.includes("fetch(") &&
  !src.includes("sendMessage("),"No conservar ni enviar credenciales");
console.log("KAIZEN 1.5.37: adaptador e/k solo para tarjetas autorizadas PASS");
