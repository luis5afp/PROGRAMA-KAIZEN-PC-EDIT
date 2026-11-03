"use strict";
(() => {
  if (globalThis.__kzDiagnosticCatalog) return;
  globalThis.__kzDiagnosticCatalog = true;

  // Observability only: no changes to card authorization, credentials or login.
  const LEGACY = "kzDiagnosticSafeEventsV1";
  const PREFIX = "kzDiagnosticSafeEventV2:";
  const TRACE = "kzDiagnosticPendingOpenV2";
  const MAX = 160;
  const SAFE_KEYS = new Set([
    "flujo","transporte","metodo","http","duracionMs","normal","premium",
    "conUrl","conCorreo","conClave","conProxy","modoCookie","bloqueadas",
    "estructura","medio","resultado","ventana","pestana","url","correo","clave","claveCifrada",
    "identificador","motivo","tipo","marco","dominioCoincide",
    "lote","indice","cuenta","cifrado","hayMas","origen","asociada",
    "d","e","k","proxy","lm","id","isLock","locked","cookie"
  ]);
  const nonempty = v => typeof v === "string" ? v.trim().length > 0 : v != null && v !== "";
  let currentFlow = "";
  let currentFlowAt = 0;
  let currentSource = "sin-asociar";
  let lastProductOwner = {flujo:"",origen:"sin-asociar",asociada:false};
  let productBatch = 0;
  let visible = false;
  let output = null;
  let note = null;
  let legacyQueue = Promise.resolve();

  function sanitized(stage, info = {}) {
    const safe = {time:new Date().toISOString(),stage:String(stage).slice(0,55)};
    for (const [key,value] of Object.entries(info)) {
      if (!SAFE_KEYS.has(key)) continue;
      if (typeof value === "boolean") safe[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) safe[key] =
        Math.max(0,Math.min(["ventana","pestana"].includes(key)?2147483647:1000000,Math.floor(value)));
      else if (typeof value === "string" && value.length < 85 &&
        /^[a-zA-Z0-9_.:-]+$/.test(value)) safe[key] = value;
    }
    return safe;
  }
  function event(stage, info = {}) {
    const safe = sanitized(stage,info);
    if (typeof chrome.storage.local.getKeys === "function") {
      const key = PREFIX + Date.now().toString(36) + ":" +
        Math.random().toString(36).slice(2,12);
      chrome.storage.local.set({[key]:safe}).catch(()=>{});
    } else {
      legacyQueue = legacyQueue.then(async () => {
        const old = (await chrome.storage.local.get(LEGACY))[LEGACY];
        const rows = Array.isArray(old) ? old : [];
        rows.push(safe);
        await chrome.storage.local.set({[LEGACY]:rows.slice(-MAX)});
      }).catch(()=>{});
    }
  }
  async function keys() {
    if (typeof chrome.storage.local.getKeys !== "function") return [];
    return (await chrome.storage.local.getKeys()).filter(k=>k.startsWith(PREFIX)).sort();
  }
  async function rows() {
    const old = (await chrome.storage.local.get(LEGACY))[LEGACY];
    let all = Array.isArray(old) ? old.filter(x=>x && typeof x.stage === "string") : [];
    const listed = await keys();
    if (listed.length) {
      const found = await chrome.storage.local.get(listed.slice(-MAX*2));
      all = all.concat(Object.values(found).filter(x=>x && typeof x.stage === "string"));
    }
    return all.sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(-MAX);
  }
  async function cleanup() {
    const list = await keys();
    if (list.length > MAX*2) await chrome.storage.local.remove(list.slice(0,list.length-MAX));
  }
  function locate(payload) {
    let target = payload, structure = "raiz";
    for (let depth=0;depth<3;depth++) {
      if (target && typeof target === "object" &&
          (Array.isArray(target.normal) || Array.isArray(target.premium)))
        return {target,structure};
      let next = null, nextName = "";
      for (const name of ["data","result","payload"]) {
        if (target && typeof target === "object" && target[name] &&
            !Array.isArray(target[name]) && typeof target[name] === "object") {
          next = target[name];nextName=name;break;
        }
      }
      if (!next) break;
      target=next;structure=nextName;
    }
    return {target:null,structure:"no-reconocida"};
  }
  function summary(data,status,transport,duration=0) {
    const {target,structure}=locate(data);
    const normal=Array.isArray(target?.normal)?target.normal:[];
    const premium=Array.isArray(target?.premium)?target.premium:[];
    const all=normal.concat(premium);
    event("catalogo-respuesta",{
      transporte:transport,http:Number(status)||0,duracionMs:duration,
      estructura:structure,normal:normal.length,premium:premium.length,
      conUrl:all.filter(x=>nonempty(x?.d)).length,
      conCorreo:all.filter(x=>nonempty(x?.e)).length,
      conClave:all.filter(x=>nonempty(x?.k)).length,
      conProxy:all.filter(x=>nonempty(x?.proxy)).length,
      modoCookie:all.filter(x=>x?.lm==="cookie").length,
      bloqueadas:all.filter(x=>x?.isLock===true).length
    });
  }
  function isCatalog(url) {
    try { return new URL(String(url),location.href).pathname.endsWith("/api/shops/extension"); }
    catch { return false; }
  }
  function isProducts(url) {
    try{return new URL(String(url),location.href).pathname.endsWith("/api/products/getmostusedtool");}
    catch{return false;}
  }
  function summaryProducts(body,status,transport,duration=0){
    const source=body&&typeof body==="object"?body:null;
    event("productos-respuesta",{
      transporte:transport,http:Number(status)||0,duracionMs:duration,
      cifrado:typeof source?.products==="string"&&source.products.length>0,
      hayMas:source?.hasMore===true
    });
  }
  function flags(p){
    // Solo se admiten booleanos producidos por el bundle; nunca guardar valores.
    const o={};
    for(const key of ["d","e","k","proxy","lm","cookie","id","isLock","locked"])
      o[key]=p?.[key]===true;
    return o;
  }
  globalThis.__kzDiagnosticProductBatch=function(items,hasMore){
    if(!Array.isArray(items)||items.length>500)return;
    const lote=++productBatch;
    const rows=items.map(flags);
    event("productos-descifrados",{
      lote,cuenta:rows.length,hayMas:hasMore===true,
      conUrl:rows.filter(x=>x.d).length,
      conCorreo:rows.filter(x=>x.e).length,
      conClave:rows.filter(x=>x.k).length,
      conProxy:rows.filter(x=>x.proxy).length,
      modoCookie:rows.filter(x=>x.cookie).length,
      bloqueadas:rows.filter(x=>x.locked).length
    });
    rows.slice(0,30).forEach((o,i)=>event("producto-campos",{lote,indice:i+1,...o}));
  };
  globalThis.__kzDiagnosticCardClickFields=function(candidate){
    if(!currentFlow||Date.now()-currentFlowAt>10000)return;
    event("tarjeta-campos-al-clic",{flujo:currentFlow,...flags(candidate)});
  };
  function looksPublicPage(url) {
    try {const x=new URL(String(url),location.href);return x.protocol==="https:" || x.protocol==="http:";}
    catch {return false;}
  }
  function elapsed(start) {return Math.max(0,Date.now()-start);}

  // Solo metadatos de dos endpoints. Nunca almacenar JSON bruto ni contenido cifrado.
  try {
    const native=globalThis.fetch;
    if(typeof native==="function"){
      globalThis.fetch=async function(...args){
        const url=typeof args[0]==="string"?args[0]:args[0]?.url;
        const route=isCatalog(url)?"catalogo":isProducts(url)?"productos":"";
        if(!route)return native.apply(this,args);
        const start=Date.now();
        event(route+"-envio",{transporte:"fetch",
          metodo:String(args[1]?.method||args[0]?.method||"GET").toUpperCase()});
        let response;
        try{response=await native.apply(this,args);}
        catch(error){
          event(route+"-error",{transporte:"fetch",tipo:"red",duracionMs:elapsed(start)});
          throw error;
        }
        response.clone().json().then(body=>{
          if(route==="catalogo")summary(body,response.status,"fetch",elapsed(start));
          else summaryProducts(body,response.status,"fetch",elapsed(start));
        }).catch(()=>event(route+"-respuesta-invalida",{
          transporte:"fetch",http:response.status
        }));
        return response;
      };
    }
  }catch{}
  try{
    const originalOpen=XMLHttpRequest.prototype.open;
    const originalSend=XMLHttpRequest.prototype.send;
    const pending=new WeakMap();
    XMLHttpRequest.prototype.open=function(method,url,...rest){
      const route=isCatalog(url)?"catalogo":isProducts(url)?"productos":"";
      if(route){
        pending.set(this,{route,metodo:String(method).toUpperCase().slice(0,16),start:0});
        this.addEventListener("error",()=>event(route+"-error",{transporte:"xhr",tipo:"red"}),{once:true});
        this.addEventListener("loadend",()=>{
          const request=pending.get(this);
          const duration=request?.start?elapsed(request.start):0;
          try{
            const body=this.responseType==="json"?this.response:JSON.parse(this.responseText);
            if(route==="catalogo")summary(body,this.status,"xhr",duration);
            else summaryProducts(body,this.status,"xhr",duration);
          }catch{
            event(route+"-respuesta-invalida",{
              transporte:"xhr",http:this.status,duracionMs:duration});
          }
        },{once:true});
      }
      return originalOpen.call(this,method,url,...rest);
    };
    XMLHttpRequest.prototype.send=function(...args){
      const request=pending.get(this);
      if(request){
        request.start=Date.now();
        event(request.route+"-envio",{transporte:"xhr",metodo:request.metodo});
      }
      return originalSend.apply(this,args);
    };
  }catch{}

  // Seguimiento dirigido a la pestaña que abre la extensión del catálogo.
  // Esta señal no contiene credenciales ni modifica permisos del servidor.
  const openedWindows=new Map();
  const openedTabs=new Map();
  function validId(id){return Number.isSafeInteger(id)&&id>=0;}
  function linkTab(flujo,ventana,pestana){
    if(!validId(pestana))return;
    const old=openedTabs.get(pestana);
    if(old&&old.flujo===flujo&&old.ventana===ventana)return;
    const item={flujo,ventana,pestana,confirmed:false,attempts:0};
    openedTabs.set(pestana,item);
    event("pestana-identificada",{flujo,ventana,pestana});
    // Reintentos limitados: el content script puede cargarse después de tabs.onUpdated.
    for(const ms of [300,950,1900,3400,6000,9000]){
      setTimeout(()=>{if(openedTabs.get(pestana)===item&&!item.confirmed)
        void pingTab(item);},ms);
    }
  }
  async function pingTab(item){
    if(item.confirmed||++item.attempts>7)return;
    try{
      const result=await chrome.tabs.sendMessage(item.pestana,{
        type:"kz-diagnostic-bind-v3",
        flujo:item.flujo,ventana:item.ventana,pestana:item.pestana
      });
      if(result?.ok===true&&!item.confirmed){
        item.confirmed=true;
        event("pestana-vinculada",{
          flujo:item.flujo,ventana:item.ventana,pestana:item.pestana
        });
      }
    }catch{}
    if(!item.confirmed&&item.attempts===7)
      event("pestana-sin-respuesta",{flujo:item.flujo,ventana:item.ventana,pestana:item.pestana});
  }
  async function discoverTabs(ventana,flujo){
    try{
      const tabs=await chrome.tabs.query({windowId:ventana});
      for(const tab of tabs||[]){
        if(validId(tab?.id)&&(!tab.url||looksPublicPage(tab.url)))
          linkTab(flujo,ventana,tab.id);
      }
    }catch{
      event("pestana-consulta-error",{flujo,ventana});
    }
  }
  function observeWindow(flujo,windowInfo){
    const id=windowInfo?.id;
    if(!validId(id)){
      event("apertura-sin-identificador",{flujo});
      return;
    }
    if(openedWindows.has(id))return;
    openedWindows.set(id,flujo);
    event("apertura-confirmada",{flujo,medio:"chrome.windows.create",ventana:id});
    void discoverTabs(id,flujo);
    setTimeout(()=>{if(openedWindows.get(id)===flujo)void discoverTabs(id,flujo);},1400);
  }
  try{
    chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{
      const ventana=tab?.windowId;
      const flujo=openedWindows.get(ventana);
      if(!flujo||!validId(tabId))return;
      const targetUrl=change?.url||tab?.url;
      if(targetUrl&&!looksPublicPage(targetUrl))return;
      if(change?.status==="loading")openedTabs.delete(tabId);
      linkTab(flujo,ventana,tabId);
    });
    chrome.tabs.onRemoved.addListener(id=>openedTabs.delete(id));
    chrome.windows.onRemoved.addListener(id=>openedWindows.delete(id));
  }catch{}
  try {
    const native=chrome.windows.create;
    chrome.windows.create=function(...args) {
      const candidate=args[0]?.url;
      const url=Array.isArray(candidate)?candidate[0]:candidate;
      const monitored=Boolean(currentFlow)&&Date.now()-currentFlowAt<30000&&looksPublicPage(url);
      const flujo=currentFlow;
      if(monitored)event("apertura-solicitada",{flujo,medio:"chrome.windows.create"});
      const previous=typeof args[1]==="function"?args[1]:null;
      if(monitored&&previous){
        args[1]=function(...cbargs){
          if(cbargs[0])observeWindow(flujo,cbargs[0]);
          else event("apertura-error",{flujo,medio:"chrome.windows.create"});
          return previous.apply(this,cbargs);
        };
      }
      try{
        const result=native.apply(this,args);
        if(monitored&&result&&typeof result.then==="function")
          result.then(info=>observeWindow(flujo,info))
            .catch(()=>event("apertura-error",{flujo,medio:"chrome.windows.create"}));
        return result;
      }catch(error){
        if(monitored)event("apertura-error",{flujo,medio:"chrome.windows.create"});
        throw error;
      }
    };
  }catch{}
  try {
    const native=window.open;
    window.open=function(...args){
      const monitored=Boolean(currentFlow)&&Date.now()-currentFlowAt<30000&&looksPublicPage(args[0]);
      const flujo=currentFlow;
      if(monitored)event("apertura-solicitada",{flujo,medio:"window.open"});
      try{
        const result=native.apply(this,args);
        if(monitored)event(result?"apertura-sin-identificador":"apertura-sin-confirmacion",
          {flujo,medio:"window.open"});
        return result;
      }catch(error){
        if(monitored)event("apertura-error",{flujo,medio:"window.open"});
        throw error;
      }
    };
  }catch{}

  // La escritura de product puede venir de CÓDIGOS, de una tarjeta, o de otra
  // acción. Solo se atribuye a una acción reciente observada (20 segundos).
  try {
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=="local" || !Object.hasOwn(changes,"product")) return;
      const product=changes.product.newValue;
      if(!product){
        event("sesion-temporal-eliminada",lastProductOwner);
        lastProductOwner={flujo:"",origen:"sin-asociar",asociada:false};
        return;
      }
      const age=Date.now()-currentFlowAt;
      const asociada=Boolean(currentFlow && age>=0 && age<20000);
      lastProductOwner={
        flujo:asociada?currentFlow:"",
        origen:asociada?currentSource:"sin-asociar",
        asociada
      };
      event("sesion-temporal-preparada",{
        ...lastProductOwner,
        url:nonempty(product.d),correo:nonempty(product.e),
        clave:nonempty(product.k),claveCifrada:nonempty(product.ek),
        identificador:nonempty(product.pid)
      });
    });
  } catch {}
  function action(stage,origen){
    currentFlow="f"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    currentFlowAt=Date.now();
    currentSource=origen;
    event(stage,{flujo:currentFlow,origen});
    // Este marcador no es autorización ni contiene URL o credenciales.
    chrome.storage.local.set({[TRACE]:{id:currentFlow,at:Date.now()}}).catch(()=>{});
  }
  try {
    document.addEventListener("click",e=>{
      const button=e.target?.closest?.("button");
      if(button && /^\s*C[ÓO]DIGOS(?:\s|$)/i.test(button.textContent||"")){
        action("clic-codigos","codigos");
        return;
      }
      const card=e.target?.closest?.('[role="button"]');
      if(card && card.querySelector("img"))action("clic-tarjeta","tarjeta");
    },true);
  } catch {}

  function diagnosis(events) {
    const e=events.slice().reverse();
    const recent=stage=>e.find(x=>x.stage===stage);
    const last=e.find(x=>x.stage==="clic-tarjeta"||x.stage==="clic-codigos");
    const source=last?.stage==="clic-codigos"?"codigos":"tarjeta";
    const tracked=stage=>last?.flujo?
      e.find(x=>x.stage===stage&&x.flujo===last.flujo):null;
    const categories=recent("catalogo-respuesta");
    const fetched=recent("productos-respuesta");
    const decoded=recent("productos-descifrados");
    const selected=source==="tarjeta"?tracked("tarjeta-campos-al-clic"):null;
    const orphanSession=recent("sesion-temporal-preparada");
    const opening=tracked("apertura-confirmada");
    const bind=tracked("pestana-vinculada");
    const noTab=tracked("pestana-sin-respuesta");
    const session=tracked("sesion-temporal-preparada");
    const active=tracked("script-formulario-activo");
    const noSession=tracked("formulario-sin-sesion");
    const form=tracked("formulario-observado");
    const bool=x=>x===true?"sí":"no";
    return [
      "Categorías: "+(categories?"HTTP "+categories.http+" · normal "+
        categories.normal+" · premium "+categories.premium+
        " (no representan tarjetas)":"sin respuesta observada"),
      "Productos (servidor): "+(fetched?"HTTP "+fetched.http+
        " · bloque cifrado "+bool(fetched.cifrado):
        "sin respuesta observada de /api/products/getmostusedtool"),
      "Productos (tras descifrar): "+(decoded?decoded.cuenta+
        " · d "+decoded.conUrl+" · e "+decoded.conCorreo+" · k "+decoded.conClave+
        " · proxy "+decoded.conProxy+" · bloqueadas "+decoded.bloqueadas:
        "sin lote descifrado observado"),
      "Acción: "+(last?(source==="codigos"?"botón CÓDIGOS (no es tarjeta)":"tarjeta de herramientas"):"sin acción observada"),
      "Tarjeta pulsada: "+(source==="codigos"&&last?"no aplica: es el botón CÓDIGOS":
        selected?"d "+bool(selected.d)+" · e "+bool(selected.e)+
        " · k "+bool(selected.k)+" · proxy "+bool(selected.proxy)+
        " · lm "+bool(selected.lm)+" · isLock "+bool(selected.isLock)+
        " · restringida "+bool(selected.locked):
        last?"clic detectado; campos pendientes de la tarjeta":"sin clic registrado"),
      "Ruta: "+(source==="codigos"&&last?"CÓDIGOS: flujo independiente de las tarjetas":
        selected?(selected.locked?"página pública, sin sesión gestionada":
        "tarjeta autorizada, comprobar preparación de product"):"sin ruta clasificada"),
      "Ventana: "+(opening?"creada · ID "+opening.ventana:
        tracked("apertura-solicitada")?"solicitada, sin ID confirmado":"sin apertura observada"),
      "Pestaña: "+(bind?"conectada · ID "+bind.pestana:
        noTab?"sin respuesta del observador":"sin vinculación confirmada"),
      "Sesión product: "+(session?"preparada · origen "+(session.origen||"sin-asociar"):
        noSession?"ausente en la pestaña":
        orphanSession?"detectada en otro momento · origen "+(orphanSession.origen||"sin-asociar"):
        "sin preparación observada"),
      "Formulario: "+(active?"observador con product":
        noSession?"observador activo; "+noSession.motivo:"sin observación asociada"),
      "Campos del formulario: "+(form?"correo "+form.camposCorreo+
        ", contraseña "+form.camposClave:"sin información observada"),
      "Nota: CÓDIGOS no es una tarjeta. Las sesiones se asocian solo a clics recientes y solo se registran indicadores de presencia."
    ].join("\n");
  }
  async function refresh() {
    if(!visible || !output)return;
    try {const list=await rows();if(visible)output.textContent=diagnosis(list)+"\n\n"+
      list.map(x=>JSON.stringify(x)).join("\n");}
    catch {output.textContent="No se pudo leer el diagnóstico local.";}
  }
  function installPanel(){
    if(document.getElementById("kz-diagnostic-button"))return;
    const btn=document.createElement("button");
    btn.id="kz-diagnostic-button";btn.textContent="Diagnóstico";
    btn.style.cssText="position:fixed;bottom:16px;right:16px;z-index:2147483646;background:#164e63;color:white;border:1px solid #67e8f9;border-radius:10px;padding:10px 14px;font:600 13px system-ui;cursor:pointer";
    const panel=document.createElement("section");
    panel.style.cssText="display:none;position:fixed;bottom:62px;right:16px;z-index:2147483647;background:#0b1220;color:#e2e8f0;border:1px solid #64748b;border-radius:12px;padding:14px;width:min(680px,calc(100vw - 32px));max-height:75vh;box-sizing:border-box;font:13px system-ui";
    const title=document.createElement("strong");title.textContent="Diagnóstico completo · categorías, productos, tarjeta y formulario";
    note=document.createElement("p");note.textContent="Solo metadatos: nunca copia direcciones, credenciales, tokens, cookies ni respuestas completas.";
    note.style.cssText="font-size:12px;color:#cbd5e1";
    output=document.createElement("pre");
    output.style.cssText="white-space:pre-wrap;overflow:auto;max-height:49vh;font:11px/1.5 monospace;background:#111827;padding:8px;border-radius:6px";
    const actions=document.createElement("div");actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
    const add=(label,callback)=>{
      const button=document.createElement("button");button.textContent=label;
      button.style.cssText="background:#334155;color:#fff;border:1px solid #94a3b8;border-radius:7px;padding:7px;cursor:pointer";
      button.addEventListener("click",callback);actions.appendChild(button);
    };
    add("Copiar informe",async()=>{
      const list=await rows();
      const payload=JSON.stringify({version:4,resumen:diagnosis(list),events:list},null,2);
      try {await navigator.clipboard.writeText(payload);note.textContent="Informe copiado sin credenciales.";}
      catch {note.textContent="No se pudo copiar automáticamente; selecciona el texto mostrado.";}
    });
    add("Actualizar",refresh);
    add("Borrar eventos",async()=>{
      const list=await keys();
      if(list.length)await chrome.storage.local.remove(list);
      await chrome.storage.local.remove(LEGACY);
      await refresh();
    });
    add("Cerrar",()=>{panel.style.display="none";visible=false;});
    btn.addEventListener("click",async()=>{
      visible=!visible;panel.style.display=visible?"block":"none";
      if(visible){await cleanup();refresh();}
    });
    panel.append(title,note,output,actions);
    (document.body||document.documentElement).append(panel,btn);
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(visible && area==="local" && Object.keys(changes).some(k=>k===LEGACY || k.startsWith(PREFIX)))refresh();
    });
    event("diagnostico-catalogo-iniciado");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installPanel,{once:true});
  else installPanel();
})();