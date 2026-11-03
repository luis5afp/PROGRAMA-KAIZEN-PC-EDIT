"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const src=fs.readFileSync(path.join(__dirname,"..","kaizen-diagnostics-1.5.24.js"),"utf8");
const handlers={
  "/api/verify-token":{status:200,data:{user:{role:"member",email:"hidden@example.org",token:"SUPER_PRIVATE"}}},
  "/api/browser/get":{status:403},
  "/api/browser/group/get":{status:403},
  "/api/browser/variant-profiles":{status:200,data:{profiles:[]}},
  "/api/products/getmostusedtool":{status:200,data:{products:"encrypted-response-not-exposed"}}
};
const requests=[];
const http={get:async (url,opts)=>{
  const route=new URL(url).pathname.replace(/^\/v\/abc/,"");
  requests.push({route,token:opts.headers.Authorization});
  const response=handlers[route];
  if(!response)throw Error("unexpected API");
  if(response.status!==200)throw {response:{status:response.status,data:{secret:"DO_NOT_EXPOSE"}}};
  return response;
}};
const fakeLocal={
 warmupOriginalProfiles:async()=>({ok:true,prepared:3}),
 listOriginalExtensions:()=>[
  {id:"main",title:"Principal",name:"KAIZZEN-MAIN",version:"2.5.11",available:true,prepared:true},
  {id:"google",title:"Google",name:"KAIZZEN-GOOGLE",version:"1.0.8",available:true,prepared:true},
  {id:"custom",title:"Streaming",name:"KAIZZEN-CUSTOM",version:"1.0.11",available:true,prepared:true}
 ]
};
const fakeApp={isPackaged:false};
const sandbox={module:{exports:{}},exports:{},Buffer,console,process,Date,URL,require:name=>{
 if(name==="electron")return {app:fakeApp};
 if(name==="./axiosConfig")return http;
 if(name==="./config")return {BACKEND_URL:"https://example.org/v/abc"};
 if(name==="./kaizen-original-extensions-host")return fakeLocal;
 if(name==="./scripts/verify-legacy-core-resources")
   return require("../scripts/verify-legacy-core-resources");
 return require(name);
},__dirname:path.join(__dirname,"..")};
vm.runInNewContext(src,sandbox,{filename:"diagnostics.js"});
const {record,overview,remoteChecks}=sandbox.module.exports;
(async()=>{
 const local=await overview();
 assert.equal(local.version,"1.5.32");
 assert.equal(local.prepared,3);
 assert.equal(local.profiles.length,3);
 assert.equal(local.security.length,2);
 assert.equal(local.integrity.total,6);
 assert.equal(local.integrity.verified,6);
 assert.equal(local.integrity.ok,true);
 assert.equal(local.integrity.failedFiles.length,0);
 assert.equal(local.chromiumReady,true);
 assert(Array.isArray(local.features));
 assert(local.features.some(x=>x.id==="catalogo_apk"));
 assert(local.features.some(x=>x.id==="variantes_android"));
 assert(local.features.some(x=>x.id==="apertura_chromium"));
 assert.equal(local.security.every(x=>x.active===false),true);
 assert.equal(local.security.map(x=>x.name).join(","),"ex1,ex2");
 // EX1 original: Chrome puede cargarlo aunque declare un inject.js
 // no incluido. El diagnóstico no debe marcarlo "incompleto" por eso.
 const ex1=local.security.find(x=>x.name==="ex1");
 const ex2=local.security.find(x=>x.name==="ex2");
 assert.equal(ex1.installed,true);
 assert.equal(ex1.warning,true);
 assert.match(ex1.note,/inject\.js/);
 assert.equal(ex2.installed,true);
 assert.equal(ex1.active,false);
 assert.equal(ex2.active,false);
 const noToken=await remoteChecks("");
 assert.equal(noToken.ok,false);
 assert.equal(requests.length,0);
 const r=await remoteChecks("dummy_test_bearer");
 assert.equal(r.ok,true);
 assert.equal(r.checks.length,5);
 const eventHistory=(await overview()).events;
 assert(eventHistory.some(x=>x.area==="http_envio"&&x.description.includes("GET /api/browser/get")));
 assert(eventHistory.some(x=>x.area==="http_recibido"&&x.description.includes("HTTP 200")));
 assert(eventHistory.some(x=>x.area==="http_error"&&x.description.includes("HTTP 403")));
 assert(!JSON.stringify(eventHistory).includes("dummy_test_bearer"));
 assert(!JSON.stringify(eventHistory).includes("hidden@example.org"));
 assert.equal(r.checks.find(x=>x.id==="perfiles_chrome").http,403);
 assert.equal(r.checks.find(x=>x.id==="grupos").http,403);
 assert.equal(r.checks.find(x=>x.id==="variantes_android").count,0);
 assert.equal(r.checks.find(x=>x.id==="cuenta").role,"member");
 assert(!JSON.stringify(r).includes("dummy_test_bearer"));
 assert(!JSON.stringify(r).includes("hidden@example.org"));
 assert(!JSON.stringify(r).includes("SUPER_PRIVATE"));
 assert(!JSON.stringify(r).includes("DO_NOT_EXPOSE"));
 record("chromium_main","ok","Perfil iniciado");
 const seen=await overview();
 assert(seen.events.some(x=>x.area==="chromium_main"&&x.status==="ok"));
 assert.equal(seen.security.every(x=>x.active===false),true);
 const html=fs.readFileSync(path.join(__dirname,"..","kaizen-diagnostics-1.5.24.html"),"utf8");
 const renderer=fs.readFileSync(path.join(__dirname,"..","kaizen-diagnostics-renderer-1.5.24.js"),"utf8");
 const panel=fs.readFileSync(path.join(__dirname,"..","kaizen-diagnostics-ui-1.5.24.js"),"utf8");
 const preload=fs.readFileSync(path.join(__dirname,"..","preload.min.js"),"utf8");
 for(const key of ["integrity","features","security","profiles","events","remote"])
   assert(html.includes('id="'+key+'"'),"sección del diagnóstico ausente: "+key);
 for(const key of ["integrity","features","security","profiles","events"])
   assert(renderer.includes('clear("'+key+'")'),"diagnóstico no vinculado: "+key);
 assert(panel.includes("summary.integrity"));
 assert(panel.includes("summary.features"));
 assert(preload.includes('require("./kaizen-diagnostics-ui-1.5.24")'));
 const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,"..","package.json"),"utf8"));
 assert.equal(pkg.version,"1.5.32");
 assert.equal(pkg.main,"main.kaizen-1.5.24.js");
 console.log("KAIZEN 1.5.24 diagnostics and release metadata: PASS");
})().catch(err=>{console.error(err);process.exitCode=1});
