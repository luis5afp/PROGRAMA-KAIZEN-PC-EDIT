"use strict";
// Verificador de los archivos de ex1/ex2. NUNCA ejecuta ni activa extensiones.
const fs=require("node:fs");
const path=require("node:path");
const required=[
  {dir:"ex1",name:"ex1",version:"1.2"},
  {dir:"ex2",name:"ex2",version:"1.1"}
];
function fail(message){throw Error("[extensiones de seguridad] "+message);}
function checkFile(root,relative){
  if(typeof relative!=="string" || !relative || path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some(p=>!p||p==="."||p==="..") || /[*?]/.test(relative))
    fail("Ruta de recurso no permitida: "+String(relative));
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep))fail("Archivo fuera del paquete");
  if(!fs.existsSync(target) || !fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink())
    fail("Falta un recurso declarado en el manifiesto: "+relative);
}
function validate(rootPath){
  if(!rootPath)fail("No se indicó la carpeta de extensiones");
  const base=path.resolve(rootPath);
  if(!fs.existsSync(base)||!fs.lstatSync(base).isDirectory())fail("No existe extensionForSecurity");
  for(const {dir,name,version} of required){
    const folder=path.join(base,dir);
    if(!fs.existsSync(folder)||!fs.lstatSync(folder).isDirectory()||fs.lstatSync(folder).isSymbolicLink())
      fail("No existe la carpeta "+dir);
    checkFile(folder,"manifest.json");
    let manifest;
    try{manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8"));}
    catch{fail("Manifiesto inválido en "+dir);}
    if(manifest.manifest_version!==3||manifest.name!==name||manifest.version!==version)
      fail("Identidad o versión inesperada en "+dir);
    checkFile(folder,manifest.background?.service_worker);
    for(const entry of manifest.content_scripts||[]){
      for(const file of [...(entry.js||[]),...(entry.css||[])])checkFile(folder,file);
    }
    for(const file of Object.values(manifest.icons||{}))checkFile(folder,file);
    for(const entry of manifest.web_accessible_resources||[]){
      for(const file of entry.resources||[])checkFile(folder,file);
    }
    console.log("[extensiones de seguridad] "+name+" "+version+": manifiesto y recursos completos; INACTIVA");
  }
  return true;
}
if(require.main===module){
  try{validate(process.argv[2]);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={validate};
