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
  assert(html.includes('src="/authorized-field-aliases.js"'),"Adaptador para e/k de productos autorizados");
  assert(html.indexOf("authorized-field-aliases.js") < html.indexOf('type="module"'),
    "Normalizador debe estar disponible antes de React");
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
  for(const stage of ["comunicacion-http-envio","comunicacion-http-respuesta",
    "comunicacion-mensaje-envio","comunicacion-mensaje-respuesta",
    "comunicacion-red-envio","comunicacion-red-respuesta"])
    assert(catalog.includes(stage),"Falta evento de comunicación: "+stage);
  assert(catalog.includes("apiRoute(url)")&&catalog.includes("communicationContext()"),
    "Correlacionar solo HTTP del servidor KAIZZEN sin copiar URLs");
  assert(catalog.includes('MESSAGE_ROUTES.has(data?.ref)'),
    "Solo etiquetas permitidas de mensajes al background");
  assert(catalog.includes("chrome.webRequest.onBeforeRequest") && catalog.includes("apiRequests"),
    "Observar red Chromium solo cuando el permiso ya está disponible");
  assert(catalog.includes("Peticiones tras el clic: "),
    "Resumen de tráfico observado al pulsar tarjeta");
  assert(!catalog.includes("JSON.stringify(args)")&&!catalog.includes("JSON.stringify(message)"),
    "No exportar argumentos de llamadas ni cuerpos de mensajes");

  assert(catalog.includes("catalogo-respuesta"),"Mostrar categorías recibidas");
  assert(catalog.includes("diagnostico-cliente"),"Identificar perfil y cliente de la extensión");
  assert(catalog.includes("bloqueoExplicito") && catalog.includes("bloqueoPremium"),
    "Distinguir bloqueo explícito de restricción premium");
  assert(catalog.includes("habilitadas") && catalog.includes("sinParAcceso"),
    "Contabilizar herramientas habilitadas y disponibilidad de datos");
  assert(!catalog.includes("product.isLock=false"),"No alterar autorización");
  assert(catalog.includes("clic-codigos") && catalog.includes('currentSource="codigos"') === false,
    "Capturar botón CÓDIGOS como acción separada");
  assert(catalog.includes('action("clic-codigos","codigos")') && catalog.includes('action("clic-tarjeta","tarjeta")'),
    "Distinguir botón de tarjetas");
  assert(catalog.includes('age<20000') && catalog.includes('"sin-asociar"'),
    "No atribuir product a clics antiguos");

  assert(catalog.includes("isProducts(url)"),"Distinguir petición de productos");
  for(const stage of ["productos-respuesta",
    "productos-descifrados","producto-campos","tarjeta-campos-al-clic"])
    assert(catalog.includes(stage),"Falta etapa de productos: "+stage);
  const filenames={KAIZZEN_MAIN:"index-B-06emjA.js",
    KAIZZEN_GOOGLE:"index-DhjpRuHp.js",
    KAIZZEN_CUSTOM:"index-DtDn-2PW.js"};
  const bundle=fs.readFileSync(path.join(dir,"assets",filenames[folder]),"utf8");
  assert(bundle.includes("__kzDiagnosticProductBatch"),"Hook después del descifrado");
  assert(bundle.includes("...(globalThis.__kzAuthorizedFieldAliases?.("),
    "Normalización de e/k antes de dibujar la tarjeta autorizada");
  assert(bundle.includes("__kzDiagnosticRawBatch"),"Hook ANTES del mapeo tras descifrado");
  assert(bundle.includes('active_users:')&&bundle.includes("JSON.parse(await "),
    "Mantener la transformación original y el descifrado");
  assert(catalog.includes("origen-tras-descifrado"),"Comparación de valores presentes antes del mapeo");
  assert(catalog.includes("eSpaces")&&catalog.includes("kNull")&&catalog.includes("lockProp"),
    "Distinguir ausencia, vacío, nulo y marca de restricción");

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
  assert(form.includes("comunicacion-formulario-recibida"),"Confirmar recepción en pestaña");
  assert(form.includes("correoConContenido") && form.includes("claveConContenido"));
  assert(!catalog.includes("JSON.stringify(data)"),"No copiar la respuesta íntegra");
  assert(!/\.value\s*=(?!=)/.test(form),"No escribir valores en campos");
  assert(!/JSON\.stringify\s*\(\s*(product|state)\s*\)/.test(form),"No serializar sesiones");
}
console.log("KAIZEN 1.5.37: diagnóstico en catálogos y formularios de las 3 extensiones PASS");
