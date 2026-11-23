"use strict";
const fs=require("node:fs");
const path=require("node:path");
const EXPECTED=["KAIZZEN-MAIN","KAIZZEN-GOOGLE","KAIZZEN-CUSTOM"];
const ALLOWED=new Set([
  "version","profile","checkedAt","tokenPresent","verification","http",
  "role","identitySource","accountFingerprint","expiresAt","expiredByClock"
]);
function readSafeReport(filename) {
  const raw=fs.readFileSync(filename,"utf8");
  if(raw.length>10000)throw Error("Informe demasiado grande");
  const report=JSON.parse(raw);
  if(!report||typeof report!=="object"||Array.isArray(report)||
     Object.keys(report).some(k=>!ALLOWED.has(k)))throw Error("Informe no es el formato seguro de KAIZEN");
  if(report.version!==1||!EXPECTED.includes(report.profile))throw Error("Perfil o versión no reconocidos");
  if(typeof report.verification!=="string"||
     typeof report.tokenPresent!=="boolean"||
     (report.accountFingerprint!==null&&!/^[0-9a-f]{24}$/.test(report.accountFingerprint||"")))
    throw Error("Informe de sesión inválido");
  return report;
}
function compare(reports) {
  if(reports.length!==3||new Set(reports.map(r=>r.profile)).size!==3)
    return "Faltan perfiles: se necesitan MAIN, GOOGLE y CUSTOM";
  if(reports.some(r=>r.verification!=="servidor-verificado"||!r.accountFingerprint))
    return "INCONCLUSO: falta identidad verificada y/o huella en algún perfil";
  return new Set(reports.map(r=>r.accountFingerprint)).size===1 ?
    "COINCIDEN: los tres perfiles usan la misma identidad verificada" :
    "DIFIEREN: hay al menos dos identidades verificadas distintas";
}
function main(files) {
  if(files.length!==3){
    console.error("Uso: node app/scripts/compare-extension-session-reports.js MAIN.json GOOGLE.json CUSTOM.json");
    process.exitCode=2;return;
  }
  try{
    const reports=files.map(file=>readSafeReport(path.resolve(file)));
    for(const r of reports) console.log(r.profile+" | "+r.verification+" | rol "+(r.role||"desconocido")+" | token "+(r.tokenPresent?"presente":"ausente"));
    console.log(compare(reports));
  }catch{
    console.error("No se pueden leer los tres informes seguros; comprueba su formato y rutas");
    process.exitCode=2;
  }
}
if(require.main===module)main(process.argv.slice(2));
module.exports={readSafeReport,compare};
