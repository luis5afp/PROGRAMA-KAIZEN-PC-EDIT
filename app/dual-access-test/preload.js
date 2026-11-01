"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pruebaKaizen", Object.freeze({
  comprobar: datos => ipcRenderer.invoke("kaizen-dual-test", datos)
}));
