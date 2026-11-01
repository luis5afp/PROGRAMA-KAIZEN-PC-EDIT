"use strict";
// Contract tests run in plain Node; do not start Chrome or require real users.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const vm=require("node:vm");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"kaizen-original-ext-test-"));
const packageRoot=path.join(root,"KAIZEN_EXTENSIONS");
const dirs=[
  ["KAIZZEN_MAIN","KAIZZEN-MAIN","2.5.6"],
  ["KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.3"],
  ["KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.6"]
];
const sessions=new Map();
const loads=[];
const windows=[];
let lastBrowserUrl="";
class MockWindow{
  constructor(opts){
    this.options=opts;this.destroyed=false;
    this.webContents={setWindowOpenHandler:fn=>{this.newWindowHandler=fn;}};
    windows.push(this);
  }
  on(name,cb){if(name==="closed")this.onClosed=cb;}
  isDestroyed(){return this.destroyed;}
  close(){this.destroyed=true;this.onClosed?.();}
  show(){this.showed=true;}
  focus(){this.focused=true;}
  async loadURL(url){lastBrowserUrl=url;this.url=url;}
}
const electron={
  BrowserWindow:MockWindow,
  app:{isPackaged:true},
  shell:{openExternal:async()=>{}},
  session:{
    fromPartition:(id)=>{
      if(!sessions.has(id)){
        sessions.set(id,{
          loadExtension:async (folder)=>{
            loads.push({id,folder});
            const m=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8"));
            return {id:"abcdefghijklmnopabcdefghijklmnop",name:m.name};
          }
        });
      }
      return sessions.get(id);
    }
  }
};
const source=fs.readFileSync(path.join(__dirname,"..","kaizen-original-extensions-host.js"),"utf8");
const sandbox={module:{exports:{}},exports:{},
  require:mod=>mod==="electron"?electron:require(mod),
  process:{execPath:path.join(root,"KAIZEN.exe")},console};
vm.runInNewContext(source,sandbox,{filename:"kaizen-original-extensions-host.js"});
const api=sandbox.module.exports;
(async()=>{
  assert.equal(api.listOriginalExtensions().filter(x=>x.available).length,0);
  for(const [folder,name,version] of dirs){
    const target=path.join(packageRoot,folder);
    fs.mkdirSync(target,{recursive:true});
    fs.writeFileSync(path.join(target,"manifest.json"),JSON.stringify({
      manifest_version:3,name,version,action:{default_title:"KAIZEN"},
      background:{service_worker:"backgroundScript.js"}
    }));
    fs.writeFileSync(path.join(target,"index.html"),"<h1>Test</h1>");
  }
  assert.equal(api.listOriginalExtensions().filter(x=>x.available).length,3);
  assert.equal((await api.openOriginalExtension("unknown")).ok,false);
  assert.equal(loads.length,0);
  const main=await api.openOriginalExtension("main");
  assert.equal(main.ok,true);assert.equal(main.name,"KAIZZEN-MAIN");
  assert.equal(windows[0].options.webPreferences.nodeIntegration,false);
  assert.equal(windows[0].options.webPreferences.sandbox,true);
  assert.equal(windows[0].options.webPreferences.session,sessions.get("persist:kaizen-original-main"));
  assert.match(lastBrowserUrl,/^chrome-extension:\/\/[a-p]{32}\/index\.html$/);
  assert.equal((await api.openOriginalExtension("main")).opened,"ya abierta");
  assert.equal(loads.length,1);
  const custom=await api.openOriginalExtension("custom");
  assert.equal(custom.ok,true);
  assert.equal(windows[0].destroyed,true);
  assert.equal(windows[1].destroyed,false);
  assert.notEqual(windows[0].options.webPreferences.session,windows[1].options.webPreferences.session);
  assert.equal((await api.openOriginalExtension("google")).ok,true);
  assert.equal(loads.length,3);
  // Unsupported/changed versions must not be loaded silently.
  fs.writeFileSync(path.join(packageRoot,"KAIZZEN_MAIN","manifest.json"),JSON.stringify({
    manifest_version:3,name:"KAIZZEN-MAIN",version:"0.0.0",action:{default_title:"KAIZEN"},background:{service_worker:"backgroundScript.js"}
  }));
  const altered=api.listOriginalExtensions().find(x=>x.id==="main");
  assert.equal(altered.available,false);
  assert(!source.includes("/api/users/switch-client"));
  assert(!source.includes("twofaToken"));
  console.log("KAIZEN original extension integration: PASS (10 checks)");
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
