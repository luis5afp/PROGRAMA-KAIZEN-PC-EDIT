"use strict";
// KAIZEN ORIGINAL extension profiles: one separate Chromium user-data-dir
// for each original MV3 extension. Each selected profile starts a real
// Chromium (Chrome for Testing), loads its catalog extension plus EX1/EX2, and navigates
// to that extension's login/catalogue UI. No credentials are copied.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {spawn}=require("node:child_process");
const {app}=require("electron");

const DESCRIPTORS=Object.freeze({
  main:{dir:"KAIZZEN_MAIN",name:"KAIZZEN-MAIN",title:"Principal",version:"2.5.11"},
  google:{dir:"KAIZZEN_GOOGLE",name:"KAIZZEN-GOOGLE",title:"Google",version:"1.0.8"},
  custom:{dir:"KAIZZEN_CUSTOM",name:"KAIZZEN-CUSTOM",title:"Streaming / Custom",version:"1.0.11"}
});
const running=new Map();
const runningSecurity=new Map();
const pending=new Map();
const prepared=new Set();
let warming=null;
function appDirectory() {
  return app.isPackaged?path.dirname(process.execPath):__dirname;
}
function root() {
  return path.join(appDirectory(),"KAIZEN_EXTENSIONS");
}
// Instalaciones elegidas por el usuario quedan fuera de la carpeta del EXE;
// funciona incluso cuando Windows instala KAIZEN en Program Files.
function importedRoot() {
  return path.join(app.getPath("userData"),"kaizen-original-extensions","KAIZEN_EXTENSIONS");
}
function securityPackagesRoot(){
  return app.isPackaged?
    path.join(appDirectory(),"resources","extensionForSecurity"):
    path.resolve(__dirname,"..","runtime-resources","extensionForSecurity");
}
function validatedSecurityExtensions(){
  const base=securityPackagesRoot();
  // Both original manifests and script hashes must be valid; fail closed.
  // EX1's known missing, non-executable inject.js is a warning, not a hash bypass.
  require("./scripts/verify-security-extensions").validate(base);
  require("./scripts/verify-legacy-core-resources").verify(base);
  return ["ex1","ex2"].map(name=>path.join(base,name));
}
function browserExecutable() {
  // Google Chrome official builds no longer accept --load-extension.
  // Use bundled Chrome for Testing / non-branded Chromium ONLY.
  const candidates=[
    path.join(appDirectory(),"KAIZEN_CHROMIUM","chrome-win64","chrome.exe"),
    path.join(appDirectory(),"KAIZEN_CHROMIUM","chrome.exe")
  ];
  return candidates.find(p=>fs.existsSync(p))||"";
}
function chromeExtensionId(folder) {
  // Chromium crx_file::id_util::GenerateIdForPath: on Windows, hash the
  // normalized absolute UTF-16LE path (drive letter uppercase), then map
  // hexadecimal digits 0..f to a..p. No manifest "key" in these ZIPs.
  let full=path.win32.resolve(folder);
  if(/^[a-z]:/.test(full))full=full[0].toUpperCase()+full.slice(1);
  const hex=crypto.createHash("sha256").update(Buffer.from(full,"utf16le"))
    .digest("hex").slice(0,32);
  return hex.replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
}
function resolveDescriptor(id){
  if(typeof id!=="string"||!Object.prototype.hasOwnProperty.call(DESCRIPTORS,id))
    return null;
  const d=DESCRIPTORS[id];
  const local=path.join(importedRoot(),d.dir);
  const resource=path.join(appDirectory(),"resources","KAIZEN_EXTENSIONS",d.dir);
  // Priorizar los recursos oficiales entregados dentro de la instalación.
  // No utilizar una importación antigua si hay una versión integrada válida.
  const candidates=[resource,path.join(root(),d.dir),local];
  const folder=candidates.find(candidate=>fs.existsSync(path.join(candidate,"manifest.json")))||resource;
  const manifestFile=path.join(folder,"manifest.json");
  if(!fs.existsSync(manifestFile)||!fs.existsSync(path.join(folder,"index.html")))
    return {id,...d,folder,available:false,reason:"Falta el paquete local"};
  try{
    const m=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
    if(m.name!==d.name||m.version!==d.version||m.manifest_version!==3||
       m.action?.default_title!=="KAIZEN"||!m.background?.service_worker||
       Object.prototype.hasOwnProperty.call(m,"key"))
      return {id,...d,folder,available:false,reason:"Paquete o versión no reconocidos"};
    const worker=m.background.service_worker;
    if(typeof worker!=="string"||path.isAbsolute(worker)||
       worker.split(/[\\/]/).some(part=>!part||part==="."||part==="..")||
       !fs.existsSync(path.join(folder,worker)))
      return {id,...d,folder,available:false,reason:"Falta un archivo de la extensión"};
    return {id,...d,folder,available:true,reason:"Perfil listo"};
  }catch{return {id,...d,folder,available:false,reason:"Manifiesto inválido"};}
}
function listOriginalExtensions(){
  const found=browserExecutable();
  let securityAvailable=true;
  try{validatedSecurityExtensions();}
  catch{securityAvailable=false;}
  return Object.keys(DESCRIPTORS).map(id=>{
    const {folder,...result}=resolveDescriptor(id);
    return {...result,
      available:!!found&&result.available&&securityAvailable,
      prepared:prepared.has(id)&&securityAvailable,
      local:true,
      reason:!found?"Falta Chromium compatible incluido":
        !securityAvailable?"EX1/EX2 no están completos o no coinciden sus SHA-256":result.reason};
  });
}
/**
 * Offline preparation at KAIZEN startup.
 * Merely verifies the bundled browser/add-ons and creates three independent
 * user-data directories. It does NOT run Chromium, read cookies, access the
 * remote catalogue, or authenticate on behalf of the user.
 */
async function unpackLocalExtensionArchive(){
  // Paquetes oficiales incluidos por el build: preparación automática y
  // validada en almacenamiento persistente. Nunca escribir junto al .exe.
  const {installOriginalZip}=require("./kaizen-original-extension-importer");
  const complete=Object.keys(DESCRIPTORS).every(id=>resolveDescriptor(id)?.available);
  if(complete)return 0;
  const archivePaths=[
    path.join(appDirectory(),"KAIZEN_EXTENSIONS_Originales.zip"),
    path.join(appDirectory(),"resources","KAIZEN_EXTENSIONS_Originales.zip")
  ];
  for(const archivePath of archivePaths){
    if(!fs.existsSync(archivePath))continue;
    const outcome=await installOriginalZip(archivePath,app.getPath("userData"));
    if(outcome.ok)return outcome.installed||3;
    console.warn("[local-profiles] Paquete incorporado no válido:",String(outcome.message||"error").slice(0,120));
  }
  return 0;
}

async function warmupOriginalProfiles(){
  if(warming)return warming;
  const task=(async()=>{
    await unpackLocalExtensionArchive();
    const availableBrowser=browserExecutable();
    if(!availableBrowser)return {ok:false,prepared:0,total:3,reason:"Falta Chromium incluido"};
    try{validatedSecurityExtensions();}
    catch{
      prepared.clear();
      return {ok:false,prepared:0,total:3,reason:"Faltan archivos de EX1/EX2 o su integridad no coincide"};
    }
    const userRoot=path.join(app.getPath("userData"),"chromium-extension-profiles");
    await fs.promises.mkdir(userRoot,{recursive:true});
    let done=0;
    for(const id of Object.keys(DESCRIPTORS)){
      const d=resolveDescriptor(id);
      if(!d?.available){prepared.delete(id);continue;}
      try{
        const dir=path.join(userRoot,id);
        await fs.promises.mkdir(dir,{recursive:true});
        // Do not launch Chrome yet: user clicks "Abrir" to create the window.
        // Las extensiones integradas se leen desde resources/KAIZEN_EXTENSIONS
        // y no requieren extraer ni importar un ZIP en el equipo del usuario.
        const realDir=await fs.promises.realpath(dir);
        const realRoot=await fs.promises.realpath(userRoot);
        if(!realDir.startsWith(realRoot+path.sep))throw Error("Ruta de perfil no aislada");
        prepared.add(id);
        done++;
      }catch{prepared.delete(id);}
    }
    return {ok:done===3,prepared:done,total:3,reason:done===3?"Perfiles locales preparados":"Faltan paquetes locales"};
  })();
  warming=task;
  try{return await task;}finally{if(warming===task)warming=null;}
}

async function openOriginalExtension(id){
  // Obligatorio en todos los perfiles: la extensión del catálogo + EX1 + EX2.
  // El usuario ve los permisos y pulsa "Abrir con EX1 y EX2" expresamente.
  // An Open action may arrive before the startup warmup finishes.
  await warmupOriginalProfiles();
  const d=resolveDescriptor(id);
  if(!d)return {ok:false,message:"Perfil de extensión desconocido"};
  if(!d.available)return {ok:false,message:d.reason};
  const chrome=browserExecutable();
  if(!chrome)return {ok:false,message:"Falta el navegador Chromium incluido en KAIZEN"};
  if(pending.has(id))return pending.get(id);
  const runningProcess=running.get(id);
  if(runningProcess && runningProcess.exitCode===null && !runningProcess.killed){
    // Chromium ignores changed --load-extension flags for an already-open
    // user-data-dir. Tell the user to close it instead of claiming EX1/EX2 loaded.
    if(runningSecurity.get(id)!==true)
      return {ok:false,requiresRestart:true,message:
        "Cierra todas las ventanas de Chromium de este perfil y vuelve a abrirlo con EX1/EX2 obligatorias."};
    return {ok:true,message:"Perfil Chromium ya abierto",name:d.name,
      securityExtensions:true};
  }
  const task=(async()=>{
    try {
      const dir=path.join(app.getPath("userData"),"chromium-extension-profiles",id);
      await fs.promises.mkdir(dir,{recursive:true});
      const extId=chromeExtensionId(d.folder);
      const url="chrome-extension://"+extId+"/index.html";
      // Siempre lanzar el perfil con EX1/EX2, sin modo alternativo ni
      // instalaciones incompletas. Nunca modificar sus archivos originales.
      let folders;
      try{folders=[d.folder,...validatedSecurityExtensions()];}
      catch{
        return {ok:false,message:"EX1/EX2 no están completos o su integridad no coincide; no se abrió Chromium."};
      }
      const loadPaths=folders.join(",");
      const args=[
        "--user-data-dir="+dir,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-extensions-except="+loadPaths,
        "--load-extension="+loadPaths,
        "--new-window",
        url
      ];
      const child=spawn(chrome,args,{windowsHide:false,stdio:"ignore",shell:false});
      return await new Promise(resolve=>{
        let settled=false;
        const end=result=>{
          if(settled)return;settled=true;resolve(result);
        };
        child.once("error",()=>end({ok:false,message:"No se pudo ejecutar Chromium"}));
        child.once("spawn",()=>{
          running.set(id,child);
          runningSecurity.set(id,true);
          child.once("exit",()=>{
            if(running.get(id)===child){running.delete(id);runningSecurity.delete(id);}
          });
          end({ok:true,name:d.name,opened:"perfil Chromium",profile:id,
            securityExtensions:true});
        });
      });
    }catch{
      return {ok:false,message:"No se pudo preparar el perfil Chromium"};
    }
  })();
  pending.set(id,task);
  try{return await task;}finally{if(pending.get(id)===task)pending.delete(id);}
}
function activeSecurityProfiles(){
  return [...runningSecurity.entries()]
    .filter(([id,enabled])=>enabled&&running.get(id)?.exitCode===null&&!running.get(id)?.killed)
    .map(([id])=>id);
}
function anyRunningProfiles(){
  return [...running.values()].some(child=>child.exitCode===null&&!child.killed);
}
async function importOriginalZip(zipFile){
  if(anyRunningProfiles())return {ok:false,message:"Cierra los perfiles Chromium antes de importar otras extensiones"};
  const {installOriginalZip}=require("./kaizen-original-extension-importer");
  const result=await installOriginalZip(zipFile,app.getPath("userData"));
  if(result.ok)prepared.clear();
  return result;
}
module.exports={DESCRIPTORS,listOriginalExtensions,warmupOriginalProfiles,openOriginalExtension,
  chromeExtensionId,importOriginalZip,anyRunningProfiles,activeSecurityProfiles};
