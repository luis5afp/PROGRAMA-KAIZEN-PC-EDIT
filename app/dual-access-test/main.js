"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { ejecutarPrueba } = require("./service");
let ventana = null;

app.whenReady().then(() => {
  ventana = new BrowserWindow({
    width: 790, height: 820, minWidth: 650, minHeight: 640,
    title: "KAIZEN - Prueba de doble credencial",
    autoHideMenuBar: true,
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "kaizen-dual-credential-inmemory"
    }
  });
  ventana.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ventana.loadFile(path.join(__dirname, "index.html"));
});

ipcMain.handle("kaizen-dual-test", async (event, datos) => {
  if (!ventana || event.sender !== ventana.webContents) {
    return { ok: false, pasos: [{ id: "seguridad", ok: false, detalle: "Ventana no autorizada." }] };
  }
  if (!datos || typeof datos !== "object") {
    return { ok: false, pasos: [{ id: "entrada", ok: false, detalle: "Datos incompletos." }] };
  }
  const primera = datos.primera || {};
  const segunda = datos.segunda || {};
  if ([primera.email, segunda.email, primera.password, segunda.password].some(
      value => typeof value !== "string" || value.length > 1024)) {
    return { ok: false, pasos: [{ id: "entrada", ok: false, detalle: "Campos inválidos." }] };
  }
  try {
    // Se reutilizan la firma y el host del cliente original. Ninguno se imprime.
    const http = require("../axiosConfig");
    const { BACKEND_URL } = require("../config");
    return await ejecutarPrueba({ http, baseUrl: BACKEND_URL, primera, segunda });
  } catch (_) {
    return { ok: false, pasos: [{ id: "configuracion", ok: false,
      detalle: "No se pudieron cargar las dependencias o la configuración de KAIZEN." }] };
  }
});

app.on("window-all-closed", () => app.quit());
