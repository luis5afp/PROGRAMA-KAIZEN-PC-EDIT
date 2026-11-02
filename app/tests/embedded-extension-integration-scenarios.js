"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const vm=require("node:vm");
const {EventEmitter}=require("node:events");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"kaizen-embedded-profiles-"));
const userData=path.join(root,"userData");
const specs=[
  ["main","KAIZZEN_MAIN","KAIZZEN-MAIN","2.5.6"],
  ["google","KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.3"],
  ["custom","KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.6"]
];
const chrome=path.join(root,"KAIZEN_CHROMIUM","chrome-win64","chrome.exe");
const calls=[];
try{
  fs.mkdirSync(userData,{recursive:true});
  fs.mkdirSync(path.dirname(chrome),{recursive:true});
  fs.writeFileSync(chrome,"fixture");
  for(const [id,dir,name,version] of specs){
    const folder=path.join(root,"resources","KAIZEN_EXTENSIONS",dir);
    fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify({
      manifest_version:3,name,version,action:{default_title:"KAIZEN"},
      background:{service_worker:"backgroundScript.js"}
    }));
    fs.writeFileSync(path.join(folder,"index.html"),"<html>test</html>");
    fs.writeFileSync(path.join(folder,"backgroundScript.js"),"// fixture");
    // Incluso si existe una importación anterior, debe ganar la integrada.
    if(id==="main"){
      const stale=path.join(userData,"kaizen-original-extensions","KAIZEN_EXTENSIONS",dir);
      fs.mkdirSync(stale,{recursive:true});
      fs.writeFileSync(path.join(stale,"manifest.json"),"{}");
      fs.writeFileSync(path.join(stale,"index.html"),"stale");
    }
  }
  const source=fs.readFileSync(path.join(__dirname,"..","kaizen-original-extensions-host.js"),"utf8");
  let imports=0;
  const sandbox={
    module:{exports:{}},exports:{},Buffer,process:{execPath:path.join(root,"KAIZEN.exe")},
    console,require:mod=>{
      if(mod==="electron")return {app:{isPackaged:true,getPath:()=>userData}};
      if(mod==="node:child_process")return {spawn:(bin,args,opts)=>{
        const child=new EventEmitter();
        child.exitCode=null;child.killed=false;
        calls.push({bin,args,opts,child});
        process.nextTick(()=>child.emit("spawn"));
        return child;
      }};
      if(mod==="./kaizen-original-extension-importer")return {installOriginalZip:async()=>{
        imports++;return {ok:false,message:"no debe importar"};
      }};
      return require(mod);
    }
  };
  vm.runInNewContext(source,sandbox,{filename:"kaizen-original-extensions-host.js"});
  const api=sandbox.module.exports;
  (async()=>{
    const before=api.listOriginalExtensions();
    assert.equal(before.filter(x=>x.available).length,3);
    assert.equal(before.filter(x=>x.prepared).length,0);
    const warm=await api.warmupOriginalProfiles();
    assert.equal(warm.prepared,3);
    assert.equal(imports,0,"sin ZIP ni importador");
    assert.equal(calls.length,0,"no abre Chromium sin pulsar");
    for(const [id,dir] of specs){
      const opened=await api.openOriginalExtension(id);
      assert.equal(opened.ok,true,id);
      const call=calls[calls.length-1];
      assert.equal(call.bin,chrome);
      assert.equal(call.opts.shell,false);
      assert(call.args.some(x=>x==="--load-extension="+path.join(root,"resources","KAIZEN_EXTENSIONS",dir)));
      assert(call.args.some(x=>x.startsWith("chrome-extension://")&&x.endsWith("/index.html")));
    }
    const dirs=calls.map(x=>x.args.find(a=>a.startsWith("--user-data-dir=")));
    assert.equal(new Set(dirs).size,3,"perfiles aislados");
    assert.equal(imports,0);
    console.log("KAIZEN recursos internos: 3 perfiles preparados y botones Chromium verificados por mock; PASS");
  })().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(root,{force:true,recursive:true}));
}catch(e){fs.rmSync(root,{force:true,recursive:true});throw e;}
