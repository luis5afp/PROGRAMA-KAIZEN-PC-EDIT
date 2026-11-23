"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {webcrypto} = require("node:crypto");

const base = path.resolve(__dirname,"..","..","runtime-resources","KAIZEN_EXTENSIONS","KAIZEN_EXTENSIONS");
const profiles = ["KAIZZEN_MAIN","KAIZZEN_GOOGLE","KAIZZEN_CUSTOM"];
const scripts = profiles.map(p=>fs.readFileSync(path.join(base,p,"session-identity-diagnostic.js"),"utf8"));
assert.equal(new Set(scripts).size,1,"The three profiles must have identical diagnostic logic");
for (const p of profiles) {
  const html = fs.readFileSync(path.join(base,p,"index.html"),"utf8");
  assert(html.includes('<script src="/session-identity-diagnostic.js" defer></script>'));
}
const code=scripts[0];
assert(code.includes('chrome.storage.local.get("token")'));
assert(!code.includes("chrome.storage.local.get(null)"));
assert(!code.includes("console.log"));
assert(!code.includes("chrome.storage.local.set("));
assert(!code.includes("chrome.storage.local.remove("));

function element(tag) {
  return {
    tag,style:{},textContent:"",value:"",disabled:false,children:[],
    append(...children){this.children.push(...children)},
    setAttribute(){},click(){},addEventListener(){}
  };
}
function jwt(id) {
  const encode = value=>Buffer.from(JSON.stringify(value)).toString("base64url");
  return [encode({alg:"none"}),encode({sub:id,exp:2000000000}),"dummy"].join(".");
}
async function run({profile="KAIZZEN-MAIN",token=jwt("abc"),user={id:"abc",role:"member"},status=200,phrase="KAIZEN test phrase shared"}) {
  const body=element("body");
  let calls=0;
  const context={
    document:{body,readyState:"complete",createElement:element},
    chrome:{runtime:{getManifest:()=>({name:profile})},
      storage:{local:{get:async key=>{assert.equal(key,"token");return token?{token}:{}}}}},
    fetch:async(url,options)=>{
      calls++;
      assert.equal(url,"https://www.kaizzen.org/api/verify-token");
      assert.equal(options.method,"GET");
      assert.equal(options.credentials,"omit");
      assert.equal(options.headers.Authorization,"Bearer "+token);
      return {ok:status===200,status,json:async()=>({user})};
    },
    crypto:webcrypto,TextEncoder,atob,Date,Blob,URL,console:{warn(){throw Error("Must not log")}}
  };
  vm.runInNewContext(code,context,{timeout:2000});
  assert.equal(body.children.length,2);
  const [toggle,panel]=body.children;
  toggle.onclick();
  assert.equal(panel.style.display,"block");
  const input=panel.children[2],check=panel.children[3],output=panel.children[5];
  input.value=phrase;
  await check.onclick();
  assert.equal(input.value,"","Private comparison phrase must be cleared");
  const report=JSON.parse(output.textContent);
  if (token) assert(!output.textContent.includes(token));
  assert(!output.textContent.includes(phrase));
  assert(!output.textContent.includes('"id"'));
  return {report,calls};
}
(async()=>{
  const a=await run({});
  const b=await run({profile:"KAIZZEN-GOOGLE",token:jwt("other"),user:{id:"abc",role:"member"}});
  const c=await run({profile:"KAIZZEN-CUSTOM",user:{id:"different",role:"specific"}});
  assert.equal(a.calls,1);
  assert.equal(a.report.verification,"servidor-verificado");
  assert.equal(a.report.tokenPresent,true);
  assert.equal(a.report.role,"member");
  assert.match(a.report.accountFingerprint,/^[0-9a-f]{24}$/);
  assert.equal(a.report.accountFingerprint,b.report.accountFingerprint,"same verified user");
  assert.notEqual(a.report.accountFingerprint,c.report.accountFingerprint,"different verified user");
  assert.equal(c.report.role,"specific");
  const absent=await run({token:""});
  assert.equal(absent.calls,0);
  assert.equal(absent.report.verification,"sin-token");
  assert.equal(absent.report.accountFingerprint,null);
  const denied=await run({status:401});
  assert.equal(denied.report.verification,"rechazado-por-servidor");
  assert.equal(denied.report.identitySource,"jwt-sin-verificar");
  assert.equal(denied.report.role,null);
  console.log("KAIZEN extension session identity: MAIN/GOOGLE/CUSTOM, HMAC, privacy and server checks PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
