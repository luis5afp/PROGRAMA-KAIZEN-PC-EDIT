"use strict";
(() => {
  if (globalThis.__kzDiagnosticCatalog) return;
  globalThis.__kzDiagnosticCatalog = true;

  const STORE = "kzDiagnosticSafeEventsV1";
  const limit = 70;
  let chain = Promise.resolve();
  const bool = v => typeof v === "string" ? v.trim().length > 0 : v != null && v !== "";
  function event(stage, info = {}) {
    const safe = {time:new Date().toISOString(), stage, ...info};
    chain = chain.then(async () => {
      const old = (await chrome.storage.local.get(STORE))[STORE];
      const rows = Array.isArray(old) ? old : [];
      rows.push(safe);
      await chrome.storage.local.set({[STORE]:rows.slice(-limit)});
      if (typeof refresh === "function") refresh();
    }).catch(() => {});
  }
  function summary(data, status, transport) {
    const normal = Array.isArray(data?.normal) ? data.normal : [];
    const premium = Array.isArray(data?.premium) ? data.premium : [];
    const all = normal.concat(premium);
    event("catalogo-respuesta",{
      transport, http: Number(status) || 0,
      normal:normal.length, premium:premium.length,
      conUrl:all.filter(x => bool(x?.d)).length,
      conCorreo:all.filter(x => bool(x?.e)).length,
      conClave:all.filter(x => bool(x?.k)).length,
      conProxy:all.filter(x => bool(x?.proxy)).length,
      modoCookie:all.filter(x => x?.lm === "cookie").length,
      bloqueadas:all.filter(x => x?.isLock === true).length
    });
  }
  function isCatalog(url) {
    try { return new URL(String(url), location.href).pathname.endsWith("/api/shops/extension"); }
    catch { return false; }
  }
  // Inspect only aggregate counts; never retain response bodies, credentials or tokens.
  try {
    const nativeFetch = globalThis.fetch;
    if (typeof nativeFetch === "function") {
      globalThis.fetch = async function(...args) {
        const result = await nativeFetch.apply(this,args);
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (isCatalog(url)) result.clone().json()
          .then(data => summary(data,result.status,"fetch"))
          .catch(() => event("catalogo-respuesta-invalida",{transport:"fetch",http:result.status}));
        return result;
      };
    }
  } catch {}
  try {
    const nativeOpen = XMLHttpRequest.prototype.open;
    const catalogRequests = new WeakSet();
    XMLHttpRequest.prototype.open = function(method,url,...rest) {
      if (isCatalog(url)) {
        catalogRequests.add(this);
        this.addEventListener("loadend", () => {
          try {
            const data = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            summary(data,this.status,"xhr");
          } catch {
            event("catalogo-respuesta-invalida",{transport:"xhr",http:this.status});
          }
        },{once:true});
      }
      return nativeOpen.call(this,method,url,...rest);
    };
  } catch {}
  try {
    chrome.storage.onChanged.addListener((changes,area) => {
      if (area !== "local" || !Object.hasOwn(changes,"product")) return;
      const product = changes.product.newValue;
      if (!product) { event("sesion-temporal-eliminada"); return; }
      event("sesion-temporal-preparada",{
        url:bool(product.d),correo:bool(product.e),clave:bool(product.k),
        claveCifrada:bool(product.ek),modoCookie:product.fb === 1,
        identificador:bool(product.pid)
      });
    });
  } catch {}
  try {
    document.addEventListener("click", e => {
      const card = e.target?.closest?.('[role="button"]');
      if (card && card.querySelector("img")) event("clic-tarjeta");
    },true);
  } catch {}

  let display = null;
  function refresh() {
    if (!display) return;
    chrome.storage.local.get(STORE).then(x=>{
      if (display) display.textContent = (x[STORE]||[]).map(e=>JSON.stringify(e)).join("\n") || "Sin eventos todavía. Abre una tarjeta del catálogo.";
    }).catch(()=>{});
  }
  function installPanel() {
    if (document.getElementById("kz-diagnostic-button")) return;
    const btn = document.createElement("button");
    btn.id="kz-diagnostic-button";btn.textContent="Diagnóstico";
    btn.style.cssText="position:fixed;bottom:16px;right:16px;z-index:2147483646;background:#164e63;color:white;border:1px solid #67e8f9;border-radius:10px;padding:10px 14px;font:600 13px system-ui;cursor:pointer";
    const panel = document.createElement("section");
    panel.style.cssText="display:none;position:fixed;bottom:62px;right:16px;z-index:2147483647;background:#0b1220;color:#e2e8f0;border:1px solid #64748b;border-radius:12px;padding:14px;width:min(550px,calc(100vw - 32px));max-height:65vh;box-sizing:border-box;font:13px system-ui";
    const title=document.createElement("strong");title.textContent="Diagnóstico local de catálogo y autocompletado";
    const note=document.createElement("p");note.textContent="Solo estados y cantidades: no copia contraseñas, correos, tokens, cookies ni direcciones.";
    note.style.cssText="font-size:12px;color:#cbd5e1";
    const pre=document.createElement("pre");pre.style.cssText="white-space:pre-wrap;overflow:auto;max-height:39vh;font:11px/1.5 monospace;background:#111827;padding:8px;border-radius:6px";
    const actions=document.createElement("div");actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
    const add=(label,click)=>{const el=document.createElement("button");el.textContent=label;el.style.cssText="background:#334155;color:#fff;border:1px solid #94a3b8;border-radius:7px;padding:7px;cursor:pointer";el.addEventListener("click",click);actions.appendChild(el);};
    add("Copiar informe",async()=>{
      const rows=(await chrome.storage.local.get(STORE))[STORE]||[];
      const payload=JSON.stringify({version:1,events:rows},null,2);
      try { await navigator.clipboard.writeText(payload); note.textContent="Informe copiado. No contiene secretos."; }
      catch { note.textContent="No se pudo copiar automáticamente; selecciona el texto del informe."; }
    });
    add("Borrar eventos",async()=>{await chrome.storage.local.remove(STORE);refresh();});
    add("Cerrar",()=>{panel.style.display="none";});
    panel.append(title,note,pre,actions);
    btn.addEventListener("click",()=>{panel.style.display=panel.style.display==="none"?"block":"none";display=panel.style.display==="block"?pre:null;refresh();});
    (document.body||document.documentElement).append(panel,btn);
    event("diagnostico-catalogo-iniciado");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",installPanel,{once:true});
  else installPanel();
})();