"use strict";
// KAIZEN ORIGINAL extension profiles: one separate Chromium user-data-dir
// for each original MV3 extension. Each selected profile starts a real
// Chromium (Chrome for Testing), loads exactly its extension, and navigates
// to that extension's login/catalogue UI. No credentials are copied.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {spawn}=require("node:child_process");
const {app}=require("electron");

const DESCRIPTORS=Object.freeze({
  main:{dir:"KAIZZEN_MAIN",name:"KAIZZEN-MAIN",title:"Principal",version:"2.5.6"},
  google:{dir:"KAIZZEN_GOOGLE",name:"KAIZZEN-GOOGLE",title:"Google",version:"1.0.3"},
  custom:{dir:"KAIZZEN_CUSTOM",name:"KAIZZEN-CUSTOM",title:"Streaming / Custom",version:"1.0.6"}
});
const running=new Map();
const pending=new Map();
function appDirectory() {
  return app.isPackaged?path.dirname(process.execPath):__dirname;
}
function root() {
  return path.join(appDirectory(),"KAIZEN_EXTENSIONS");
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
  const d=DESCRIPTORS[id],folder=path.join(root(),d.dir);
  const manifestFile=path.join(folder,"manifest.json");
  if(!fs.existsSync(manifestFile)||!fs.existsSync(path.join(folder,"index.html")))
    return {id,...d,folder,available:false,reason:"Falta el paquete local"};
  try{
    const m=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
    if(m.name!==d.name||m.version!==d.version||m.manifest_version!==3||
       m.action?.default_title!=="KAIZEN"||!m.background?.service_worker||
       Object.prototype.hasOwnProperty.call(m,"key"))
      return {id,...d,folder,available:false,reason:"Paquete o versión no reconocidos"};
    return {id,...d,folder,available:true,reason:"Perfil listo"};
  }catch{return {id,...d,folder,available:false,reason:"Manifiesto inválido"};}
}
function listOriginalExtensions(){
  const found=browserExecutable();
  return Object.keys(DESCRIPTORS).map(id=>{
    const {folder,...result}=resolveDescriptor(id);
    return {...result,
      available:!!found&&result.available,
      reason:!found?"Falta Chromium compatible incluido":result.reason};
  });
}
async function openOriginalExtension(id){
  const d=resolveDescriptor(id);
  if(!d)return {ok:false,message:"Perfil de extensión desconocido"};
  if(!d.available)return {ok:false,message:d.reason};
  const chrome=browserExecutable();
  if(!chrome)return {ok:false,message:"Falta el navegador Chromium incluido en KAIZEN"};
  if(pending.has(id))return pending.get(id);
  const runningProcess=running.get(id);
  if(runningProcess && runningProcess.exitCode===null && !runningProcess.killed){
    // Reuse this profile's Chromium. It handles the second command line
    // itself; do not start another profile concurrently with the same dir.
    return {ok:true,message:"Perfil Chromium ya abierto",name:d.name};
  }
  const task=(async()=>{
    try {
      const dir=path.join(app.getPath("userData"),"chromium-extension-profiles",id);
      await fs.promises.mkdir(dir,{recursive:true});
      const extId=chromeExtensionId(d.folder);
      const url="chrome-extension://"+extId+"/index.html";
      const args=[
        "--user-data-dir="+dir,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-extensions-except="+d.folder,
        "--load-extension="+d.folder,
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
          child.once("exit",()=>{if(running.get(id)===child)running.delete(id);});
          end({ok:true,name:d.name,opened:"perfil Chromium",profile:id});
        });
      });
    }catch{
      return {ok:false,message:"No se pudo preparar el perfil Chromium"};
    }
  })();
  pending.set(id,task);
  try{return await task;}finally{if(pending.get(id)===task)pending.delete(id);}
}
module.exports={DESCRIPTORS,listOriginalExtensions,openOriginalExtension,chromeExtensionId};
