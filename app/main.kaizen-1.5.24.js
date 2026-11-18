"use strict";
// Official KAIZEN 1.5.24 portable entrypoint.
// This release intentionally avoids the old main.no-updates diagnostic
// interceptors, which exported private session data to plaintext files.
const {ipcMain}=require("electron");
const diagnostics=require("./kaizen-diagnostics-1.5.24");
const originals=require("./kaizen-original-extensions-host");
require("./main.member-test");
// Prevent the legacy LAB endpoint from exporting extension sessions or cookies
// in plaintext. Diagnostics are metadata-only in this release.
ipcMain.removeHandler("extension-sessions-export");
ipcMain.handle("extension-sessions-export",async()=>({ok:false,reason:"disabled-for-privacy"}));
const authorize=event=>{
  const url=String(event.senderFrame?.url||"").replace(/\\/g,"/");
  return url.toLowerCase().startsWith("file:")&&url.includes("/app_view/dist/index.html");
};
ipcMain.handle("kaizen-1524-overview",async event=>{
  if(!authorize(event))return {error:"Origen no autorizado"};
  return diagnostics.overview();
});
ipcMain.handle("kaizen-1524-remote-checks",async(event,token)=>{
  if(!authorize(event))return {error:"Origen no autorizado"};
  return diagnostics.remoteChecks(token);
});
// Connect real profile-opening results into the diagnostics feed.
ipcMain.removeHandler("kaizen-original-extension-open");
ipcMain.handle("kaizen-original-extension-open",async(event,id)=>{
  if(!authorize(event))return {ok:false,message:"Interfaz no autorizada"};
  if(!["main","google","custom"].includes(id))return {ok:false,message:"Perfil no reconocido"};
  diagnostics.record("chromium_"+id,"pending","Solicitando apertura de perfil local");
  try{
    const opened=await originals.openOriginalExtension(id);
    diagnostics.record("chromium_"+id,opened.ok?"ok":"error",
      opened.ok?"Chromium iniciado con el perfil original, EX1 y EX2 verificados":
        "No se pudo abrir el perfil con EX1/EX2 obligatorios");
    if(opened.ok)diagnostics.record("security_extensions","ok",
      "EX1 y EX2 incluidas obligatoriamente en el perfil solicitado");
    return opened;
  }catch(_){
    diagnostics.record("chromium_"+id,"error","Fallo de apertura");
    return {ok:false,message:"No se pudo abrir Chromium"};
  }
});

// El selector pide el archivo en el proceso principal; la interfaz no obtiene
// rutas del disco ni puede ordenar importar archivos arbitrarios.
ipcMain.handle("kaizen-original-extensions-import",async(event)=>{
  if(!authorize(event))return {ok:false,message:"Interfaz no autorizada"};
  try{
    const {dialog,BrowserWindow}=require("electron");
    const parent=BrowserWindow.fromWebContents(event.sender);
    const options={title:"Seleccionar ZIP original de extensiones KAIZEN",
      properties:["openFile"],filters:[{name:"Paquete original KAIZEN (ZIP)",extensions:["zip"]}]};
    const selected=parent?await dialog.showOpenDialog(parent,options):await dialog.showOpenDialog(options);
    if(selected.canceled||!selected.filePaths?.length)
      return {ok:false,canceled:true,message:"Importación cancelada"};
    const outcome=await originals.importOriginalZip(selected.filePaths[0]);
    diagnostics.record("original_extensions",outcome.ok?"ok":"warning",
      outcome.ok?"Tres extensiones originales importadas y validadas":
      "Importación no completada");
    return outcome;
  }catch{
    diagnostics.record("original_extensions","error","Error al importar paquete local");
    return {ok:false,message:"No se pudo importar el ZIP original"};
  }
});

const {app,BrowserWindow,Menu,MenuItem}=require("electron");
const path=require("node:path");
const KAIZEN_VERSION=require("./package.json").version;
let diagWindow=null;
let labWindow=null;
function openDiagnosticsWindow(){
  if(diagWindow&&!diagWindow.isDestroyed()){diagWindow.show();diagWindow.focus();return;}
  diagWindow=new BrowserWindow({
    width:1020,height:820,minWidth:760,minHeight:550,title:"KAIZEN PC "+KAIZEN_VERSION+" · Diagnóstico integral",
    autoHideMenuBar:true,webPreferences:{
      preload:path.join(__dirname,"kaizen-diagnostics-preload-1.5.24.js"),
      contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true
    }
  });
  diagWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  diagWindow.loadFile(path.join(__dirname,"kaizen-diagnostics-1.5.24.html"));
  diagWindow.on("closed",()=>diagWindow=null);
}
// 1.5.42 laboratory and opt-in metadata diagnostics, separate in-memory
// Electron session. No preload bridge, IPC, real catalogue or credentials.
// The HTML CSP additionally blocks network connections and form submission.
function openLaboratoryWindow(){
  if(labWindow&&!labWindow.isDestroyed()){
    labWindow.show();
    labWindow.focus();
    return;
  }
  const labFile=path.join(__dirname,"lab","index.html");
  const allowedUrl=require("node:url").pathToFileURL(labFile).href;
  labWindow=new BrowserWindow({
    width:1140,height:880,minWidth:760,minHeight:620,
    title:"KAIZEN PC "+KAIZEN_VERSION+" · Laboratorio + Diagnóstico real",
    autoHideMenuBar:true,
    webPreferences:{
      partition:"kaizen-1542-lab-memory-only",
      preload:path.join(__dirname,"lab","kaizen-1542-preload.js"),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true,
      webSecurity:true
    }
  });
  labWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  labWindow.webContents.on("will-navigate",(event,url)=>{
    if(url!==allowedUrl)event.preventDefault();
  });
  labWindow.webContents.session.setPermissionRequestHandler((_wc,_perm,answer)=>answer(false));
  labWindow.webContents.session.setPermissionCheckHandler(()=>false);
  labWindow.loadFile(labFile).catch(()=>{
    if(labWindow&&!labWindow.isDestroyed())labWindow.close();
  });
  labWindow.on("closed",()=>{labWindow=null;});
}
// The main KAIZEN window is frameless and auto-hides its native menu.
// Give the renderer a narrowly scoped way to open ONLY the synthetic lab.
ipcMain.handle("kaizen-lab-open",async event=>{
  if(!authorize(event))return {ok:false,message:"Origen no autorizado"};
  openLaboratoryWindow();
  return {ok:true};
});
// Only the lab's top-level window can ask for an explicit read-only probe.
// The API token stays in the main process; no credentials or raw JSON are sent
// to the laboratory. This checks desktop-session APIs, NOT extension roles.
let lastLabApiProbe=0;
let labApiProbeRunning=false;
ipcMain.handle("kaizen-lab-live-probe",async event=>{
  if(!labWindow||labWindow.isDestroyed()||
      event.sender!==labWindow.webContents||
      event.senderFrame!==labWindow.webContents.mainFrame)
    return {ok:false,message:"Ventana no autorizada"};
  const now=Date.now();
  if(labApiProbeRunning||now-lastLabApiProbe<15000)
    return {ok:false,message:"Una consulta está en curso o se realizó hace pocos segundos."};
  lastLabApiProbe=now;
  labApiProbeRunning=true;
  let token="";
  try{
    const win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&
      String(w.webContents.getURL()||"").replace(/\\/g,"/").includes("/app_view/dist/index.html"));
    if(!win)return {ok:false,message:"Abre e inicia sesión en la ventana principal de KAIZEN PC."};
    token=await win.webContents.executeJavaScript("window.localStorage.getItem('token') || ''",true);
    if(typeof token!=="string"||!token||token.length>8192)
      return {ok:false,message:"La ventana principal de KAIZEN PC no tiene una sesión iniciada. El acceso a KAIZZEN-GOOGLE es independiente. Puedes comparar los informes sin iniciar sesión en el escritorio."};
    return await diagnostics.remoteChecks(token);
  }catch(_){
    return {ok:false,message:"No se pudo obtener una respuesta de la sesión del escritorio."};
  }finally{
    token="";
    labApiProbeRunning=false;
  }
});
function authorizedDiagnosticsWindow(event){
  return diagWindow&&!diagWindow.isDestroyed()&&event.sender===diagWindow.webContents;
}
ipcMain.handle("kaizen-1524-window-overview",async event=>{
  if(!authorizedDiagnosticsWindow(event))return {error:"Ventana no autorizada"};
  return diagnostics.overview();
});
ipcMain.handle("kaizen-1524-window-probe",async event=>{
  if(!authorizedDiagnosticsWindow(event))return {ok:false,message:"Ventana no autorizada"};
  const window=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&
    String(w.webContents.getURL()||"").replace(/\\/g,"/").includes("/app_view/dist/index.html"));
  if(!window)return {ok:false,message:"Abre la ventana principal de KAIZEN"};
  let token="";
  try{
    token=await window.webContents.executeJavaScript(
      "window.localStorage.getItem('token') || ''",true);
    const result=await diagnostics.remoteChecks(token);
    return result;
  }catch(_){
    return {ok:false,message:"No hay una sesión válida para la consulta"};
  }finally{token="";}
});
function installDiagnosticMenu(){
  const menu=Menu.getApplicationMenu()||Menu.buildFromTemplate([]);
  if(!menu.items.some(item=>item.label==="KAIZEN "+KAIZEN_VERSION)){
    menu.append(new MenuItem({label:"KAIZEN "+KAIZEN_VERSION,submenu:[
      {label:"Diagnóstico integral",accelerator:"CmdOrCtrl+Shift+D",click:openDiagnosticsWindow},
      {label:"Laboratorio 233 tarjetas · SOLO PRUEBAS",accelerator:"CmdOrCtrl+Shift+L",click:openLaboratoryWindow},
      {label:"Abrir lista de perfiles",click:()=>{
        const w=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&
           String(w.webContents.getURL()||"").replace(/\\/g,"/").includes("/app_view/dist/index.html"));
        if(w){w.show();w.focus();}
      }}
    ]}));
    Menu.setApplicationMenu(menu);
  }
}
app.whenReady().then(installDiagnosticMenu);
app.on("browser-window-created",()=>setTimeout(installDiagnosticMenu,1000));

// Suppress obsolete diagnostic UI controls in the production window.
// The original preload may still define them, but their plaintext-export
// IPC was disabled above; use Ctrl+Shift+D for sanitized diagnostics.
app.on("browser-window-created",(_event,w)=>{
  w.webContents.on("did-finish-load",()=>{
    const url=String(w.webContents.getURL()||"").replace(/\\/g,"/");
    if(url.toLowerCase().startsWith("file:") && url.includes("/app_view/dist/index.html")){
      w.webContents.insertCSS(
        "#kaizen-extension-sessions-button,#kaizen-diagnostics-folder-button{display:none!important;}"
      ).catch(()=>{});
    }
  });
});
