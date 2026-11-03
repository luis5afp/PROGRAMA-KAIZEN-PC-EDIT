"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../../runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS");
for(const [folder,name,version] of [
  ["KAIZZEN_MAIN","KAIZZEN-MAIN","2.5.11"],
  ["KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.8"],
  ["KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.11"]
]){
  const dir=path.join(root,folder);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"),"utf8"));
  const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");
  assert.equal(manifest.name,name);
  assert.equal(manifest.version,version);
  assert.equal(manifest.options_page,undefined,"No usar gestor de contraseñas de Chromium");
  assert(html.includes('src="/catalog-diagnostic.js"'),"Panel dentro del catálogo");
  assert(!html.includes("owner-guide-panel.js"),"Retirar panel de gestor de Chrome");
  assert(html.indexOf("catalog-diagnostic.js") < html.indexOf('type="module"'),"Instrumentación antes del bundle");
  const observer=manifest.content_scripts.find(x=>x.js?.includes("form-diagnostic.js"));
  assert(observer && observer.all_frames === true,"Diagnóstico de formularios en marcos");
  for(const f of ["catalog-diagnostic.js","form-diagnostic.js"]){
    const src=fs.readFileSync(path.join(dir,f),"utf8");
    new Function(src);
    assert(!/fetch\(["']https?:|sendBeacon\(|localStorage\.setItem\(/.test(src),"No hacer envíos a terceros ni duplicar credenciales");
  }
  const catalog=fs.readFileSync(path.join(dir,"catalog-diagnostic.js"),"utf8");
  assert(catalog.includes("/api/shops/extension"),"Identificar el endpoint del catálogo");
  assert(catalog.includes("sesion-temporal-preparada"),"Detectar la preparación original de product");
  assert(catalog.includes("catalogo-respuesta"),"Mostrar categorías recibidas");
  assert(catalog.includes("isProducts(url)"),"Distinguir petición de productos");
  for(const stage of ["productos-respuesta",
    "productos-descifrados","producto-campos","tarjeta-campos-al-clic"])
    assert(catalog.includes(stage),"Falta etapa de productos: "+stage);
  const filenames={KAIZZEN_MAIN:"index-B-06emjA.js",
    KAIZZEN_GOOGLE:"index-DhjpRuHp.js",
    KAIZZEN_CUSTOM:"index-DtDn-2PW.js"};
  const bundle=fs.readFileSync(path.join(dir,"assets",filenames[folder]),"utf8");
  assert(bundle.includes("__kzDiagnosticProductBatch"),"Hook después del descifrado");
  assert(bundle.includes("__kzDiagnosticCardClickFields"),"Hook en tarjeta seleccionada");
  assert(bundle.includes("/api/shops/extension")&&bundle.includes("/api/products/getmostusedtool"),
    "Ambos endpoints originales disponibles");
  assert(bundle.includes("kZ=t=>!!(t?.isLock"),"Mantener estado original de bloqueo");
  // No se transfieren valores de d/e/k hacia el diagnóstico: solo booleanos.
  assert(bundle.includes("d:!!p?.d,e:!!p?.e,k:!!p?.k"),
    "Nunca copiar URL o credenciales al diagnóstico");
  assert(catalog.includes('event(route+"-envio"')&&catalog.includes('event(route+"-error"'),"Registrar envío y fallo sin datos sensibles");
  assert(catalog.includes("Copiar informe"),"Exportar sin DevTools");
  const form=fs.readFileSync(path.join(dir,"form-diagnostic.js"),"utf8");
  assert(form.includes("script-formulario-activo") && form.includes("formulario-observado"));
  assert(form.includes("correoConContenido") && form.includes("claveConContenido"));
  assert(!catalog.includes("JSON.stringify(data)"),"No copiar la respuesta íntegra");
  assert(!/\.value\s*=(?!=)/.test(form),"No escribir valores en campos");
  assert(!/JSON\.stringify\s*\(\s*(product|state)\s*\)/.test(form),"No serializar sesiones");
}
console.log("KAIZEN 1.5.32: diagnóstico en catálogos y formularios de las 3 extensiones PASS");
