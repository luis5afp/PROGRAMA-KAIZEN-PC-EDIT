"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../../runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS");
const folders=["KAIZZEN_MAIN","KAIZZEN_GOOGLE","KAIZZEN_CUSTOM"];
const read=(folder,name)=>fs.readFileSync(path.join(root,folder,name),"utf8");
const catalog=read(folders[0],"catalog-diagnostic.js");
const form=read(folders[0],"form-diagnostic.js");
for(const folder of folders){
  assert.equal(read(folder,"catalog-diagnostic.js"),catalog,folder+": catálogo sin sincronizar");
  assert.equal(read(folder,"form-diagnostic.js"),form,folder+": formulario sin sincronizar");
}
new Function(catalog);
new Function(form);
for(const stage of ["apertura-solicitada","apertura-confirmada","chromium-ventana-detectada",
  "catalogo-envio","catalogo-respuesta","sesion-temporal-preparada","clic-tarjeta"])
  assert(catalog.includes(stage),"Falta etapa: "+stage);
for(const stage of ["script-formulario-activo","formulario-observado",
  "formulario-con-campos-rellenos","formulario-sin-sesion"])
  assert(form.includes(stage),"Falta etapa: "+stage);
assert(!catalog.includes("JSON.stringify(data)"),"No exportar cuerpos del catálogo");
assert(!catalog.includes("chrome.storage.local.get(null)"),"No leer almacén completo");
assert(!form.includes("chrome.storage.local.get(null)"),"No leer almacén completo");

function storageMock(initial={}){
  const values=new Map(Object.entries(initial));
  const listeners=[];
  const local={
    getKeys:async()=>Array.from(values.keys()),
    get:async keys=>{
      const names=Array.isArray(keys)?keys:[keys];
      const out={};
      for(const key of names)if(values.has(key))out[key]=values.get(key);
      return out;
    },
    set:async payload=>{
      const changed={};
      for(const [key,val] of Object.entries(payload)){
        changed[key]={oldValue:values.get(key),newValue:val};
        values.set(key,val);
      }
      for(const fn of listeners)fn(changed,"local");
    },
    remove:async names=>{
      for(const key of (Array.isArray(names)?names:[names]))values.delete(key);
    }
  };
  return {values,local,onChanged:{addListener:fn=>listeners.push(fn)},
    events:()=>[...values.entries()].filter(([key])=>key.startsWith("kzDiagnosticSafeEventV2:"))
      .map(([,value])=>value)};
}
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
  const store=storageMock();
  const handlers={};
  const createdListeners=[];
  const nativeWindowCreate=async()=>({id:123});
  const chrome={
    storage:{local:store.local,onChanged:store.onChanged},
    windows:{create:nativeWindowCreate,onCreated:{addListener:fn=>createdListeners.push(fn)}}
  };
  const target={
    fetch:async()=>({status:200,clone:()=>({
      json:async()=>({data:{normal:[{d:"https://secret",e:"user@example.com",k:"SECRET",isLock:false}],premium:[]}})
    })}),
    chrome,window:{open:()=>({})},location:{href:"chrome-extension://fake/index.html"},
    document:{
      readyState:"loading",
      addEventListener:(type,fn)=>handlers[type]=fn
    },
    XMLHttpRequest:class {
      open(){}
      send(){}
      addEventListener(){}
    },
    URL,console
  };
  target.globalThis=target;
  vm.runInNewContext(catalog,target,{filename:"catalog-diagnostic.js"});
  assert.equal(typeof handlers.click,"function");
  handlers.click({target:{closest:()=>({querySelector:()=>({})})}});
  await flush();
  assert(store.values.has("kzDiagnosticPendingOpenV2"));
  const result=await chrome.windows.create({url:"https://example.com/login"});
  assert.equal(result.id,123);
  createdListeners[0]({});
  await target.fetch("https://api.example.com/api/shops/extension");
  await flush();
  const events=store.events();
  assert(events.some(x=>x.stage==="clic-tarjeta"));
  assert(events.some(x=>x.stage==="apertura-solicitada"));
  assert(events.some(x=>x.stage==="apertura-confirmada"));
  assert(events.some(x=>x.stage==="chromium-ventana-detectada"));
  const response=events.find(x=>x.stage==="catalogo-respuesta");
  assert.equal(response.http,200);
  assert.equal(response.normal,1);
  assert.equal(response.estructura,"data");
  assert.equal(response.conCorreo,1);
  assert(!JSON.stringify(events).includes("SECRET"));
  assert(!JSON.stringify(events).includes("user@example.com"));
  assert(!JSON.stringify(events).includes("https://secret"));

  const marker=store.values.get("kzDiagnosticPendingOpenV2");
  const formStore=storageMock({
    kzDiagnosticPendingOpenV2:marker,
    product:{t:Date.now(),d:"https://example.com/login",
      e:"hidden@example.com",k:"DO_NOT_EXPORT",ek:"encrypted-value"}
  });
  const top={};
  top.top=top;
  const formCtx={
    chrome:{storage:{local:formStore.local,onChanged:formStore.onChanged}},
    window:top,location:{hostname:"example.com"},
    document:{querySelectorAll:()=>[
      {type:"email",name:"email",id:"",autocomplete:"",placeholder:"",value:"someone@example.com"},
      {type:"password",name:"password",id:"",autocomplete:"",placeholder:"",value:"REDACT_THIS"}
    ]},
    setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},URL,console
  };
  vm.runInNewContext(form,formCtx,{filename:"form-diagnostic.js"});
  await flush();
  const formEvents=formStore.events();
  assert(formEvents.some(x=>x.stage==="script-formulario-activo"));
  assert(formEvents.some(x=>x.stage==="formulario-observado"));
  assert(formEvents.some(x=>x.stage==="formulario-con-campos-rellenos"));
  assert(formEvents.every(x=>x.flujo===marker.id));
  const serialized=JSON.stringify(formEvents);
  for(const secret of ["hidden@example.com","DO_NOT_EXPORT","REDACT_THIS","someone@example.com"])
    assert(!serialized.includes(secret),"Se filtró secreto de formulario");
  console.log("KAIZEN 1.5.30: diagnóstico V2 y privacidad PASS (3 extensiones)");
})().catch(err=>{console.error(err);process.exitCode=1});