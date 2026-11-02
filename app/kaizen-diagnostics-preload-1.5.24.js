"use strict";
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("kaizenDiagnostics",Object.freeze({
  overview:()=>ipcRenderer.invoke("kaizen-1524-window-overview"),
  probe:()=>ipcRenderer.invoke("kaizen-1524-window-probe")
}));
