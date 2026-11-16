"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../../runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS");
const bundles={
  KAIZZEN_MAIN:"index-B-06emjA.js",
  KAIZZEN_GOOGLE:"index-DhjpRuHp.js",
  KAIZZEN_CUSTOM:"index-DtDn-2PW.js"
};
const sources=[];
for(const [name,bundle] of Object.entries(bundles)){
  const folder=path.join(root,name);
  const html=fs.readFileSync(path.join(folder,"index.html"),"utf8");
  const retry=fs.readFileSync(path.join(folder,"catalog-api-retry.js"),"utf8");
  const catalog=fs.readFileSync(path.join(folder,"catalog-diagnostic.js"),"utf8");
  const js=fs.readFileSync(path.join(folder,"assets",bundle),"utf8");
  new Function(retry);
  new Function(catalog);
  assert(html.includes('src="/catalog-api-retry.js"'),name+" must load retry helper");
  assert(html.indexOf("catalog-api-retry.js")<html.indexOf('type="module"'),name+" helper must initialize before React");
  assert(js.includes("globalThis.__kzCatalogGetWithRetry||((send)=>send())"),name+" must wrap the existing authenticated product GET");
  assert(js.includes("getmostusedtool"),name+" must still call the original product endpoint");
  assert(js.includes("signal:")&&js.includes("Authorization:"),name+" must preserve the original token and cancellation signal");
  assert(js.includes("kZ=t=>!!(t?.isLock")||js.includes("isLock"),name+" must not bypass server lock status");
  assert(catalog.includes("Conexión API (productos): ")&&catalog.includes("productos-reintento"),name+" must diagnose HTTP");
  assert(catalog.includes("HTTP 401")&&catalog.includes("HTTP 403"),name+" must distinguish token failure from authorization");
  assert(!retry.includes("localStorage")&&!retry.includes("chrome.storage"),"retry must not persist credentials");
  assert(!/product\.isLock\s*=\s*false/.test(retry+catalog),"never override authorization");
  sources.push(retry);
}
assert(sources.every(s=>s===sources[0]),"All three extension profiles must share the exact same retry algorithm.");

const observed=[];
const context={
  setTimeout(fn){setImmediate(fn);return 1;},
  clearTimeout(){},
  AbortController,Promise,Error,Number,Set,Object,String,
  __kzDiagnosticCatalogRetry:meta=>observed.push(meta)
};
context.globalThis=context;
vm.runInNewContext(sources[0],context,{filename:"catalog-api-retry.js"});
const read=context.__kzCatalogGetWithRetry;
const failure=status=>Object.assign(new Error("test error"),{response:{status}});
(async()=>{
  let count=0;
  const outcome=await read(async()=>{
    count++;
    if(count<=2)throw failure(503);
    return {status:200};
  },new AbortController().signal);
  assert.equal(outcome.status,200);
  assert.equal(count,3,"Exactly two retries after transient 503");
  assert.equal(observed.length,2);
  assert.deepEqual(observed.map(x=>x.intentos),[1,2]);
  for(const status of [401,403,429,400]){
    let attempts=0;
    await assert.rejects(()=>read(async()=>{attempts++;throw failure(status);}),/test error/);
    assert.equal(attempts,1,"Never retry protected or client-failed requests: "+status);
  }
  let exhausted=0;
  await assert.rejects(()=>read(async()=>{exhausted++;throw failure(502);}),/test error/);
  assert.equal(exhausted,3,"Retry count is bounded");
  let network=0;
  assert.equal((await read(async()=>{
    network++;
    if(network===1)throw Object.assign(new Error("network"),{code:"ERR_NETWORK"});
    return "ok";
  })),"ok");
  assert.equal(network,2,"Transient network errors should recover");
  const controller=new AbortController;
  controller.abort();
  let invoked=false;
  await assert.rejects(()=>read(async()=>{invoked=true;return "unreachable";},controller.signal),
    err=>err?.name==="AbortError");
  assert.equal(invoked,false,"Never submit a canceled API request");
  console.log("PASS: retries for original catalog GET, no retry of 401/403/429, bounded attempts and abort.");
})().catch(error=>{console.error(error);process.exitCode=1;});
