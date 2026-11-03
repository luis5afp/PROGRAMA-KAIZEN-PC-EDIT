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
let diagWindow=null;
function openDiagnosticsWindow(){
  if(diagWindow&&!diagWindow.isDestroyed()){diagWindow.show();diagWindow.focus();return;}
  diagWindow=new BrowserWindow({
    width:1020,height:820,minWidth:760,minHeight:550,title:"KAIZEN PC 1.5.35 · Diagnóstico integral",
    autoHideMenuBar:true,webPreferences:{
      preload:path.join(__dirname,"kaizen-diagnostics-preload-1.5.24.js"),
      contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true
    }
  });
  diagWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  diagWindow.loadFile(path.join(__dirname,"kaizen-diagnostics-1.5.24.html"));
  diagWindow.on("closed",()=>diagWindow=null);
}
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
  if(!menu.items.some(item=>item.label==="KAIZEN 1.5.24")){
    menu.append(new MenuItem({label:"KAIZEN 1.5.35",submenu:[
      {label:"Diagnóstico integral",accelerator:"CmdOrCtrl+Shift+D",click:openDiagnosticsWindow},
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
