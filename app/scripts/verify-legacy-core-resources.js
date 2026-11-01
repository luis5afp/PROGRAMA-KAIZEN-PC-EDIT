"use strict";
// Verificación de compatibilidad con los seis recursos originales cuyo SHA-256
// fija el cliente legado. No elimina ni desactiva sus verificaciones.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const EXPECTED=Object.freeze({
  "ex1/backgroundScript.js":"e7d0c09413ede5ad7884f4a9c4c0f0b1e0210a57d213841e8304338b536f7668",
  "ex1/contentScript.js":"f718478d6c02a1c21903c7dc3ca4d5fb8edc9699a389daf81f11b354121c1ce9",
  "ex1/manifest.json":"7c80f5e06eb8e43ba4c39211d2e76ccdc8d416082b90df06e84a1f478faa2460",
  "ex2/backgroundScript.js":"5eda8ba92e93d3adf33e08b8a319c4ac979c0144d2db945fb0c1072a9fcedb46",
  "ex2/contentScript.js":"34338eee92650b35b18c6607ea7b05cc2f418fbe15fbddb1ba05a926d30e2f67",
  "ex2/manifest.json":"aeaedc9c0b22ef3166e328747510c2413fc9351c2a625003a2d12c413d39bf58"
});
function verify(root){
  if(!root||!fs.existsSync(root))throw Error("Carpeta extensionForSecurity no disponible");
  const base=path.resolve(root);
  for(const [rel,expected] of Object.entries(EXPECTED)){
    const file=path.resolve(base,rel);
    if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||
       !fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())
      throw Error("Archivo protegido ausente: "+rel);
    const actual=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if(actual!==expected)throw Error("Hash incorrecto de archivo protegido: "+rel);
    console.log("[compatibilidad legado] OK "+rel);
  }
  return true;
}
if(require.main===module){
  try{verify(process.argv[2]);}
  catch(e){console.error("[compatibilidad legado] "+e.message);process.exitCode=1;}
}
module.exports={verify,EXPECTED};
