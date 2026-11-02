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
    "estructura","medio","resultado","url","correo","clave","claveCifrada",
    "identificador","motivo","tipo","marco","dominioCoincide"
  ]);
  const nonempty = v => typeof v === "string" ? v.trim().length > 0 : v != null && v !== "";
  let currentFlow = "";
  let visible = false;
  let output = null;
  let note = null;
  let legacyQueue = Promise.resolve();

  function sanitized(stage, info = {}) {
    const safe = {time:new Date().toISOString(),stage:String(stage).slice(0,55)};
    for (const [key,value] of Object.entries(info)) {
      if (!SAFE_KEYS.has(key)) continue;
      if (typeof value === "boolean") safe[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) safe[key] = Math.max(0,Math.min(1000000,Math.floor(value)));
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
  function looksPublicPage(url) {
    try {const x=new URL(String(url),location.href);return x.protocol==="https:" || x.protocol==="http:";}
    catch {return false;}
  }
  function elapsed(start) {return Math.max(0,Date.now()-start);}

  // Observe only the catalog endpoint; never export the original JSON response.
  try {
    const native = globalThis.fetch;
    if (typeof native === "function") {
      globalThis.fetch = async function(...args) {
        const url=typeof args[0]==="string"?args[0]:args[0]?.url;
        if (!isCatalog(url)) return native.apply(this,args);
        const start=Date.now();
        event("catalogo-envio",{transporte:"fetch",metodo:String(args[1]?.method||args[0]?.method||"GET").toUpperCase()});
        let response;
        try {response=await native.apply(this,args);}
        catch {event("catalogo-error",{transporte:"fetch",tipo:"red",duracionMs:elapsed(start)});throw new Error("Error al solicitar catálogo");}
        response.clone().json().then(body=>summary(body,response.status,"fetch",elapsed(start)))
          .catch(()=>event("catalogo-respuesta-invalida",{transporte:"fetch",http:response.status}));
        return response;
      };
    }
  } catch {}
  try {
    const originalOpen=XMLHttpRequest.prototype.open;
    const originalSend=XMLHttpRequest.prototype.send;
    const pending=new WeakMap();
    XMLHttpRequest.prototype.open=function(method,url,...rest) {
      if (isCatalog(url)) {
        pending.set(this,{metodo:String(method).toUpperCase().slice(0,16),start:0});
        this.addEventListener("error",()=>event("catalogo-error",{transporte:"xhr",tipo:"red"}),{once:true});
        this.addEventListener("loadend",()=>{
          const request=pending.get(this);
          const duracionMs=request?.start?elapsed(request.start):0;
          try {
            const data=this.responseType==="json"?this.response:JSON.parse(this.responseText);
            summary(data,this.status,"xhr",duracionMs);
          } catch {
            event("catalogo-respuesta-invalida",{transporte:"xhr",http:this.status,duracionMs});
          }
        },{once:true});
      }
      return originalOpen.call(this,method,url,...rest);
    };
    XMLHttpRequest.prototype.send=function(...args) {
      const request=pending.get(this);
      if (request) {
        request.start=Date.now();
        event("catalogo-envio",{transporte:"xhr",metodo:request.metodo});
      }
      return originalSend.apply(this,args);
    };
  } catch {}

  // Observe browser opening without replacing or modifying the original result.
  try {
    const native=chrome.windows.create;
    chrome.windows.create=function(...args) {
      const candidate=args[0]?.url;
      const url=Array.isArray(candidate)?candidate[0]:candidate;
      const monitored=Boolean(currentFlow) && looksPublicPage(url);
      if(monitored)event("apertura-solicitada",{flujo:currentFlow,medio:"chrome.windows.create"});
      try {
        const result=native.apply(this,args);
        if(monitored && result && typeof result.then==="function")
          result.then(()=>event("apertura-confirmada",{flujo:currentFlow,medio:"chrome.windows.create"}))
            .catch(()=>event("apertura-error",{flujo:currentFlow,medio:"chrome.windows.create"}));
        return result;
      } catch (error) {
        if(monitored)event("apertura-error",{flujo:currentFlow,medio:"chrome.windows.create"});
        throw error;
      }
    };
  } catch {}
  try {
    const native=window.open;
    window.open=function(...args) {
      const monitored=Boolean(currentFlow) && looksPublicPage(args[0]);
      if(monitored)event("apertura-solicitada",{flujo:currentFlow,medio:"window.open"});
      try {
        const result=native.apply(this,args);
        if(monitored)event(result?"apertura-confirmada":"apertura-sin-confirmacion",
          {flujo:currentFlow,medio:"window.open"});
        return result;
      } catch (error) {
        if(monitored)event("apertura-error",{flujo:currentFlow,medio:"window.open"});
        throw error;
      }
    };
  } catch {}

  try {
    chrome.storage.local.get(TRACE).then(v=>{
      const trace=v[TRACE];
      if(trace && typeof trace.id==="string" &&
          Date.now()-trace.at<120000 && !currentFlow) currentFlow=trace.id;
    }).catch(()=>{});
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=="local" || !Object.hasOwn(changes,"product")) return;
      const product=changes.product.newValue;
      if(!product) {event("sesion-temporal-eliminada",{flujo:currentFlow});return;}
      event("sesion-temporal-preparada",{
        flujo:currentFlow,url:nonempty(product.d),correo:nonempty(product.e),
        clave:nonempty(product.k),claveCifrada:nonempty(product.ek),
        identificador:nonempty(product.pid)
      });
    });
  } catch {}
  try {
    document.addEventListener("click",e=>{
      const card=e.target?.closest?.('[role="button"]');
      if(!card || !card.querySelector("img"))return;
      currentFlow="f"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
      event("clic-tarjeta",{flujo:currentFlow});
      // A trace marker has no authority and contains neither the card ID nor a URL.
      chrome.storage.local.set({[TRACE]:{id:currentFlow,at:Date.now()}}).catch(()=>{});
    },true);
  } catch {}

  function diagnosis(events) {
    const e=events.slice().reverse();
    const recent=stage=>e.find(x=>x.stage===stage);
    const last=recent("clic-tarjeta");
    const session=recent("sesion-temporal-preparada");
    const opening=recent("apertura-solicitada");
    const page=recent("script-formulario-activo")||recent("formulario-sin-sesion");
    const form=recent("formulario-observado");
    const catalog=recent("catalogo-respuesta");
    const notes=[
      "Catálogo: "+(catalog?"HTTP "+catalog.http+" · "+(catalog.normal+catalog.premium)+" tarjetas · estructura "+catalog.estructura:"sin respuesta observada"),
      "Tarjeta: "+(last?"clic registrado":"sin clic registrado"),
      "Apertura: "+(opening?"solicitada mediante "+opening.medio:"sin llamada de apertura observada"),
      "Sesión: "+(session&&(!last || session.time>=last.time)?"preparación observada":"sin preparación observada tras el último clic"),
      "Formulario: "+(page?"script ejecutado":"todavía sin evento del script"),
      "Campos: "+(form?("correo "+form.camposCorreo+", clave "+form.camposClave+
        "; contenido correo "+Boolean(form.correoConContenido)+", clave "+Boolean(form.claveConContenido)):
        "sin información de campos"),
      "Nota: valores presentes no prueban que la extensión efectuó el autocompletado."
    ];
    return notes.join("\n");
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
    const title=document.createElement("strong");title.textContent="Diagnóstico detallado · apertura y formulario";
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
      const payload=JSON.stringify({version:2,resumen:diagnosis(list),events:list},null,2);
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