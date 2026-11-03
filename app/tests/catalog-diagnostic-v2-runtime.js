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
for(const stage of ["apertura-solicitada","apertura-confirmada","pestana-identificada","pestana-vinculada",
  "catalogo-envio","catalogo-respuesta","sesion-temporal-preparada","clic-tarjeta"])
  assert(catalog.includes(stage),"Falta etapa: "+stage);
for(const stage of ["diagnostico-pestana-activa","script-formulario-activo","formulario-observado",
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
  const store=storageMock({
    product:{t:Date.now(),d:"https://example.com/login",
      e:"hidden@example.com",k:"DO_NOT_EXPORT",ek:"encrypted-value"}
  });
  const handlers={};
  let formReceiver=null;
  const top={};
  top.top=top;
  const realTimeout=setTimeout;
  const formCtx={
    chrome:{
      storage:{local:store.local,onChanged:store.onChanged},
      runtime:{onMessage:{addListener:fn=>{formReceiver=fn;}}}
    },
    window:top,location:{hostname:"example.com",href:"https://example.com/login"},
    document:{querySelectorAll:()=>[
      {type:"email",name:"email",id:"",autocomplete:"",placeholder:"",value:"someone@example.com"},
      {type:"password",name:"password",id:"",autocomplete:"",placeholder:"",value:"REDACT_THIS"}
    ]},
    setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},URL,console
  };
  vm.runInNewContext(form,formCtx,{filename:"form-diagnostic.js"});
  assert.equal(typeof formReceiver,"function");
  assert.equal(store.events().length,0,"No observar pestañas sin vínculo dirigido");

  const listeners={updated:[],removed:[],windowsRemoved:[]};
  const sent=[];
  const nativeWindowCreate=(opts,cb)=>{
    const w={id:cb?124:123};
    if(typeof cb==="function"){cb(w);return;}
    return Promise.resolve(w);
  };
  const chrome={
    storage:{local:store.local,onChanged:store.onChanged},
    windows:{
      create:nativeWindowCreate,
      onRemoved:{addListener:fn=>listeners.windowsRemoved.push(fn)}
    },
    tabs:{
      query:async ({windowId})=>[{id:windowId===124?457:456,windowId,url:"https://example.com/login"}],
      sendMessage:async(id,msg)=>{
        sent.push({id,type:msg.type});
        assert.equal(msg.type,"kz-diagnostic-bind-v3");
        assert.equal(msg.pestana,id);
        let answer=null;
        formReceiver(msg,{},value=>{answer=value});
        return answer;
      },
      onUpdated:{addListener:fn=>listeners.updated.push(fn)},
      onRemoved:{addListener:fn=>listeners.removed.push(fn)}
    }
  };
  const target={
    fetch:async()=>({status:200,clone:()=>({
      json:async()=>({data:{normal:[{d:"https://secret",e:"user@example.com",k:"SECRET",isLock:false}],premium:[]}})
    })}),
    chrome,window:{open:()=>({})},location:{href:"chrome-extension://fake/index.html"},
    document:{readyState:"loading",addEventListener:(type,fn)=>handlers[type]=fn},
    XMLHttpRequest:class {open(){}send(){}addEventListener(){}},
    URL,console,setTimeout:fn=>{setImmediate(fn);return 1;}
  };
  target.globalThis=target;
  vm.runInNewContext(catalog,target,{filename:"catalog-diagnostic.js"});
  assert.equal(typeof handlers.click,"function");
  handlers.click({target:{closest:()=>({querySelector:()=>({})})}});
  await flush();
  const marker=store.values.get("kzDiagnosticPendingOpenV2");
  assert(marker && typeof marker.id==="string");

  const opened=await chrome.windows.create({url:"https://example.com/login"});
  assert.equal(opened.id,123);
  await target.fetch("https://api.example.com/api/shops/extension");
  for(let i=0;i<6;i++)await flush();
  let events=store.events();
  for(const stage of ["clic-tarjeta","apertura-solicitada","apertura-confirmada",
    "pestana-identificada","pestana-vinculada","diagnostico-pestana-activa",
    "script-formulario-activo","formulario-observado","formulario-con-campos-rellenos"])
    assert(events.some(x=>x.stage===stage),"Falta evento "+stage);
  assert(events.some(x=>x.stage==="pestana-vinculada"&&x.pestana===456));
  assert(events.some(x=>x.stage==="script-formulario-activo"&&x.pestana===456));
  assert(sent.every(x=>x.id===456),"No enviar mensajes a otras pestañas");
  const response=events.find(x=>x.stage==="catalogo-respuesta");
  assert.equal(response.http,200);
  assert.equal(response.normal,1);
  assert.equal(response.estructura,"data");
  assert.equal(response.conCorreo,1);
  const serialized=JSON.stringify(events);
  for(const secret of ["SECRET","user@example.com","https://secret","hidden@example.com",
    "DO_NOT_EXPORT","REDACT_THIS","someone@example.com"])
    assert(!serialized.includes(secret),"Se filtró un secreto en el informe");

  // La rama original usa chrome.windows.create({url}, callback).
  handlers.click({target:{closest:()=>({querySelector:()=>({})})}});
  chrome.windows.create({url:"https://example.com/login"},()=>{});
  for(let i=0;i<6;i++)await flush();
  events=store.events();
  assert(events.some(x=>x.stage==="pestana-vinculada"&&x.pestana===457),
    "La variante callback también debe vincular la pestaña");
  assert(events.some(x=>x.stage==="script-formulario-activo"&&x.pestana===457),
    "El observador debe recibir la señal de la variante callback");
  listeners.removed[0](456);
  listeners.windowsRemoved[0](123);
  console.log("KAIZEN 1.5.31: correlación real tab/window, callback, promesa y privacidad PASS");
})().catch(err=>{console.error(err);process.exitCode=1});
