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
assert(catalog.includes('event(route+"-envio"') && catalog.includes('event(route+"-error"'));
for(const stage of ["apertura-solicitada","apertura-confirmada","pestana-identificada","pestana-vinculada",
  "catalogo-respuesta","sesion-temporal-preparada","clic-tarjeta",
  "productos-respuesta","productos-descifrados","producto-campos","tarjeta-campos-al-clic"])
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
    fetch:async(url)=>({status:200,clone:()=>({
      json:async()=>String(url).includes("/api/products/getmostusedtool")?
        {products:"ENCRYPTED_TEST_PAYLOAD",hasMore:false}:
        {data:{normal:[{d:"https://secret",e:"user@example.com",k:"SECRET",isLock:false}],premium:[]}}
    })}),
    chrome,window:{open:()=>({})},location:{href:"chrome-extension://fake/index.html"},
    document:{readyState:"loading",addEventListener:(type,fn)=>handlers[type]=fn},
    XMLHttpRequest:class {open(){}send(){}addEventListener(){}},
    URL,console,setTimeout:fn=>{setImmediate(fn);return 1;}
  };
  target.globalThis=target;
  vm.runInNewContext(catalog,target,{filename:"catalog-diagnostic.js"});
  assert.equal(typeof handlers.click,"function");
  // El lote simula el contrato reducido del bundle: solo booleanos.
  target.__kzDiagnosticProductBatch([
    {d:true,e:true,k:true,proxy:false,lm:true,cookie:false,id:true,isLock:false,locked:false},
    {d:true,e:false,k:false,proxy:false,lm:false,cookie:false,id:true,isLock:true,locked:true}
  ],false);
  handlers.click({target:{closest:()=>({querySelector:()=>({})})}});
  target.__kzDiagnosticCardClickFields({
    d:true,e:true,k:true,proxy:false,lm:true,cookie:false,id:true,isLock:false,locked:false
  });
  await flush();
  const marker=store.values.get("kzDiagnosticPendingOpenV2");
  assert(marker && typeof marker.id==="string");

  const opened=await chrome.windows.create({url:"https://example.com/login"});
  assert.equal(opened.id,123);
  await target.fetch("https://api.example.com/api/shops/extension");
  await target.fetch("https://api.example.com/api/products/getmostusedtool");
  for(let i=0;i<6;i++)await flush();
  let events=store.events();
  for(const stage of ["clic-tarjeta","apertura-solicitada","apertura-confirmada",
    "pestana-identificada","pestana-vinculada","diagnostico-pestana-activa",
    "script-formulario-activo","formulario-observado","formulario-con-campos-rellenos"])
    assert(events.some(x=>x.stage===stage),"Falta evento "+stage);
  assert(events.some(x=>x.stage==="pestana-vinculada"&&x.pestana===456));
  assert(events.some(x=>x.stage==="script-formulario-activo"&&x.pestana===456));
  assert(events.some(x=>x.stage==="productos-respuesta"&&x.cifrado===true));
  const prod=events.find(x=>x.stage==="productos-descifrados");
  assert.equal(prod.cuenta,2);
  assert.equal(prod.conCorreo,1);
  assert.equal(prod.conClave,1);
  assert.equal(prod.bloqueadas,1);
  const selected=events.find(x=>x.stage==="tarjeta-campos-al-clic");
  assert.equal(selected.d,true);
  assert.equal(selected.e,true);
  assert.equal(selected.k,true);
  assert.equal(selected.locked,false);
  assert(events.filter(x=>x.stage==="producto-campos").length===2);
  assert(sent.every(x=>x.id===456),"No enviar mensajes a otras pestañas");
  const response=events.find(x=>x.stage==="catalogo-respuesta");
  assert.equal(response.http,200);
  assert.equal(response.normal,1);
  assert.equal(response.estructura,"data");
  assert.equal(response.conCorreo,1);
  const serialized=JSON.stringify(events);
  for(const secret of ["ENCRYPTED_TEST_PAYLOAD","SECRET","user@example.com","https://secret","hidden@example.com",
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
  // Botón CÓDIGOS: otro origen, separado del catálogo de tarjetas.
  handlers.click({target:{closest:selector=>
    selector==="button"?{textContent:"CÓDIGOS ↗"}:null}});
  await flush();
  let before=store.events();
  const codes=before.filter(x=>x.stage==="clic-codigos").at(-1);
  assert(codes && codes.origen==="codigos","El botón CÓDIGOS debe identificarse");
  assert(!before.some(x=>x.stage==="tarjeta-campos-al-clic"&&x.flujo===codes.flujo),
    "CÓDIGOS no es una tarjeta");
  await store.local.set({product:{t:Date.now(),d:"https://example.com/login",
    e:"",k:"",ek:"CIFRADO_SIN_CLAVE"}});
  await flush();
  before=store.events();
  const credential=before.filter(x=>x.stage==="sesion-temporal-preparada").at(-1);
  assert(credential&&credential.flujo===codes.flujo&&credential.origen==="codigos");
  assert(credential.asociada===true);
  assert(credential.correo===false&&credential.clave===false&&credential.claveCifrada===true);
  await store.local.remove("product");
  for(const secret of ["CIFRADO_SIN_CLAVE","example.com/login"])
    assert(!JSON.stringify(store.events()).includes(secret),"No registrar secretos de CÓDIGOS");
  listeners.removed[0](456);
  listeners.windowsRemoved[0](123);
  console.log("KAIZEN 1.5.33: separar CÓDIGOS/product y categorías/productos, clic, tab/window, callback, promesa y privacidad PASS");
})().catch(err=>{console.error(err);process.exitCode=1});
