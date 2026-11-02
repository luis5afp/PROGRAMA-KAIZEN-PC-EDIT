"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const vm=require("node:vm");
const crypto=require("node:crypto");
const {EventEmitter}=require("node:events");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"kaizen-chromium-profile-test-"));
const dirs=[
  ["KAIZZEN_MAIN","KAIZZEN-MAIN","2.5.6"],
  ["KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.3"],
  ["KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.6"]
];
const calls=[];
const chromiumExe=path.join(root,"KAIZEN_CHROMIUM","chrome-win64","chrome.exe");
const userData=path.join(root,"userData");
fs.mkdirSync(path.dirname(chromiumExe),{recursive:true});
fs.writeFileSync(chromiumExe,"mock binary");
for(const [dir,name,version] of dirs){
  const folder=path.join(root,"KAIZEN_EXTENSIONS",dir);
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify({
    manifest_version:3,name,version,
    action:{default_title:"KAIZEN"},background:{service_worker:"backgroundScript.js"}
  }));
  fs.writeFileSync(path.join(folder,"index.html"),"<p>test</p>");
  fs.writeFileSync(path.join(folder,"backgroundScript.js"),"// fixture");
}
function spawnMock(binary,args,options){
  const child=new EventEmitter();
  child.exitCode=null;child.killed=false;child.kill=()=>{child.killed=true;child.emit("exit",0)};
  calls.push({binary,args,options,child});
  process.nextTick(()=>child.emit("spawn"));
  return child;
}
const source=fs.readFileSync(path.join(__dirname,"..","kaizen-original-extensions-host.js"),"utf8");
const sandbox={module:{exports:{}},exports:{},Buffer,process:{
  execPath:path.join(root,"KAIZEN.exe")
},console,require:mod=>{
  if(mod==="electron")return {app:{isPackaged:true,getPath:()=>userData}};
  if(mod==="node:child_process")return {spawn:spawnMock};
  if(mod==="./kaizen-original-extension-importer")return {
    installOriginalZip:async(_zip,userDataRoot)=>{
      const dest=path.join(userDataRoot,"kaizen-original-extensions","KAIZEN_EXTENSIONS");
      for(const [folder,name,version] of dirs){
        const from=path.join(root,"KAIZEN_EXTENSIONS",folder);
        const into=path.join(dest,folder);
        fs.mkdirSync(into,{recursive:true});
        fs.copyFileSync(path.join(from,"index.html"),path.join(into,"index.html"));
        fs.copyFileSync(path.join(from,"backgroundScript.js"),path.join(into,"backgroundScript.js"));
        fs.writeFileSync(path.join(into,"manifest.json"),JSON.stringify({
          manifest_version:3,name,version,action:{default_title:"KAIZEN"},
          background:{service_worker:"backgroundScript.js"}
        }));
      }
      return {ok:true,installed:3};
    }
  };
  if(mod==="unzipper")return {Open:{file:async()=>({files:[
    {path:"KAIZEN_EXTENSIONS/KAIZZEN_MAIN/manifest.json",
      type:"File",vars:{uncompressedSize:fs.statSync(path.join(root,"KAIZEN_EXTENSIONS","KAIZZEN_GOOGLE","manifest.json")).size},
      buffer:async()=>Buffer.from(fs.readFileSync(path.join(root,"KAIZEN_EXTENSIONS","KAIZZEN_GOOGLE","manifest.json"),"utf8").replace("KAIZZEN-GOOGLE","KAIZZEN-MAIN").replace("1.0.3","2.5.6"))}
  ]})}};
  return require(mod);
}};
vm.runInNewContext(source,sandbox,{filename:"kaizen-original-extensions-host.js"});
const api=sandbox.module.exports;
async function main(){
  const items=api.listOriginalExtensions();
  assert.equal(items.filter(x=>x.available).length,3);
  assert.equal(items.map(x=>x.id).join(","),"main,google,custom");
  // Offline prewarm must prepare local storage WITHOUT starting the browser
  // or contacting the server. It can run before the KAIZEN login.
  // Simulate the user placing the original ZIP beside the EXE.
  // The application extracts only known local extension paths and then
  // prepares the three profiles without contacting a server.
  const restoreManifest=path.join(root,"KAIZEN_EXTENSIONS","KAIZZEN_MAIN","manifest.json");
  const restoreBytes=fs.readFileSync(restoreManifest);
  fs.unlinkSync(restoreManifest);
  fs.mkdirSync(path.join(root,"resources"),{recursive:true});
  fs.writeFileSync(path.join(root,"resources","KAIZEN_EXTENSIONS_Originales.zip"),"local fixture");
  const warm=await api.warmupOriginalProfiles();
  const installedMain=path.join(userData,"kaizen-original-extensions","KAIZEN_EXTENSIONS","KAIZZEN_MAIN","manifest.json");
  assert.equal(fs.readFileSync(installedMain,"utf8"),restoreBytes.toString("utf8"));
  assert.equal(fs.existsSync(restoreManifest),false); // no writes beside the EXE
  assert.equal(warm.ok,true);
  assert.equal(warm.prepared,3);
  assert.equal(calls.length,0);
  assert.deepEqual(["main","google","custom"].map(id=>fs.existsSync(path.join(userData,"chromium-extension-profiles",id))),[true,true,true]);
  assert.equal(api.listOriginalExtensions().filter(x=>x.prepared).length,3);
  const r=await api.openOriginalExtension("custom");
  assert.equal(r.ok,true);
  assert.equal(r.opened,"perfil Chromium");
  assert.equal(calls[0].binary,chromiumExe);
  assert.equal(calls[0].options.shell,false);
  assert.equal(calls[0].options.windowsHide,false);
  assert(calls[0].args.some(x=>x.startsWith("--user-data-dir=")));
  assert(calls[0].args.some(x=>x.startsWith("--load-extension=")));
  assert(calls[0].args.some(x=>x.startsWith("--disable-extensions-except=")));
  assert(calls[0].args.some(x=>x.startsWith("chrome-extension://")&&x.endsWith("/index.html")));
  assert(!calls[0].args.some(x=>x.includes("Bearer ")||x.includes("token")));
  assert.equal((await api.openOriginalExtension("custom")).message,"Perfil Chromium ya abierto");
  assert.equal(calls.length,1);
  const m=await api.openOriginalExtension("main");
  assert.equal(m.ok,true);assert.equal(calls.length,2);
  const profileArg=(i)=>calls[i].args.find(x=>x.startsWith("--user-data-dir="));
  assert.notEqual(profileArg(0),profileArg(1));
  assert.notEqual(calls[0].args.find(x=>x.startsWith("--load-extension=")),
                  calls[1].args.find(x=>x.startsWith("--load-extension=")));
  assert.equal(api.chromeExtensionId(path.join(root,"KAIZEN_EXTENSIONS","KAIZZEN_MAIN")).length,32);
  assert.match(api.chromeExtensionId(path.join(root,"KAIZEN_EXTENSIONS","KAIZZEN_MAIN")),/^[a-p]{32}$/);
  assert.equal((await api.openOriginalExtension("invalid")).ok,false);
  // Unknown or modified manifests cannot start.
  const manifest=installedMain;
  const orig=fs.readFileSync(manifest,"utf8");
  fs.writeFileSync(manifest,orig.replace('"2.5.6"','"1.2.3"'));
  assert.equal(api.listOriginalExtensions().find(x=>x.id==="main").available,false);
  fs.writeFileSync(manifest,orig);
  // No ofrecer un perfil parcial sin el script que necesita Chromium.
  const worker=path.join(userData,"kaizen-original-extensions","KAIZEN_EXTENSIONS","KAIZZEN_GOOGLE","backgroundScript.js");
  const bundledWorker=path.join(root,"KAIZEN_EXTENSIONS","KAIZZEN_GOOGLE","backgroundScript.js");
  fs.unlinkSync(worker);
  // Un paquete integrado sano debe seguir disponible aunque falle un archivo
  // de la importacion local previa.
  assert.equal(api.listOriginalExtensions().find(x=>x.id==="google").available,true);
  fs.unlinkSync(bundledWorker);
  assert.equal(api.listOriginalExtensions().find(x=>x.id==="google").available,false);
  fs.writeFileSync(bundledWorker,"// fixture");
  fs.writeFileSync(worker,"// fixture");
  // The required Chromium must exist; do not silently fall back to Google Chrome.
  fs.unlinkSync(chromiumExe);
  assert.equal(api.listOriginalExtensions().every(x=>!x.available),true);
  assert.equal((await api.openOriginalExtension("google")).ok,false);
  assert(!source.includes("session.loadExtension"));
  assert(!source.includes("api/users/login"));
  assert(!source.includes("switch-client"));
  assert(!source.includes("fetch("));
  assert(!source.includes("axios."));
  assert(!source.includes("/api/browser/get"));
  console.log("KAIZEN three isolated Chromium extension profiles: PASS");
}
main().catch(err=>{console.error(err);process.exitCode=1;})
  .finally(()=>fs.rmSync(root,{recursive:true,force:true}));
