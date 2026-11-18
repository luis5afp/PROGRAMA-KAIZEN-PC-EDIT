"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const integ=require("../lab/kaizen-1542-integration");
const base=path.resolve(__dirname,"../lab");
function report(profile,received,authorized,restricted,e,k,http=200){
  return JSON.stringify({
    version:7,
    resumen:[
      "Cliente de acceso: extension_"+profile+" · perfil KAIZZEN-"+profile.toUpperCase(),
      "Productos (servidor): HTTP "+http+" · bloque cifrado sí",
      "Productos (tras descifrar): "+received+" · d "+received+" · e "+e+" · k "+k+" · proxy 0 · bloqueadas "+restricted,
      "Inmediatamente tras descifrar: "+received+" objetos · e presente "+received+
        ", e con texto "+e+", e nulo "+(received-e)+
        " · k presente "+received+", k con texto "+k+", k nulo "+(received-k),
      "Acceso según respuesta: autorizadas "+authorized+" / "+received+
        " · restringidas "+restricted+" · bloqueos explícitos "+restricted+
        " · restricciones premium 0",
      "Ventana: creada · ID 123",
      "Pestaña: conectada · ID 124",
      "Sesión product: sin preparación observada",
      "Formulario: sin observación asociada"
    ].join("\n"),
    // Deliberately hostile values must be dropped by the summary-only parser.
    access_token:"NEVER-EXPOSE-SECRET",
    events:[{Authorization:"Bearer NEVER-EXPOSE-SECRET",cookie:"private"}]
  });
}
const main=integ.analyze(report("main",233,0,233,0,0),"main");
const google=integ.analyze(report("google",13,0,13,0,0),"google");
const custom=integ.analyze(report("custom",6,2,4,2,2),"custom");
assert.deepEqual([main.received,main.authorized,main.restricted],[233,0,233]);
assert.equal(main.http,200);
assert.equal(main.session,"no preparada");
assert.equal(main.tab,"conectada");
assert.match(main.diagnosis,/todas las tarjetas.*restringidas/);
assert.equal(google.received,13);
assert.equal(custom.authorized,2);
const combined=integ.compare({main,google,custom});
assert.equal(combined.present,3);
assert.equal(combined.complete,true);
assert.equal(combined.totalReceived,252);
assert.equal(combined.totalAuthorized,2);
assert.equal(combined.totalRestricted,250);
assert(!JSON.stringify(combined).includes("NEVER-EXPOSE-SECRET"));
assert(!JSON.stringify(combined).includes("Bearer "));
assert(!JSON.stringify(combined).includes("cookie"));
assert(!("resumen" in main)&&!("events" in google));
assert.throws(()=>integ.analyze(report("google",13,0,13,0,0),"main"),/Selecciona KAIZZEN-GOOGLE/);
const detectedGoogle=integ.analyze(report("google",13,0,13,0,0),"auto");
assert.equal(detectedGoogle.profile,"google","Detecta el perfil original sin selección manual");
assert.equal(detectedGoogle.received,13);
const detectedDefault=integ.analyze(report("main",233,0,233,0,0));
assert.equal(detectedDefault.profile,"main","La opción por defecto detecta Principal");
const detectedCustom=integ.analyze(report("custom",6,2,4,2,2),"auto");
assert.equal(detectedCustom.profile,"custom","La detección automática debe incluir Custom");
assert.throws(()=>integ.analyze(report("main",13,13,13,1,1),"main"),/totales/);
assert.throws(()=>integ.analyze("hola","main"),/no identifica/);
assert.throws(()=>integ.analyze("{mal json","main"),/JSON/);
assert.throws(()=>integ.analyze(report("main",1,0,1,0,0),"root"),/Perfil/);
assert.throws(()=>integ.analyze("x".repeat(integ.MAX_REPORT+1),"main"),/límite/);
assert.equal(integ.compare({main}).complete,false);
const parsed=integ.analyze(JSON.parse(report("main",233,0,233,0,0)).resumen,"main");
assert.equal(parsed.received,233,"acepta texto sanitizado plano");
// Compatibilidad con v8: leer exclusivamente contadores agregados de la sección
// de integridad; no transferir datos ni identificadores de productos.
const v8=JSON.parse(report("main",9,2,7,2,2));
v8.version=8;
v8.resumen+="\nAcceso en objetos descifrados: autorizadas 2 · restringidas 7 · restringidas sin par e/k 7 · restringidas con e 0 · restringidas con k 0";
v8.resumen+="\nIntegridad de tarjetas autorizadas: lote 1 · pérdida de e 1 · pérdida de k 0 · e nuevos 0 · k nuevos 0";
const parsedV8=integ.analyze(JSON.stringify(v8),"auto");
assert.equal(parsedV8.restrictedWithoutPair,7);
assert.equal(parsedV8.lossEmail,1);
assert.equal(parsedV8.lossPassword,0);
assert.equal(main.lossEmail,null,"v7 sin conciliación sigue siendo legible");
assert(!JSON.stringify(parsedV8).includes("NEVER-EXPOSE-SECRET"));

for(const name of ["kaizen-1542-integration.js","kaizen-1542-integration-ui.js","kaizen-1542-preload.js"]){
  new Function(fs.readFileSync(path.join(base,name),"utf8"));
}
const html=fs.readFileSync(path.join(base,"index.html"),"utf8");
const ui=fs.readFileSync(path.join(base,"kaizen-1542-integration-ui.js"),"utf8");
const preload=fs.readFileSync(path.join(base,"kaizen-1542-preload.js"),"utf8");
const electron=fs.readFileSync(path.join(__dirname,"..","main.kaizen-1.5.24.js"),"utf8");
assert(html.includes("KAIZEN PC · LABORATORIO + DIAGNÓSTICO REAL · 1.5.44"));
assert(html.includes('id="integration-report"'));
assert(html.includes('<option value="auto" selected>Detectar perfil automáticamente'));
assert(ui.includes('reports[outcome.profile]=outcome'),"El informe se guarda según su perfil detectado");
assert(!ui.includes('$("integration-profile").value=outcome.profile'),"La detección automática debe mantenerse entre distintos informes");
assert(ui.includes('error?.message'),"Errores de entrada deben mostrar el motivo seguro");
assert(electron.includes('El acceso a KAIZZEN-GOOGLE es independiente'),"La sesión de extensión se diferencia del escritorio");
assert(html.includes('id="live-api-probe"'));
assert(html.includes('src="./kaizen-1542-integration.js"'));
assert(html.includes('src="./kaizen-1542-integration-ui.js"'));
assert(html.includes("connect-src 'none'"));
assert(html.includes("form-action 'none'"));
assert(ui.includes("reportBox.value=\"\""),"raw paste is cleared after parsing");
assert(!/localStorage|sessionStorage|\bfetch\s*\(/.test(ui),"integration UI must not fetch or persist data");
assert(preload.includes('ipcRenderer.invoke("kaizen-lab-live-probe")'));
assert(!preload.includes("getItem("));
assert(electron.includes('event.sender!==labWindow.webContents'));
assert(electron.includes('event.senderFrame!==labWindow.webContents.mainFrame'));
assert(electron.includes('if(labApiProbeRunning||now-lastLabApiProbe<15000)'));
assert(electron.includes('return await diagnostics.remoteChecks(token)'));
assert(!electron.includes('isLock=false'));
assert(electron.includes('preload:path.join(__dirname,"lab","kaizen-1542-preload.js")'));
console.log("PASS: KAIZEN 1.5.42 compara MAIN/GOOGLE/CUSTOM sanitizados, 401/403, sesión y formularios, sin exponer secretos.");
console.log("PASS: API del escritorio opt-in, IPC ligado a ventana aislada, sin modificación de permisos, credenciales o backend.");
