"use strict";
/**
 * Reads only the already-sanitized, version 8 KAIZEN catalog diagnostic report.
 * Does not authenticate, request credentials, call the backend, or alter isLock.
 * Use with a report copied from a legitimately authenticated test account.
 * No raw events are printed.
 */
const fs = require("node:fs");

function nonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function latest(events, stage, lote) {
  for (let index = events.length - 1; index >= 0; index--) {
    const row = events[index];
    if (!row || row.stage !== stage) continue;
    if (lote != null && row.lote !== lote) continue;
    return row;
  }
  return null;
}
function result(ok, message) { return {estado:ok, detalle:message}; }
function analyze(report) {
  if (!report || report.version !== 8 || !Array.isArray(report.events) || report.events.length > 2000)
    throw new Error("Se requiere el JSON exportado por 'Copiar informe' (versión 8).");
  const events=report.events;
  if (!events.every(e=>e && typeof e.stage === "string" && e.stage.length <= 90))
    throw new Error("Formato de eventos no válido.");
  const response=latest(events,"productos-respuesta");
  const decoded=latest(events,"productos-descifrados");
  const origin=decoded?latest(events,"origen-tras-descifrado",decoded.lote):null;
  const cross=decoded?latest(events,"conciliacion-campos",decoded.lote):null;
  const lastAction=[...events].reverse().find(e=>e.stage==="clic-tarjeta"||e.stage==="clic-codigos")||null;
  const scoped=stage=>lastAction && typeof lastAction.flujo === "string" && lastAction.flujo ?
    [...events].reverse().find(e=>e.stage===stage&&e.flujo===lastAction.flujo)||null : null;
  const selected=lastAction?.stage==="clic-tarjeta"?scoped("tarjeta-campos-al-clic"):null;
  const received=response&&response.http===200&&response.cifrado===true;
  const counts=decoded?{
    productos:nonnegative(decoded.cuenta),
    autorizadas:nonnegative(decoded.habilitadas),
    restringidas:nonnegative(decoded.bloqueadas),
    bloqueoExplicito:nonnegative(decoded.bloqueoExplicito),
    bloqueoPremium:nonnegative(decoded.bloqueoPremium)
  }:null;
  const integrity=cross?{
    lote:nonnegative(cross.lote),
    perdidaEAutorizada:nonnegative(cross.perdidaEAutorizada),
    perdidaKAutorizada:nonnegative(cross.perdidaKAutorizada),
    cambioBloqueo:nonnegative(cross.cambioBloqueo),
    autorizadasOrigen:nonnegative(cross.autorizadasOrigen),
    autorizadasFinal:nonnegative(cross.autorizadasFinal)
  }:null;
  let catalogo,transformacion,apertura;
  if(!response) catalogo=result("SIN_EVIDENCIA","No se observó respuesta de productos.");
  else if(!received) catalogo=result("REVISAR","La última respuesta no confirma catálogo cifrado con HTTP 200.");
  else if(!decoded||!origin) catalogo=result("INCOMPLETO","Se recibió un bloque cifrado, pero no hay lote descifrado correspondiente.");
  else catalogo=result("OBSERVADO","Respuesta cifrada, lote descifrado y estado de acceso medidos.");
  if(!origin||!cross) transformacion=result("SIN_EVIDENCIA","Falta conciliación del mismo lote antes y después del procesamiento.");
  else if(integrity.perdidaEAutorizada===null||integrity.perdidaKAutorizada===null||integrity.cambioBloqueo===null)
    transformacion=result("INCOMPLETO","Faltan contadores de integridad.");
  else if(integrity.perdidaEAutorizada>0||integrity.perdidaKAutorizada>0||integrity.cambioBloqueo>0)
    transformacion=result("REVISAR_CLIENTE","Hay pérdida de e/k en tarjetas autorizadas o cambio de bloqueo durante el procesamiento.");
  else transformacion=result("SIN_PERDIDA_OBSERVADA","No se detectó pérdida de e/k autorizados ni cambio de bloqueo en este lote.");
  if(!lastAction) apertura=result("SIN_EVIDENCIA","No se pulsó ninguna tarjeta durante el informe.");
  else if(lastAction.stage==="clic-codigos") apertura=result("NO_APLICA","El último clic fue en CÓDIGOS, no en una tarjeta.");
  else if(!selected) apertura=result("INCOMPLETO","No se vincularon los metadatos de la tarjeta al último clic.");
  else if(selected.locked===true) apertura=result("RESTRINGIDA","La tarjeta pulsada fue clasificada como restringida: el cliente no debe preparar autocompletado.");
  else if(selected.locked!==false) apertura=result("INCOMPLETO","La clasificación de acceso no está disponible.");
  else if(selected.cookie===true) apertura=result("OTRO_FLUJO","La tarjeta utiliza modo cookie; este diagnóstico de e/k no demuestra el resultado.");
  else if(!scoped("sesion-temporal-preparada")) apertura=result("REVISAR_CLIENTE","Tarjeta no restringida, pero no se observó preparación de la sesión temporal.");
  else if(scoped("formulario-sin-sesion")) apertura=result("REVISAR_CLIENTE","El formulario informa ausencia de sesión temporal.");
  else if(!scoped("script-formulario-activo")) apertura=result("INCOMPLETO","Hay sesión preparada, sin confirmación del observador del formulario.");
  else if(!scoped("formulario-observado")) apertura=result("INCOMPLETO","Observador activo, pero sin formulario observado.");
  else apertura=result("FORMULARIO_OBSERVADO","El observador alcanzó el formulario; no demuestra inicio de sesión exitoso.");
  return {
    tipo:"verificacion-pasiva-kaizen",version:1,
    catalogo,transformacion,apertura,
    conteos:counts,integridad:integrity,
    origen:origin?{
      autorizadas:nonnegative(origin.autorizadasOrigen),
      restringidas:nonnegative(origin.restringidasOrigen),
      restringidasSinPar:nonnegative(origin.restringidasSinParOrigen)
    }:null,
    limites:"El informe no verifica permisos internos del backend, legitimidad de la cuenta ni éxito de login; no modifica isLock, sesiones ni 2FA."
  };
}

if(require.main===module){
  const files=process.argv.slice(2);
  if(!files.length){
    console.error("Uso: node app/scripts/check-live-catalog-report.js <informe-main.json> [informe-google.json] [informe-custom.json]");
    process.exitCode=2;
  }else{
    let failed=false;
    for(const [index,file] of files.entries()){
      try{
        const document=JSON.parse(fs.readFileSync(file,"utf8"));
        // The output includes only a fixed set of whitelisted aggregated fields.
        console.log(JSON.stringify({informe:index+1,...analyze(document)},null,2));
      }catch(error){
        failed=true;
        console.error(JSON.stringify({informe:index+1,error:"Informe no legible o incompatible"}));
      }
    }
    if(failed)process.exitCode=2;
  }
}
module.exports={analyze};
