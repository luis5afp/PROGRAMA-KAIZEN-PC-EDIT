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
  return require(mod);
}};
vm.runInNewContext(source,sandbox,{filename:"kaizen-original-extensions-host.js"});
const api=sandbox.module.exports;
async function main(){
  const items=api.listOriginalExtensions();
  assert.equal(items.filter(x=>x.available).length,3);
  assert.deepEqual(items.map(x=>x.id),["main","google","custom"]);
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
  const manifest=path.join(root,"KAIZEN_EXTENSIONS","KAIZZEN_MAIN","manifest.json");
  const orig=fs.readFileSync(manifest,"utf8");
  fs.writeFileSync(manifest,orig.replace('"2.5.6"','"1.2.3"'));
  assert.equal(api.listOriginalExtensions().find(x=>x.id==="main").available,false);
  fs.writeFileSync(manifest,orig);
  // The required Chromium must exist; do not silently fall back to Google Chrome.
  fs.unlinkSync(chromiumExe);
  assert.equal(api.listOriginalExtensions().every(x=>!x.available),true);
  assert.equal((await api.openOriginalExtension("google")).ok,false);
  assert(!source.includes("session.loadExtension"));
  assert(!source.includes("api/users/login"));
  assert(!source.includes("switch-client"));
  console.log("KAIZEN three isolated Chromium extension profiles: PASS");
}
main().catch(err=>{console.error(err);process.exitCode=1;})
  .finally(()=>fs.rmSync(root,{recursive:true,force:true}));
