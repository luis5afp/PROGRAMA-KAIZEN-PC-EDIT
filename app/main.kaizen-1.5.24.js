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
      opened.ok?"Se inició Chromium con su extensión de catálogo":
      "No se pudo abrir el perfil local");
    return opened;
  }catch(_){
    diagnostics.record("chromium_"+id,"error","Fallo de apertura");
    return {ok:false,message:"No se pudo abrir Chromium"};
  }
});
