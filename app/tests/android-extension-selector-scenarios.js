"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {loadVariantCatalog,decodeCatalog,VALID_VARIANTS,ANDROID_VARIANTS,tokenClient}=require("../android-extension-catalog");
const {sameAccountJwt}=require("../extension-session-identity");
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
  let productCalls=0;
  const http={
    post:async (url,body,opt)=>{
      requests.push({method:"POST",url,body,authorization:opt?.headers?.Authorization});
      if(config.switch403)return fail(403);
      if(config.switch400)return fail(400);
      if(config.switch401)return fail(401);
      return {status:200,data:{token:"variant_"+body.client}};
    },
    get:async (url,opt)=>{
      requests.push({method:"GET",url,authorization:opt?.headers?.Authorization,params:opt?.params});
      if(url.endsWith("/variant-profiles")) {
        if(config.profile403)return fail(403);
        return {status:200,data:{profiles:[]}};
      }
      if(url.endsWith("/getmostusedtool")){
        productCalls++;
        if(config.catalog401Always)return fail(401);
        if(config.catalog401Once && productCalls===1)return fail(401);
        if(config.catalog403)return fail(403);
        return {status:200,data:{products:encrypt(config.products||streamProducts),hasMore:true}};
      }
      throw Error("Unexpected request");
    }
  };
  return {result:await loadVariantCatalog(http,ROOT,config.token||TOKEN,variant,1,""),requests};
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
  assert(!JSON.stringify(a.result).includes("variant_extension_custom"));
  assert(!JSON.stringify(a.result).includes("sensitive.example"));
  assert(!JSON.stringify(a.result).includes("secret"));
  assert.equal(a.requests[0].body.client,"extension_custom");
  assert.equal(a.result.sessionClient,"sin-indicar");
  assert.equal(a.result.requestedClient,"extension_custom");
  assert.equal(a.requests[0].authorization,"Bearer "+TOKEN);
  assert(a.requests.slice(1).every(x=>x.authorization==="Bearer variant_extension_custom"));
  const b=await scenario("main");
  assert.equal(b.requests[0].body.client,"extension");
  const c=await scenario("main",{switch403:true});
  assert.equal(c.result.switchStatus,403);assert.equal(c.requests.length,1);
  const d=await scenario("custom",{profile403:true});
  assert.equal(d.result.selectorStatus,403);assert.equal(d.result.catalogStatus,200);
  const e=await scenario("custom",{catalog403:true});
  assert.equal(e.result.catalogStatus,403);assert.equal(e.result.items.length,0);
  const f=await scenario("unknown");
  assert.equal(f.requests.length,0);assert.match(f.result.error,/desconocida/);
  // HTTP 400 is a terminal failure; it is not silently treated as permission.
  const g=await scenario("custom",{switch400:true});
  assert.equal(g.result.switchStatus,400);
  assert.equal(g.requests.length,1);
  assert.match(g.result.error,/HTTP 400/);
  // If the already server-issued JWT belongs to that client, skip the POST.
  // All subsequent API calls still require server-side authorization.
  const jwt=(client)=>"header."+Buffer.from(JSON.stringify({client})).toString("base64url")+".signature";
  const h=await scenario("custom",{token:jwt("extension_custom")});
  assert.equal(h.requests.length,2);
  assert.equal(h.requests[0].method,"GET");
  assert.equal(h.result.switchMode,"sesión existente");
  assert.equal(h.result.catalogStatus,200);
  assert.equal(tokenClient(jwt("extension_custom")),"extension_custom");
  const j=await scenario("custom",{token:jwt("android_custom")});
  assert.equal(j.requests[0].method,"GET");
  assert.equal(j.result.requestedClient,"android_custom");
  assert.equal(ANDROID_VARIANTS.main,"android");
  const expired=await scenario("main",{switch401:true});
  assert.equal(expired.result.switchStatus,401);
  assert.equal(expired.result.sessionExpired,true);
  assert.equal(expired.requests.length,1);
  const variantExpired=await scenario("custom",{catalog401Once:true});
  assert.equal(variantExpired.result.variantRenewed,true);
  assert.equal(variantExpired.result.catalogStatus,200);
  assert.equal(variantExpired.requests.filter(x=>x.url.endsWith("/switch-client")).length,2);
  const expiredAll=await scenario("custom",{catalog401Always:true});
  assert.equal(expiredAll.result.sessionExpired,true);
  assert.equal(expiredAll.requests.filter(x=>x.url.endsWith("/getmostusedtool")).length,2);
  assert.equal(expiredAll.requests.filter(x=>x.url.endsWith("/switch-client")).length,2);
  const tok=(email,sub)=>"head."+Buffer.from(JSON.stringify({email,sub})).toString("base64url")+".signature";
  assert.equal(sameAccountJwt(tok("miembros@ejemplo.org","u1"),tok("miembros@ejemplo.org","u1")),true);
  assert.equal(sameAccountJwt(tok("miembros@ejemplo.org","u1"),tok("otra@ejemplo.org","u2")),false);
  assert.equal(sameAccountJwt("malformed",tok("miembros@ejemplo.org","u1")),false);
  assert.equal(sameAccountJwt(tok("miembros@ejemplo.org","u1"),"malformed"),false);
  assert.equal(sameAccountJwt(tok("a@b.org","a"),tok("b@b.org","a")),false);
  assert.deepEqual(Object.keys(VALID_VARIANTS),["main","custom"]);
  console.log("KAIZEN PC Android extension switch + product catalog: PASS (13 scenarios + identity guards)");
})().catch(e=>{console.error(e);process.exitCode=1});
