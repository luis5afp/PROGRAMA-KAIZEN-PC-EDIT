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

// No usar main.no-updates.js aquí: ese launcher activa captura de tráfico
// completa y podría registrar tokens y contraseñas sin que el usuario lo sepa.
require("./main.min.js");
