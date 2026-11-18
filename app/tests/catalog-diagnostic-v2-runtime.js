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
  "productos-respuesta","productos-descifrados","producto-campos","tarjeta-campos-al-clic",
  "diagnostico-cliente","bloqueoExplicito","bloqueoPremium","origen-tras-descifrado",
  "conciliacion-campos",
  "comunicacion-http-envio","comunicacion-http-respuesta",
  "comunicacion-mensaje-envio","comunicacion-mensaje-respuesta",
  "comunicacion-red-envio","comunicacion-red-respuesta"])
  assert(catalog.includes(stage),"Falta etapa: "+stage);
for(const stage of ["diagnostico-pestana-activa","script-formulario-activo","formulario-observado",
  "formulario-con-campos-rellenos","formulario-sin-sesion",
  "comunicacion-formulario-recibida"])
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
  const networkEvents={};
  const sent=[];
  const nativeWindowCreate=(opts,cb)=>{
    const w={id:cb?124:123};
    if(typeof cb==="function"){cb(w);return;}
    return Promise.resolve(w);
  };
  const chrome={
    storage:{local:store.local,onChanged:store.onChanged},
    webRequest:{
      onBeforeRequest:{addListener:fn=>{networkEvents.before=fn;}},
      onHeadersReceived:{addListener:fn=>{networkEvents.headers=fn;}},
      onCompleted:{addListener:fn=>{networkEvents.completed=fn;}},
      onErrorOccurred:{addListener:fn=>{networkEvents.failed=fn;}}
    },
    runtime:{
      getManifest:()=>({name:"KAIZZEN-MAIN"}),
      sendMessage:(message,callback)=>{
        if(typeof callback==="function"){callback({ok:true});return;}
        return Promise.resolve({ok:true});
      }
    },
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
    fetch:async(url)=>({
      headers:{get:key=>({
        "content-type":"application/json; charset=utf-8; secret=PRIVATE_TOKEN_NEVER_LOG",
        "content-encoding":"gzip","content-length":"2048",
        "set-cookie":"PRIVATE_COOKIE_NEVER_LOG"
      })[key]||""},status:200,clone:()=>({
      json:async()=>String(url).includes("/api/products/getmostusedtool")?
        {products:"ENCRYPTED_TEST_PAYLOAD",hasMore:false}:
        {data:{normal:[{d:"https://secret",e:"user@example.com",k:"SECRET",isLock:false}],premium:[]}}
    })}),
    chrome,window:{open:()=>({})},location:{href:"chrome-extension://fake/index.html"},
    document:{readyState:"loading",addEventListener:(type,fn)=>handlers[type]=fn},
    XMLHttpRequest:class {
      constructor(){
        this.status=200;
        this.responseType="";
        this.responseText='{"products":"ENCRYPTED_TEST_PAYLOAD","hasMore":false}';
        this.callbacks={};
      }
      open(){}
      setRequestHeader(name,value){}
      getResponseHeader(key){return ({
        "content-type":"application/problem+json; charset=utf-8",
        "content-encoding":"br","content-length":"8192",
        "set-cookie":"PRIVATE_COOKIE_NEVER_LOG"
      })[key.toLowerCase()]||"";}
      send(){for(const fn of this.callbacks.loadend||[])fn();}
      addEventListener(name,fn){
        (this.callbacks[name]??=[]).push(fn);
      }
    },
    URL,console,setTimeout:fn=>{setImmediate(fn);return 1;}
  };
  target.globalThis=target;
  vm.runInNewContext(catalog,target,{filename:"catalog-diagnostic.js"});
  assert.equal(typeof handlers.click,"function");
  // Simulación de metadatos ANTES del mapeo React. Sin datos sensibles.
  const base={eProp:false,kProp:false,eValue:false,kValue:false,
    eNull:false,kNull:false,eEmpty:false,kEmpty:false,eSpaces:false,
    kSpaces:false,eOther:false,kOther:false,lockProp:true,lockTrue:true,
    lockFalse:false,lockOther:false,premium:false,eAlias:false,kAlias:false,ekPresente:false};
  target.__kzDiagnosticRawBatch([
    {...base,eProp:true,kProp:true,eValue:true,kValue:true,
      lockTrue:false,lockFalse:true},
    {...base,eProp:true,kProp:true,eEmpty:true,kNull:true,eAlias:true,kAlias:true,ekPresente:true},
    {...base,lockTrue:false,lockFalse:false,lockOther:false,premium:true}
  ]);
  await flush();
  const raw=store.events().find(x=>x.stage==="origen-tras-descifrado");
  assert(raw,"Falta el lote inmediatamente descifrado");
  assert.equal(raw.cuenta,3);
  assert.equal(raw.eProp,2);
  assert.equal(raw.kProp,2);
  assert.equal(raw.eValue,1);
  assert.equal(raw.kValue,1);
  assert.equal(raw.eEmpty,1);
  assert.equal(raw.kNull,1);
  assert.equal(raw.lockTrue,1);
  assert.equal(raw.lockFalse,1);
  assert.equal(raw.premium,1);
  assert.equal(raw.eAlias,1);
  assert.equal(raw.kAlias,1);
  assert.equal(raw.ekPresente,1);
  assert.equal(raw.autorizadasOrigen,1);
  assert.equal(raw.restringidasOrigen,2);
  assert.equal(raw.restringidasSinParOrigen,2);
  assert.equal(raw.restringidasConEOrigen,0);
  assert.equal(raw.restringidasConKOrigen,0);
  // El lote simula el contrato reducido del bundle: solo booleanos.
  target.__kzDiagnosticProductBatch([
    {d:true,e:true,k:true,proxy:false,lm:true,cookie:false,id:true,isLock:false,locked:false},
    {d:true,e:false,k:false,proxy:false,lm:false,cookie:false,id:true,isLock:true,locked:true},
    {d:true,e:false,k:false,proxy:false,lm:false,cookie:false,id:true,isLock:false,locked:true}
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
  // HTTP y background: solo etiquetas, respuestas y correlación del clic.
  const sourceFlow=events.find(x=>x.stage==="clic-tarjeta")?.flujo;
  await target.fetch("https://www.kaizzen.org/s/vHwxhS39x9wSS393xxhS3xhS9wxwxx3hh9wx9wxhS39/api/products/activitystatus/add?token=DONT_LOG_TOKEN");
  const xhr=new target.XMLHttpRequest();
  xhr.open("GET","https://www.kaizzen.org/s/known/api/products/getmostusedtool?token=NOLOG_XHR");
  xhr.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
  xhr.setRequestHeader("Authorization","Bearer PRIVATE_TOKEN_NEVER_LOG");
  xhr.send();
  assert.equal(typeof networkEvents.before,"function");
  networkEvents.before({url:"https://www.kaizzen.org/s/test/api/products/getmostusedtool?token=NETWORK_SECRET",
    requestId:"network-test",method:"GET",initiator:""});
  assert.equal(typeof networkEvents.headers,"function");
  networkEvents.headers({requestId:"network-test",responseHeaders:[
    {name:"Content-Type",value:"application/xml; private=DO_NOT_LOG"},
    {name:"Content-Encoding",value:"zstd"},
    {name:"Content-Length",value:"34567"},
    {name:"Set-Cookie",value:"PRIVATE_COOKIE_NEVER_LOG"}]});
  networkEvents.completed({requestId:"network-test",statusCode:200});
  await chrome.runtime.sendMessage({ref:"track_tool_domain",domain:"secret.test"});
  let callbackOk=false;
  chrome.runtime.sendMessage({ref:"reset_proxy",proxy:"DONT_LOG_PROXY"},()=>{callbackOk=true;});
  assert(callbackOk,"Conservar semántica callback original");
  await flush();
  events=store.events();
  assert(events.some(x=>x.stage==="comunicacion-http-envio"&&
    x.ruta==="actividad"&&x.emisor==="extension-ui"&&x.receptor==="servidor-kaizzen"&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-http-respuesta"&&
    x.ruta==="actividad"&&x.http===200&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-http-envio"&&
    x.ruta==="productos"&&x.transporte==="xhr"&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-http-respuesta"&&
    x.ruta==="productos"&&x.transporte==="xhr"&&x.http===200&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-mensaje-envio"&&
    x.mensaje==="track_tool_domain"&&x.receptor==="extension-background"&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-red-envio"&&
    x.ruta==="productos"&&x.emisor==="chromium"&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-red-respuesta"&&
    x.ruta==="productos"&&x.http===200&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-mensaje-respuesta"&&
    x.mensaje==="reset_proxy"&&x.respuesta===true&&x.flujo===sourceFlow));
  assert(events.some(x=>x.stage==="comunicacion-formulario-recibida"&&x.pestana===456));
  await target.fetch("https://www.kaizzen.org/s/vHwxhS39x9wSS393xxhS3xhS9wxwxx3hh9wx9wxhS39/api/users/login?token=SECRET_QUERY");
  await flush();
  events=store.events();
  assert(events.some(x=>x.stage==="comunicacion-http-envio"&&x.ruta==="login"));
  const observed=events.filter(x=>x.stage==="comunicacion-http-respuesta");
  assert(observed.some(x=>x.transporte==="fetch"&&x.formato==="json"&&
    x.compresion==="gzip"&&x.tamano==="1kb-10kb"&&x.traza>0));
  assert(observed.some(x=>x.transporte==="xhr"&&x.formato==="json"&&
    x.compresion==="br"&&x.tamano==="1kb-10kb"&&x.traza>0));
  assert(events.some(x=>x.stage==="comunicacion-http-envio"&&
    x.transporte==="xhr"&&x.formatoEnvio==="formulario"));
  assert(events.some(x=>x.stage==="comunicacion-red-respuesta"&&
    x.formato==="xml"&&x.compresion==="zstd"&&x.tamano==="10kb-100kb"));
  const snapshotSupervisor=JSON.stringify(events);
  assert(!snapshotSupervisor.includes("PRIVATE_TOKEN_NEVER_LOG"));
  assert(!snapshotSupervisor.includes("PRIVATE_COOKIE_NEVER_LOG"));
  assert(!snapshotSupervisor.includes("NETWORK_SECRET"));

  const prod=events.find(x=>x.stage==="productos-descifrados");
  assert.equal(prod.cuenta,3);
  assert.equal(prod.conCorreo,1);
  assert.equal(prod.conClave,1);
  assert.equal(prod.bloqueadas,2);
  assert.equal(prod.habilitadas,1);
  assert.equal(prod.bloqueoExplicito,1);
  assert.equal(prod.bloqueoPremium,1);
  assert.equal(prod.sinParAcceso,2);
  const cross=events.find(x=>x.stage==="conciliacion-campos");
  assert(cross,"Falta conciliación en el mismo lote");
  assert.equal(cross.cuenta,3);
  assert.equal(cross.autorizadasOrigen,1);
  assert.equal(cross.autorizadasFinal,1);
  assert.equal(cross.restringidasOrigen,2);
  assert.equal(cross.restringidasFinal,2);
  assert.equal(cross.restringidasSinParOrigen,2);
  assert.equal(cross.cambioBloqueo,0);
  assert.equal(cross.autorizadasConParOrigen,1);
  assert.equal(cross.autorizadasConParFinal,1);
  assert.equal(cross.perdidaEAutorizada,0);
  assert.equal(cross.perdidaKAutorizada,0);
  const selected=events.find(x=>x.stage==="tarjeta-campos-al-clic");
  assert.equal(selected.d,true);
  assert.equal(selected.e,true);
  assert.equal(selected.k,true);
  assert.equal(selected.locked,false);
  assert(events.filter(x=>x.stage==="producto-campos").length===3);
  assert(sent.every(x=>x.id===456),"No enviar mensajes a otras pestañas");
  const response=events.find(x=>x.stage==="catalogo-respuesta");
  assert.equal(response.http,200);
  assert.equal(response.normal,1);
  assert.equal(response.estructura,"data");
  assert.equal(response.conCorreo,1);
  const serialized=JSON.stringify(events);
  for(const secret of ["ENCRYPTED_TEST_PAYLOAD","SECRET","user@example.com","https://secret","hidden@example.com",
    "DO_NOT_EXPORT","REDACT_THIS","someone@example.com",
    "DONT_LOG_TOKEN","DONT_LOG_PROXY","SECRET_QUERY","secret.test","NOLOG_XHR","NETWORK_SECRET"])
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
  // Caso simulado: una tarjeta autorizada pierde e en el mapeo.
  // No se almacenan credenciales ni identificadores; solo flags booleanos.
  target.__kzDiagnosticRawBatch([{...base,lockTrue:false,lockFalse:true,
    eProp:true,kProp:true,eValue:true,kValue:true}]);
  target.__kzDiagnosticProductBatch([
    {d:true,e:false,k:true,proxy:false,lm:false,cookie:false,
      id:true,isLock:false,locked:false}
  ],false);
  for(let i=0;i<6;i++)await flush();
  const crossLoss=store.events().filter(x=>x.stage==="conciliacion-campos").at(-1);
  assert(crossLoss,"Debe guardar la conciliación del segundo lote");
  assert.equal(crossLoss.perdidaEAutorizada,1);
  assert.equal(crossLoss.perdidaKAutorizada,0);
  assert.equal(crossLoss.autorizadasConParOrigen,1);
  assert.equal(crossLoss.autorizadasConParFinal,0);
  assert(!JSON.stringify(crossLoss).includes("example.com"),"No exportar dominios");
  listeners.removed[0](456);
  listeners.windowsRemoved[0](123);
  console.log("KAIZEN 1.5.41: auditoría v8 de integridad autorizada y privacidad PASS; KAIZEN 1.5.36: estado de acceso y separar CÓDIGOS/product y categorías/productos, clic, tab/window, callback, promesa y privacidad PASS");
})().catch(err=>{console.error(err);process.exitCode=1});
