"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {EventEmitter}=require("node:events");
const {startStartupUpdate,checkDownloadAndRestart,FEED}=require("../kaizen-silent-updater");

class FakeUpdater extends EventEmitter {
  constructor(mode){
    super();
    this.mode=mode;
    this.checks=0;
    this.downloads=0;
    this.installs=[];
  }
  setFeedURL(feed){this.feed=feed;}
  async checkForUpdates(){
    this.checks++;
    if(this.mode==="offline")throw Error("network offline");
    if(this.mode==="available"||this.mode==="broken-download")
      this.emit("update-available",{version:"1.5.41"});
    else this.emit("update-not-available",{version:"1.5.40"});
    return {};
  }
  async downloadUpdate(){
    this.downloads++;
    if(this.mode==="broken-download")throw Error("download failed");
    this.emit("update-downloaded",{version:"1.5.41"});
    return ["test-installer"];
  }
  quitAndInstall(...args){this.installs.push(args);}
}
(async()=>{
  const current=new FakeUpdater("current");
  assert.equal(await checkDownloadAndRestart(current),true);
  assert.equal(current.checks,1);
  assert.equal(current.downloads,0);
  assert.equal(current.installs.length,0);
  assert.deepEqual(current.feed,FEED);
  assert.equal(current.autoDownload,false);
  assert.equal(current.autoInstallOnAppQuit,false);
  assert.equal(current.allowPrerelease,false);
  assert.equal(current.allowDowngrade,false);

  const newer=new FakeUpdater("available");
  assert.equal(await checkDownloadAndRestart(newer),false);
  assert.equal(newer.downloads,1);
  assert.deepEqual(newer.installs,[[true,true]],"instalacion NSIS silenciosa y reinicio");

  const offline=new FakeUpdater("offline");
  assert.equal(await checkDownloadAndRestart(offline),true,"sin red debe abrir version instalada");
  assert.equal(offline.installs.length,0);

  const incomplete=new FakeUpdater("broken-download");
  assert.equal(await checkDownloadAndRestart(incomplete),true,"descarga fallida no debe bloquear la interfaz");
  assert.equal(incomplete.installs.length,0);

  const bootstrap=new FakeUpdater("available");
  const app={isPackaged:true,whenReady:async()=>{}};
  assert.equal(await startStartupUpdate(app,bootstrap,{platform:"win32",requireConfig:false}),false);
  assert.deepEqual(bootstrap.installs,[[true,true]]);

  const root=path.join(__dirname,"..");
  const main=fs.readFileSync(path.join(root,"main.min.js"),"utf8");
  const member=fs.readFileSync(path.join(root,"main.member-test.js"),"utf8");
  const settings=fs.readFileSync(path.join(root,"electron-builder.yml"),"utf8");
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  const build=fs.readFileSync(path.join(root,"..","scripts","build-windows-integrated.ps1"),"utf8");

  assert(main.includes("require('./kaizen-silent-updater').waitForStartupUpdate()"),
    "el núcleo original debe esperar el chequeo antes de abrir una ventana");
  assert(member.includes("startStartupUpdate(app,autoUpdater)"),
    "el chequeo arranca antes que el núcleo Electron");
  assert(!member.includes("autoUpdater.checkForUpdates = async () => null"),
    "no debe quedar el inhibidor antiguo del actualizador");
  assert.match(settings,/productName: KAIZEN-PC/);
  assert.match(settings,/provider: github/);
  assert.match(settings,/oneClick: true/);
  assert.match(settings,/perMachine: false/);
  assert.match(settings,/allowElevation: false/);
  assert.equal(pkg.version,"1.5.40");
  assert.equal(pkg.productName,"KAIZEN PC","conservar nombre de datos de usuario anterior");
  assert(build.includes("latest.yml"));
  assert(build.includes("app-update.yml"));
  console.log("PASS: comprobacion inicial, descarga e instalacion silenciosa y fallback offline");
})().catch(e=>{console.error(e);process.exitCode=1;});
