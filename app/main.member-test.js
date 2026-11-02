"use strict";

// Lanzador exclusivo de la prueba de compatibilidad de rol member.
// Mantiene el backend, los controles de sesión y 2FA del cliente original,
// pero evita autoupdates y NO activa inspectores que capturen credenciales.
const { autoUpdater } = require("electron-updater");

for (const name of ["autoDownload", "autoInstallOnAppQuit"]) {
  try {
    Object.defineProperty(autoUpdater, name, {
      configurable: true,
      enumerable: true,
      get: () => false,
      set: () => {},
    });
  } catch (_) {
    try { autoUpdater[name] = false; } catch (_) {}
  }
}
autoUpdater.checkForUpdates = async () => null;
autoUpdater.checkForUpdatesAndNotify = async () => null;
autoUpdater.downloadUpdate = async () => [];
autoUpdater.quitAndInstall = () => false;


// Read-only APK-style catalogue probe, accessible only from the bundled UI.
// Does not record tokens or raw responses.
const { ipcMain } = require("electron");
const { consultarCatalogoApk } = require("./apk-catalog-mode");
const signedHttp = require("./axiosConfig");
const { BACKEND_URL } = require("./config");
function recordFeature(id,status,message){
  // Solo eventos de estado; nunca tokens, cookies, contraseñas ni URLs visitadas.
  try{require("./kaizen-diagnostics-1.5.24").record(id,status,message);}catch{}
}

ipcMain.handle("kaizen-apk-catalog-probe", async (event, token) => {
  const url = String(event.senderFrame?.url || "");
  if (!url.toLowerCase().startsWith("file:") ||
      !url.replace(/\\/g, "/").includes("/app_view/dist/index.html")) {
    return { error: "Origen de interfaz no autorizado" };
  }
  try {
    const result=await consultarCatalogoApk(signedHttp, BACKEND_URL, token);
    recordFeature("catalogo_apk",result?.error?"warning":"ok",
      result?.error?"Consulta APK no disponible":"Consulta de catálogo APK realizada");
    return result;
  } catch (_) {
    recordFeature("catalogo_apk","error","Falló la consulta de catálogo APK");
    return { error: "No se pudo consultar el catálogo." };
  }
});


// Android extensions / server-authorized catalogue. Tokens never leave the
// main process in the response; account permissions remain server-controlled.
const { loadVariantCatalog } = require("./android-extension-catalog");
ipcMain.handle("kaizen-android-extension-catalog", async (event, input={}) => {
  const url=String(event.senderFrame?.url||"");
  if (!url.toLowerCase().startsWith("file:") ||
      !url.replace(/\\/g,"/").includes("/app_view/dist/index.html")) {
    return {error:"Origen de interfaz no autorizado",items:[]};
  }
  try {
    const result=await loadVariantCatalog(signedHttp,BACKEND_URL,
      input.token,input.variant,input.page,input.search);
    recordFeature("variantes_android",result?.error?"warning":"ok",
      result?.error?"Consulta de variantes no disponible":"Pestaña de variantes consultada");
    return result;
  } catch (_) {
    recordFeature("variantes_android","error","Falló la consulta de variantes");
    return {error:"Error interno consultando la extensión",items:[]};
  }
});


// Original local KAIZZEN extensions, sandboxed per user profile.
// The installed add-on is loaded from beside the packaged .exe.
const originalExtensions = require("./kaizen-original-extensions-host");
// Prepare only local folders and extension metadata at app startup.
// There are NO network calls, no cookies, and no auto-authentication.
const {app}=require("electron");
app.whenReady().then(async()=>{
  try {
    const ready=await originalExtensions.warmupOriginalProfiles();
    console.info("[local-profiles] prepared "+ready.prepared+"/"+ready.total+" (offline)");
  } catch (_) {
    console.warn("[local-profiles] offline preparation unavailable");
  }
});
function isKaizenUi(event){
  const url=String(event.senderFrame?.url||"").replace(/\\/g,"/");
  return url.toLowerCase().startsWith("file:") &&
    url.includes("/app_view/dist/index.html");
}
ipcMain.handle("kaizen-original-extensions-list", async (event) => {
  if(!isKaizenUi(event))return [];
  const result=await originalExtensions.warmupOriginalProfiles();
  recordFeature("perfiles_locales",result?.ok?"ok":"warning",
    "Preparación local: "+Number(result?.prepared||0)+"/3 perfiles");
  return originalExtensions.listOriginalExtensions();
});
ipcMain.handle("kaizen-original-extension-open", async (event,id) => {
  if(!isKaizenUi(event))return {ok:false,message:"Interfaz no autorizada"};
  return await originalExtensions.openOriginalExtension(id);
});

// No usar main.no-updates.js aquí: ese launcher activa captura de tráfico
// completa y podría registrar tokens y contraseñas sin que el usuario lo sepa.
require("./main.min.js");
