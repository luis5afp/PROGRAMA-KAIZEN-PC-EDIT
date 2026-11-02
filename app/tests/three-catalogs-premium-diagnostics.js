"use strict";
// Audita los 3 catálogos originales sin ejecutar sesiones, cookies ni proxy.
// La prueba 1.5.26 NO convierte herramientas Premium en gratuitas.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..","..","runtime-resources","KAIZEN_EXTENSIONS","KAIZEN_EXTENSIONS");
const bundles={
  KAIZZEN_MAIN:"assets/index-B-06emjA.js",
  KAIZZEN_GOOGLE:"assets/index-DhjpRuHp.js",
  KAIZZEN_CUSTOM:"assets/index-DtDn-2PW.js"
};
for(const [profile,relative] of Object.entries(bundles)){
 const file=path.join(root,profile,relative);
 const src=fs.readFileSync(file,"utf8");
 assert(src.includes('const f=!!(t.is_premium||t.isLock)'),
   profile+": comprobación original de bloqueo ausente");
 assert(src.includes('onClick:f?()=>{const motivos='),
   profile+": aviso de clic en tarjeta no integrado");
 assert(src.includes('window.alert("Acceso no disponible: "'),
   profile+": aviso explicativo ausente");
 assert(src.includes("La cuenta debe tener autorización del servidor"),
   profile+": debe informar que no hay concesión de permisos");
 assert(src.includes('if(u){je("Only premium user"'),
   profile+": no debe eliminarse la comprobación de herramientas Premium");
 assert(src.includes("/api/shops/extension"),
   profile+": debe conservarse la consulta al catálogo remoto");
 assert(!src.includes("is_premium=false")&&!src.includes("isLock=false"),
   profile+": no se permite falsificar permisos de acceso en el navegador");
 console.log("[catalog] "+profile+": clic informativo y controles originales presentes");
}
console.log("PASS: los 3 catálogos explican el bloqueo sin omitir acceso autorizado.");
