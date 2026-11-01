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

ipcMain.handle("kaizen-apk-catalog-probe", async (event, token) => {
  const url = String(event.senderFrame?.url || "");
  if (!url.toLowerCase().startsWith("file:") ||
      !url.replace(/\\/g, "/").includes("/app_view/dist/index.html")) {
    return { error: "Origen de interfaz no autorizado" };
  }
  try {
    return await consultarCatalogoApk(signedHttp, BACKEND_URL, token);
  } catch (_) {
    return { error: "No se pudo consultar el catálogo." };
  }
});

// No usar main.no-updates.js aquí: ese launcher activa captura de tráfico
// completa y podría registrar tokens y contraseñas sin que el usuario lo sepa.
require("./main.min.js");
