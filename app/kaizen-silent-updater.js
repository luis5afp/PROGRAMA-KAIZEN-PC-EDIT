"use strict";
// Startup-only, unattended update gate for KAIZEN Windows NSIS installs.
// A failed/offline check must never prevent the currently installed app
// from opening. No renderer, account session, browser profile or cookies
// participate in the update check.
const fs=require("node:fs");
const path=require("node:path");
const FEED=Object.freeze({
  provider:"github",
  owner:"luis5afp",
  repo:"PROGRAMA-KAIZEN-PC-EDIT"
});
let started=false;
let startupDecision=Promise.resolve(true);

function withTimeout(promise,milliseconds,label){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(label+" timed out")),milliseconds);
    })
  ]).finally(()=>clearTimeout(timer));
}

async function checkDownloadAndRestart(updater,options={}){
  const checkTimeoutMs=options.checkTimeoutMs||20000;
  const downloadTimeoutMs=options.downloadTimeoutMs||12*60*1000;
  let updateFound=false;
  const onAvailable=()=>{updateFound=true;};
  const onError=error=>{
    // Do not log release metadata, URLs, credentials or request headers.
    console.warn("[kaizen-update] fallo de actualización: "+String(error?.code||"sin conexión"));
  };
  updater.on("update-available",onAvailable);
  updater.on("error",onError);
  try{
    updater.autoDownload=false;
    updater.autoInstallOnAppQuit=false;
    updater.allowPrerelease=false;
    updater.allowDowngrade=false;
    updater.setFeedURL(FEED);
    await withTimeout(updater.checkForUpdates(),checkTimeoutMs,"Update check");
    if(!updateFound) return true;

    let removeDownloadListeners=()=>{};
    const completed=new Promise((resolve,reject)=>{
      const cleanup=()=>{
        updater.removeListener("update-downloaded",success);
        updater.removeListener("error",failure);
      };
      const success=()=>{cleanup();resolve();};
      const failure=()=>{cleanup();reject(new Error("Update download failed"));};
      removeDownloadListeners=cleanup;
      updater.once("update-downloaded",success);
      updater.once("error",failure);
    });
    try{
      await withTimeout(Promise.all([
        completed,
        Promise.resolve().then(()=>updater.downloadUpdate())
      ]),downloadTimeoutMs,"Update download");
    } finally {
      removeDownloadListeners();
    }

    // The NSIS installer is per-user and must restart KAIZEN after a
    // silent replacement. This call quits the process, so never open
    // the old UI once the update has been handed to the installer.
    updater.quitAndInstall(true,true);
    return false;
  }catch(error){
    console.warn("[kaizen-update] se conserva la versión instalada: "+
      String(error?.code||"actualización no disponible"));
    return true;
  }finally{
    updater.removeListener("update-available",onAvailable);
    updater.removeListener("error",onError);
  }
}

function startStartupUpdate(app,updater,options={}){
  if(started)return startupDecision;
  started=true;
  if(!app.isPackaged||(options.platform||process.platform)!=="win32")return startupDecision;
  // Do not let portable previews or half-installed packages silently
  // consume the public stable channel. NSIS installs include this file.
  if(options.requireConfig!==false &&
      !fs.existsSync(path.join(process.resourcesPath||"","app-update.yml")))
    return startupDecision;
  startupDecision=Promise.resolve()
    .then(()=>app.whenReady())
    .then(()=>checkDownloadAndRestart(updater,options))
    .catch(()=>true);
  return startupDecision;
}

function waitForStartupUpdate(){return startupDecision;}

module.exports={startStartupUpdate,waitForStartupUpdate,checkDownloadAndRestart,FEED};
