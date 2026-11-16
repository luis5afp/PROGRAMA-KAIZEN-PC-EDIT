"use strict";
// Deliberately narrow preload: one opt-in, metadata-only live API probe.
// No generic IPC bridge, no token or cookie access from lab HTML.
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("kaizenLab",Object.freeze({
  probe:()=>ipcRenderer.invoke("kaizen-lab-live-probe")
}));
