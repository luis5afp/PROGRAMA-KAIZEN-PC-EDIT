"use strict";
// Auditoría estática: NO ejecuta extensiones ni accede a cookies o sesiones.
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const profiles=[
  {dir:"KAIZZEN_MAIN",name:"KAIZZEN-MAIN",version:"2.5.10"},
  {dir:"KAIZZEN_GOOGLE",name:"KAIZZEN-GOOGLE",version:"1.0.7"},
  {dir:"KAIZZEN_CUSTOM",name:"KAIZZEN-CUSTOM",version:"1.0.10"}
];
function fileInside(folder,relative){
  if(typeof relative!=="string"||!relative||path.isAbsolute(relative)||
    /^[a-z]:/i.test(relative)||relative.includes("\\")||
    relative.split("/").some(x=>!x||x==="."||x===".."))
    throw Error("Ruta de recurso insegura: "+String(relative));
  const target=path.resolve(folder,relative);
  if(!target.startsWith(folder+path.sep))throw Error("Ruta externa: "+relative);
  const stat=fs.lstatSync(target,{throwIfNoEntry:false});
  if(!stat?.isFile()||stat.isSymbolicLink())throw Error("Falta archivo: "+target);
}
function hasFullRoot(folder){
  return profiles.every(x=>fs.existsSync(path.join(folder,x.dir,"manifest.json")));
}
function resolveSource(input){
  const base=path.resolve(input||"runtime-resources/KAIZEN_EXTENSIONS");
  const nested=path.join(base,"KAIZEN_EXTENSIONS");
  if(hasFullRoot(base))return {root:base,nested:false};
  if(hasFullRoot(nested))return {root:nested,nested:true};
  throw Error("No se encuentran juntos los manifiestos de Principal, Google y Custom");
}
function verify(input){
  const {root,nested}=resolveSource(input);
  for(const spec of profiles){
    const folder=path.join(root,spec.dir);
    const m=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8"));
    assert.equal(m.manifest_version,3,spec.dir+" MV3");
    assert.equal(m.name,spec.name,spec.dir+" nombre");
    assert.equal(m.version,spec.version,spec.dir+" version");
    assert.equal(m.action?.default_title,"KAIZEN",spec.dir+" titulo");
    assert(!Object.hasOwn(m,"key"),spec.dir+" no debe declarar key");
    const expected=new Set(["manifest.json","index.html",m.background?.service_worker]);
    if(m.action?.default_popup)expected.add(m.action.default_popup);
    for(const entry of m.content_scripts||[])
      for(const file of [...entry.js||[],...entry.css||[]])expected.add(file);
    for(const file of Object.values(m.icons||{}))expected.add(file);
    const html=fs.readFileSync(path.join(folder,"index.html"),"utf8");
    for(const match of html.matchAll(/(?:src|href)=["']([^"'?#]+)(?:[?#][^"']*)?["']/g)){
      const href=match[1];
      if(/^(?:https?:|data:|#|chrome-extension:)/i.test(href))continue;
      expected.add(href.startsWith("/")?href.slice(1):href);
    }
    for(const file of expected)fileInside(folder,file);
    for(const glob of m.web_accessible_resources||[])for(const name of glob.resources||[]){
      if(typeof name!=="string")throw Error("Ruta web no válida");
      if(name.includes("*")){
        const parent=path.posix.dirname(name);
        if(parent!=="."){
          const target=path.resolve(folder,parent);
          if(!target.startsWith(folder+path.sep)||!fs.existsSync(target))throw Error("Directorio web ausente: "+parent);
        }
      }else fileInside(folder,name);
    }
    console.log("[auditoria] "+spec.name+" v"+spec.version+" OK; "+expected.size+" recursos directos verificados");
  }
  if(nested)console.warn("[auditoria] AVISO: carpeta KAIZEN_EXTENSIONS anidada; compilador debe normalizar antes de empaquetar");
  const legacy=path.join(path.dirname(root),"KAIZZEN_MAIN","manifest.json");
  if(nested&&fs.existsSync(legacy))console.warn("[auditoria] AVISO: existe copia parcial antigua de KAIZZEN_MAIN fuera del paquete completo");
  console.log("[auditoria] PASS: tres paquetes válidos a nivel de archivos; NO certifica ejecución real en Chromium");
  return {root,nested,profiles:3};
}
if(require.main===module){
  try{verify(process.argv[2]);}catch(err){console.error("[auditoria] FAIL:",err.message);process.exitCode=1;}
}
module.exports={verify,resolveSource};
