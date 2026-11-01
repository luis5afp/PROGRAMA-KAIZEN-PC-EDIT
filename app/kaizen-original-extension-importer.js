"use strict";
// Instala SOLO el ZIP proporcionado explícitamente por el usuario.
// Nunca descarga extensiones, copia credenciales o ejecuta código del paquete.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const EXPECTED=Object.freeze([
  {dir:"KAIZZEN_MAIN",name:"KAIZZEN-MAIN",version:"2.5.6"},
  {dir:"KAIZZEN_GOOGLE",name:"KAIZZEN-GOOGLE",version:"1.0.3"},
  {dir:"KAIZZEN_CUSTOM",name:"KAIZZEN-CUSTOM",version:"1.0.6"}
]);
const MAX_FILES=1200,MAX_FILE_BYTES=32*1024*1024,MAX_TOTAL=160*1024*1024;
let installing=null;

function checkResource(folder,relative){
  if(typeof relative!=="string"||!relative||path.isAbsolute(relative)||
     relative.split(/[\\/]/).some(p=>!p||p==="."||p==="..")||
     /^[A-Za-z]:/.test(relative)||relative.includes("\0")||relative.includes("*"))
    throw Error("Ruta inválida declarada en manifest.json");
  const file=path.resolve(folder,relative);
  if(!file.startsWith(folder+path.sep)||!fs.existsSync(file)||
     !fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())
    throw Error("Falta archivo requerido: "+relative);
}
function validateFolder(root){
  const base=path.resolve(root);
  for(const spec of EXPECTED){
    const folder=path.join(base,spec.dir);
    if(!fs.existsSync(folder)||!fs.lstatSync(folder).isDirectory()||
       fs.lstatSync(folder).isSymbolicLink())
      throw Error("Falta la extensión original "+spec.name+" v"+spec.version);
    checkResource(folder,"manifest.json");
    let m;
    try{m=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8"));}
    catch{throw Error("El manifiesto de "+spec.name+" es inválido");}
    if(m.manifest_version!==3||m.name!==spec.name||m.version!==spec.version||
       m.action?.default_title!=="KAIZEN"||Object.hasOwn(m,"key"))
      throw Error("Identidad o versión no reconocida para "+spec.name+" (v"+spec.version+")");
    checkResource(folder,"index.html");
    checkResource(folder,m.background?.service_worker);
    if(m.action?.default_popup)checkResource(folder,m.action.default_popup);
    for(const item of m.content_scripts||[])
      for(const file of [...(item.js||[]),...(item.css||[])])checkResource(folder,file);
    for(const file of Object.values(m.icons||{}))checkResource(folder,file);
    for(const entries of m.web_accessible_resources||[])
      for(const file of entries.resources||[])checkResource(folder,file);
  }
  return true;
}
function splitEntryName(name){
  if(typeof name!=="string"||!name||name.includes("\0")||name.includes("\\")||
     name.startsWith("/")||/^[A-Za-z]:/.test(name))throw Error("ZIP contiene rutas no permitidas");
  const pieces=name.replace(/\/$/,"").split("/");
  if(pieces.some(p=>!p||p==="."||p==="..")||
     pieces[0]!=="KAIZEN_EXTENSIONS"||pieces.length<2||
     !EXPECTED.some(x=>x.dir===pieces[1]))throw Error("ZIP contiene rutas ajenas a KAIZEN_EXTENSIONS");
  return pieces;
}
async function installOriginalZip(zipFile,userDataPath){
  if(installing)return {ok:false,message:"Ya hay una importación en curso"};
  const task=(async()=>{
    if(typeof zipFile!=="string"||!zipFile.toLowerCase().endsWith(".zip")||
       !fs.existsSync(zipFile)||!fs.statSync(zipFile).isFile())
      throw Error("Selecciona un archivo ZIP original válido");
    if(!userDataPath||!fs.existsSync(userDataPath))
      throw Error("Almacenamiento local no disponible");
    const store=path.join(userDataPath,"kaizen-original-extensions");
    fs.mkdirSync(store,{recursive:true});
    const active=path.join(store,"KAIZEN_EXTENSIONS");
    const token=crypto.randomBytes(8).toString("hex");
    const staging=path.join(store,".incoming-"+token);
    const next=path.join(staging,"KAIZEN_EXTENSIONS");
    const backup=path.join(store,".backup-"+token);
    let movedOld=false,movedNew=false;
    try{
      const unzipper=require("unzipper");
      const zip=await unzipper.Open.file(zipFile);
      if(!Array.isArray(zip.files)||zip.files.length>MAX_FILES)
        throw Error("El ZIP contiene demasiados archivos");
      fs.mkdirSync(next,{recursive:true});
      let total=0, count=0;
      const names=new Set();
      for(const entry of zip.files){
        const parts=splitEntryName(String(entry.path||""));
        if(entry.type==="Directory")continue;
        if(entry.type!=="File")throw Error("Tipo de entrada ZIP no admitido");
        if(parts.length<3)throw Error("Ruta de archivo inválida en ZIP");
        const relative=parts.slice(1).join("/");
        const normalized=relative.toLowerCase();
        if(names.has(normalized))throw Error("Archivos duplicados en ZIP: "+relative);
        names.add(normalized);
        const reported=Number(entry.vars?.uncompressedSize);
        if(!Number.isFinite(reported)||reported<0||reported>MAX_FILE_BYTES)
          throw Error("Tamaño de entrada ZIP no permitido");
        total+=reported;count++;
        if(count>MAX_FILES||total>MAX_TOTAL)throw Error("ZIP demasiado grande");
        const dest=path.resolve(next,...parts.slice(1));
        if(!dest.startsWith(next+path.sep))throw Error("Ruta fuera de la instalación");
        fs.mkdirSync(path.dirname(dest),{recursive:true});
        const bytes=await entry.buffer();
        if(bytes.length!==reported||bytes.length>MAX_FILE_BYTES)throw Error("Entrada ZIP dañada");
        fs.writeFileSync(dest,bytes,{flag:"wx"});
      }
      validateFolder(next);
      if(fs.existsSync(active)){
        fs.renameSync(active,backup);
        movedOld=true;
      }
      fs.renameSync(next,active);
      movedNew=true;
      if(movedOld)fs.rmSync(backup,{recursive:true,force:true});
      return {ok:true,message:"Principal, Google y Custom instaladas y verificadas. Ya puedes abrir sus perfiles.",installed:3};
    }catch(error){
      if(movedOld&&!movedNew&&fs.existsSync(backup)){
        try{fs.renameSync(backup,active);}catch{}
      }
      throw error;
    }finally{
      fs.rmSync(staging,{recursive:true,force:true});
    }
  })();
  installing=task;
  try{return await task;}catch(error){
    return {ok:false,message:String(error.message||"No se pudo importar el ZIP").slice(0,180)};
  }finally{if(installing===task)installing=null;}
}
module.exports={installOriginalZip,validateFolder,EXPECTED};
