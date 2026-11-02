"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","kaizen-original-extension-importer.js"),"utf8");
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"kaizen-original-importer-"));
const userData=path.join(scratch,"userData");
const testZip=path.join(scratch,"originales.zip");
fs.mkdirSync(userData);
fs.writeFileSync(testZip,"zip mocked - no external network");
let entries=[];
const mockUnzip={Open:{file:async()=>({files:entries})}};
const context={module:{exports:{}},exports:{},console,process,Buffer,
 require:(name)=>name==="unzipper"?mockUnzip:require(name)};
vm.runInNewContext(source,context,{filename:"kaizen-original-extension-importer.js"});
const api=context.module.exports;
function add(name,data){
  const buffer=Buffer.from(data);
  return {type:"File",path:name,vars:{uncompressedSize:buffer.length},buffer:async()=>buffer};
}
function makeEntries(version="2.5.10"){
  const arr=[];
  for(const [dir,name,v] of [["KAIZZEN_MAIN","KAIZZEN-MAIN",version],
                             ["KAIZZEN_GOOGLE","KAIZZEN-GOOGLE","1.0.7"],
                             ["KAIZZEN_CUSTOM","KAIZZEN-CUSTOM","1.0.10"]]){
    const pre="KAIZEN_EXTENSIONS/"+dir+"/";
    arr.push(add(pre+"manifest.json",JSON.stringify({
      manifest_version:3,name,version:v,
      action:{default_title:"KAIZEN"},
      background:{service_worker:"backgroundScript.js"}
    })));
    arr.push(add(pre+"index.html","<main>Original fixture, no credentials</main>"));
    arr.push(add(pre+"backgroundScript.js","// fixture"));
  }
  return arr;
}
(async()=>{
  entries=[
    {type:"Directory",path:"KAIZEN_EXTENSIONS/"},
    {type:"Directory",path:"KAIZEN_EXTENSIONS/KAIZZEN_MAIN/"},
    ...makeEntries()
  ];
  let result=await api.installOriginalZip(testZip,userData);
  assert.equal(result.ok,true,result.message);
  assert.equal(result.installed,3);
  const active=path.join(userData,"kaizen-original-extensions","KAIZEN_EXTENSIONS");
  assert.equal(api.validateFolder(active),true);
  const saved=fs.readFileSync(path.join(active,"KAIZZEN_MAIN","manifest.json"),"utf8");
  entries=makeEntries().filter(x=>!x.path.endsWith("/backgroundScript.js"));
  result=await api.installOriginalZip(testZip,userData);
  assert.equal(result.ok,false);
  assert.equal(fs.readFileSync(path.join(active,"KAIZZEN_MAIN","manifest.json"),"utf8"),saved);
  entries=makeEntries("9.0.0");
  result=await api.installOriginalZip(testZip,userData);
  assert.equal(result.ok,false);
  assert.match(result.message,/versión no reconocida/);
  entries=makeEntries();
  entries.push(add("KAIZEN_EXTENSIONS/../outside.txt","no"));
  result=await api.installOriginalZip(testZip,userData);
  assert.equal(result.ok,false);
  assert.equal(fs.existsSync(path.join(userData,"kaizen-original-extensions","outside.txt")),false);
  entries=makeEntries();entries.push(entries[0]);
  result=await api.installOriginalZip(testZip,userData);
  assert.equal(result.ok,false);
  assert.match(result.message,/duplicados/);
  entries=makeEntries();
  result=await api.installOriginalZip(testZip,userData);
  assert.equal(result.ok,true,result.message);
  assert.equal(api.validateFolder(active),true);
  console.log("KAIZEN original ZIP import: PASS (valid, missing, wrong version, traversal, duplicate, atomic replacement)");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>
  fs.rmSync(scratch,{recursive:true,force:true}));
