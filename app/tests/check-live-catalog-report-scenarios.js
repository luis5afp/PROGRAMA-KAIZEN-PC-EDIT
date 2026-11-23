"use strict";
const assert=require("node:assert/strict");
const {analyze}=require("../scripts/check-live-catalog-report");
// Fixtures contain metadata ONLY, never any invented server cards or credentials.
const events=[
  {stage:"productos-respuesta",http:200,cifrado:true},
  {stage:"origen-tras-descifrado",lote:1,autorizadasOrigen:1,restringidasOrigen:1,restringidasSinParOrigen:1},
  {stage:"productos-descifrados",lote:1,cuenta:2,habilitadas:1,bloqueadas:1,bloqueoExplicito:1,bloqueoPremium:0},
  {stage:"conciliacion-campos",lote:1,perdidaEAutorizada:0,perdidaKAutorizada:0,cambioBloqueo:0,autorizadasOrigen:1,autorizadasFinal:1}
];
const report=events=>({version:8,events});
assert.equal(analyze(report(events)).catalogo.estado,"OBSERVADO");
assert.equal(analyze(report(events)).transformacion.estado,"SIN_PERDIDA_OBSERVADA");
assert.equal(analyze(report(events)).apertura.estado,"SIN_EVIDENCIA");
assert.equal(analyze(report([...events,{stage:"clic-tarjeta",flujo:"local-1"},{stage:"tarjeta-campos-al-clic",flujo:"local-1",locked:true}])).apertura.estado,"RESTRINGIDA");
assert.equal(analyze(report([...events,{stage:"clic-tarjeta",flujo:"local-1"},{stage:"tarjeta-campos-al-clic",flujo:"local-1",locked:false},{stage:"sesion-temporal-preparada",flujo:"local-1"},{stage:"script-formulario-activo",flujo:"local-1"},{stage:"formulario-observado",flujo:"local-1"}])).apertura.estado,"FORMULARIO_OBSERVADO");
assert.equal(analyze(report([...events.slice(0,3),{...events[3],perdidaEAutorizada:1}])).transformacion.estado,"REVISAR_CLIENTE");
assert.equal(analyze(report([...events,{stage:"clic-tarjeta",flujo:"local-1"},{stage:"tarjeta-campos-al-clic",flujo:"local-1",locked:false},{stage:"sesion-temporal-preparada",flujo:"local-1"},{stage:"formulario-sin-sesion",flujo:"local-1"}])).apertura.estado,"REVISAR_CLIENTE");
assert.equal(analyze(report([{stage:"productos-respuesta",http:200,cifrado:true}])).catalogo.estado,"INCOMPLETO");
assert.throws(()=>analyze({version:7,events:[]}));
const malicious=analyze(report([...events,{stage:"irrelevante",secret:"MUST_NOT_LEAK",token:"MUST_NOT_LEAK"}]));
assert(!JSON.stringify(malicious).includes("MUST_NOT_LEAK"));
console.log("KAIZEN: analizador de informe real y privacidad PASS (10 casos)");
