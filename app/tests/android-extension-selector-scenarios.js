"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {loadVariantCatalog,decodeCatalog,VALID_VARIANTS}=require("../android-extension-catalog");
const KEY=Buffer.from("70b72aa4c457ca40482fae3e094556fd4c1afee5a49962d9c0976f870a7d71fd","hex");
const TOKEN="member_test_token",ROOT="https://catalog.example.org/api";
function encrypt(products){
  const cipher=crypto.createCipheriv("aes-256-ctr",KEY,Buffer.alloc(16));
  return Buffer.concat([cipher.update(JSON.stringify(products),"utf8"),cipher.final()]).toString("base64");
}
function fail(code){const err=new Error("not authorized");err.response={status:code};throw err;}
const streamProducts=[
  {c:"STREAM DEMO 1",m:"media/sample.png",is_premium:true,activeUsersCount:3,tool_note:"Aviso",d:"https://sensitive.example",e:"secret"},
  {c:"STREAM DEMO 2",m:"https://external.example/image.png",activeUsersCount:1}
];
assert.equal(decodeCatalog(encrypt(streamProducts)).length,2);
async function scenario(variant,config={}){
  const requests=[];
  const http={
    post:async (url,body,opt)=>{
      requests.push({method:"POST",url,body,authorization:opt?.headers?.Authorization});
      if(config.switch403)return fail(403);
      return {status:200,data:{token:"variant_"+body.client}};
    },
    get:async (url,opt)=>{
      requests.push({method:"GET",url,authorization:opt?.headers?.Authorization,params:opt?.params});
      if(url.endsWith("/variant-profiles")) {
        if(config.profile403)return fail(403);
        return {status:200,data:{profiles:[]}};
      }
      if(url.endsWith("/getmostusedtool")){
        if(config.catalog403)return fail(403);
        return {status:200,data:{products:encrypt(config.products||streamProducts),hasMore:true}};
      }
      throw Error("Unexpected request");
    }
  };
  return {result:await loadVariantCatalog(http,ROOT,TOKEN,variant,1,""),requests};
}
(async()=>{
  const a=await scenario("custom");
  assert.equal(a.result.variant,"Streaming");
  assert.equal(a.result.catalogCount,2);
  assert.equal(a.result.catalogStatus,200);
  assert.equal(a.result.selectorCount,0);
  assert.equal(a.result.items[0].title,"STREAM DEMO 1");
  assert(a.result.items[0].image.startsWith("https://catalog.example.org/"));
  assert.equal(a.result.items[1].image,"");
  assert(!JSON.stringify(a.result).includes("variant_android_custom"));
  assert(!JSON.stringify(a.result).includes("sensitive.example"));
  assert(!JSON.stringify(a.result).includes("secret"));
  assert.equal(a.requests[0].body.client,"android_custom");
  assert.equal(a.requests[0].authorization,"Bearer "+TOKEN);
  assert(a.requests.slice(1).every(x=>x.authorization==="Bearer variant_android_custom"));
  const b=await scenario("main");
  assert.equal(b.requests[0].body.client,"android");
  const c=await scenario("main",{switch403:true});
  assert.equal(c.result.switchStatus,403);assert.equal(c.requests.length,1);
  const d=await scenario("custom",{profile403:true});
  assert.equal(d.result.selectorStatus,403);assert.equal(d.result.catalogStatus,200);
  const e=await scenario("custom",{catalog403:true});
  assert.equal(e.result.catalogStatus,403);assert.equal(e.result.items.length,0);
  const f=await scenario("unknown");
  assert.equal(f.requests.length,0);assert.match(f.result.error,/desconocida/);
  assert.deepEqual(Object.keys(VALID_VARIANTS),["main","custom"]);
  console.log("KAIZEN PC Android extension switch + product catalog: PASS (6 scenarios)");
})().catch(e=>{console.error(e);process.exitCode=1});
