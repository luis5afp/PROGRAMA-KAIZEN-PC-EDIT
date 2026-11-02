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
  ["main","KAIZZEN_MAIN","KAIZZEN-MAIN","2.5.11"],
  ["google","KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.8"],
  ["custom","KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.11"]
];
const chrome=path.join(root,"KAIZEN_CHROMIUM","chrome-win64","chrome.exe");
const calls=[];
const validations=[];
let securityValid=true;
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
  for(const name of ["ex1","ex2"]){
    const folder=path.join(root,"resources","extensionForSecurity",name);
    fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify({manifest_version:3,name}));
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
      if(mod==="./scripts/verify-security-extensions")return {validate:(folder)=>{
        validations.push(["package",folder]);
        if(!securityValid)throw Error("security package corrupt");
      }};
      if(mod==="./scripts/verify-legacy-core-resources")return {verify:(folder)=>{
        validations.push(["sha256",folder]);
        if(!securityValid)throw Error("hash does not match");
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
      assert.equal(opened.securityExtensions,true,"EX1/EX2 obligatorias");
      const call=calls[calls.length-1];
      assert.equal(call.bin,chrome);
      assert.equal(call.opts.shell,false);
      const main=path.join(root,"resources","KAIZEN_EXTENSIONS",dir);
      const ex1=path.join(root,"resources","extensionForSecurity","ex1");
      const ex2=path.join(root,"resources","extensionForSecurity","ex2");
      assert(call.args.includes("--load-extension="+[main,ex1,ex2].join(",")));
      assert(call.args.includes("--disable-extensions-except="+[main,ex1,ex2].join(",")));
      assert(call.args.some(x=>x.startsWith("chrome-extension://")&&x.endsWith("/index.html")));
    }
    assert.equal(api.activeSecurityProfiles().length,3);
    const dirs=calls.map(x=>x.args.find(a=>a.startsWith("--user-data-dir=")));
    assert.equal(new Set(dirs).size,3,"perfiles aislados");
    assert.equal(imports,0);
    assert(validations.some(x=>x[0]==="package"),"validación de manifiestos");
    assert(validations.some(x=>x[0]==="sha256"),"validación SHA256");
    const same=await api.openOriginalExtension("main");
    assert.equal(same.ok,true);
    assert.equal(calls.length,3,"no duplicar proceso por perfil");
    const first=calls[0].child;
    first.exitCode=0;first.emit("exit",0);
    securityValid=false;
    const unavailable=api.listOriginalExtensions();
    assert.equal(unavailable.filter(x=>x.available).length,0,
      "sin EX1/EX2 válidas no hay perfiles disponibles");
    const rejected=await api.openOriginalExtension("main");
    assert.equal(rejected.ok,false,"rechazar hashes modificados o paquetes ausentes");
    assert.equal(calls.length,3,"nunca iniciar sin EX1 y EX2 verificadas");
    securityValid=true;
    const secured=await api.openOriginalExtension("main");
    assert.equal(secured.ok,true);
    assert.equal(secured.securityExtensions,true);
    assert.equal(calls.length,4);
    const release=calls[3].child;
    release.exitCode=0;release.emit("exit",0);
    assert.equal(api.activeSecurityProfiles().join(","),"google,custom");
    const selector=fs.readFileSync(path.join(__dirname,"..","original-extension-selector-preload.js"),"utf8");
    const ipc=fs.readFileSync(path.join(__dirname,"..","main.kaizen-1.5.24.js"),"utf8");
    assert(selector.includes("Abrir perfil con EX1 y EX2"));
    assert(!selector.includes("securityCheckbox"),"no permitir apertura sin EX1/EX2");
    assert(ipc.includes("originals.openOriginalExtension(id);"));
    assert(!ipc.includes("includeSecurity"));
    console.log("KAIZEN perfiles obligatorios: 3 extensiones por Chromium, verificación SHA256 y cierre ante fallos; PASS");
  })().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(root,{force:true,recursive:true}));
}catch(e){fs.rmSync(root,{force:true,recursive:true});throw e;}
