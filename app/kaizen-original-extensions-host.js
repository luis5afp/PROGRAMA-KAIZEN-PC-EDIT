"use strict";
// Load user-supplied ORIGINAL unpacked Chrome extensions into separate
// persistent Electron Chromium sessions. No saved KAIZEN password or JWT is
// passed into any extension. No web profile archives or server role changes.
const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, session, shell, app } = require("electron");

const DESCRIPTORS=Object.freeze({
  main:{dir:"KAIZZEN_MAIN",name:"KAIZZEN-MAIN",title:"Principal",version:"2.5.6"},
  google:{dir:"KAIZZEN_GOOGLE",name:"KAIZZEN-GOOGLE",title:"Google",version:"1.0.3"},
  custom:{dir:"KAIZZEN_CUSTOM",name:"KAIZZEN-CUSTOM",title:"Streaming / Custom",version:"1.0.6"}
});
const running=new Map();
const partitions=new Map();
const pending=new Map();

function root() {
  // Never resolve extensions from remote catalogues or the app's asar.
  // In packaged Windows builds, the user's add-on ZIP is extracted next
  // to the .exe and therefore needs no admin rights or code patching.
  const parent=app.isPackaged?path.dirname(process.execPath):__dirname;
  return path.join(parent,"KAIZEN_EXTENSIONS");
}
function resolveDescriptor(id){
  if(typeof id!=="string" || !Object.hasOwn(DESCRIPTORS,id))return null;
  const d=DESCRIPTORS[id], folder=path.join(root(),d.dir);
  const manifestFile=path.join(folder,"manifest.json");
  if(!fs.existsSync(manifestFile) || !fs.existsSync(path.join(folder,"index.html")))return {id,...d,folder,available:false,reason:"Falta el paquete local"};
  try {
    const m=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
    if(m.name!==d.name || m.version!==d.version || m.manifest_version!==3 ||
        m.action?.default_title!=="KAIZEN" || !m.background?.service_worker)
      return {id,...d,folder,available:false,reason:"Paquete o versión no reconocidos"};
    return {id,...d,folder,available:true,reason:"Lista para abrir"};
  } catch {
    return {id,...d,folder,available:false,reason:"Manifiesto inválido"};
  }
}
function listOriginalExtensions(){
  return Object.keys(DESCRIPTORS).map(id=>{
    const x=resolveDescriptor(id);
    const {folder,...publicFields}=x;
    return publicFields;
  });
}
async function openOriginalExtension(id){
  const x=resolveDescriptor(id);
  if(!x)return {ok:false,message:"Extensión desconocida"};
  if(!x.available)return {ok:false,message:x.reason+"; instala KAIZEN_EXTENSIONS junto al ejecutable"};
  const old=running.get(id);
  if(old && !old.isDestroyed()){
    old.show();old.focus();
    return {ok:true,opened:"ya abierta",name:x.name};
  }
  if(pending.has(id))return pending.get(id);

  const task=(async()=>{
    try {
      // Every original extension has its own storage, cookies and proxy.
      const partitionName="persist:kaizen-original-"+id;
      const ses=session.fromPartition(partitionName);
      let extension=partitions.get(id);
      if(!extension){
        extension=await ses.loadExtension(x.folder,{allowFileAccess:false});
        if(!extension?.id || extension.name!==x.name)
          throw Error("El navegador no reconoció la extensión");
        partitions.set(id,extension);
      }
      const win=new BrowserWindow({
        width:1120,height:800,minWidth:700,minHeight:550,show:false,
        title:"KAIZEN · "+x.title,
        backgroundColor:"#080c17",autoHideMenuBar:true,
        webPreferences:{
          session:ses,nodeIntegration:false,contextIsolation:true,
          sandbox:true,webSecurity:true,allowRunningInsecureContent:false
        }
      });
      running.set(id,win);
      win.on("closed",()=>{if(running.get(id)===win)running.delete(id);});
      win.webContents.setWindowOpenHandler(({url})=>{
        try{
          const dest=new URL(url);
          if(dest.protocol==="https:" || dest.protocol==="http:"){
            // External product sites are opened in the user's system browser;
            // do not import KAIZEN cookies into those browser profiles.
            shell.openExternal(dest.href).catch(()=>{});
          }
        }catch{}
        return {action:"deny"};
      });
      const extensionUrl="chrome-extension://"+extension.id+"/index.html";
      try {
        await win.loadURL(extensionUrl);
      } catch(err) {
        if(!win.isDestroyed())win.close();
        return {ok:false,message:"No se pudo iniciar la interfaz de "+x.name+
          ". La compatibilidad de Chrome APIs debe comprobarse en este equipo."};
      }
      if(win.isDestroyed())return {ok:false,message:"Ventana cerrada durante la apertura"};
      win.show();win.focus();
      return {ok:true,name:x.name,version:x.version,opened:"ventana integrada"};
    } catch(err) {
      // Never return exception strings: they might include absolute paths or
      // internal browser details; keep diagnostics intentionally minimal.
      return {ok:false,message:"Electron no pudo cargar esta extensión original. Algunas APIs de Chrome pueden no estar disponibles."};
    }
  })();
  pending.set(id,task);
  try{return await task;}finally{if(pending.get(id)===task)pending.delete(id);}
}
module.exports={DESCRIPTORS,listOriginalExtensions,openOriginalExtension};
