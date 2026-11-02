"use strict";
(() => {
  // Never read, persist or transmit entered values. Diagnostics only.
  const LEGACY="kzDiagnosticSafeEventsV1";
  const PREFIX="kzDiagnosticSafeEventV2:";
  const TRACE="kzDiagnosticPendingOpenV2";
  const MAX=160;
  const ALLOWED=new Set([
    "flujo","marco","dominioCoincide","correoDisponible","claveDisponible",
    "claveCifradaDisponible","credencialesCompletas","camposCorreo","camposClave",
    "correoConContenido","claveConContenido","intentos","motivo"
  ]);
  let fallback=Promise.resolve();
  function event(stage,info={}){
    const row={time:new Date().toISOString(),stage:String(stage).slice(0,55)};
    for(const [key,val] of Object.entries(info)){
      if(!ALLOWED.has(key))continue;
      if(typeof val==="boolean")row[key]=val;
      else if(typeof val==="number" && Number.isFinite(val))row[key]=Math.max(0,Math.min(1000000,Math.floor(val)));
      else if(typeof val==="string" && val.length<85 && /^[a-zA-Z0-9_.:-]+$/.test(val))row[key]=val;
    }
    if(typeof chrome.storage.local.getKeys==="function"){
      const key=PREFIX+Date.now().toString(36)+":"+Math.random().toString(36).slice(2,12);
      chrome.storage.local.set({[key]:row}).catch(()=>{});
    }else{
      fallback=fallback.then(async()=>{
        const old=(await chrome.storage.local.get(LEGACY))[LEGACY];
        const rows=Array.isArray(old)?old:[];
        rows.push(row);
        await chrome.storage.local.set({[LEGACY]:rows.slice(-MAX)});
      }).catch(()=>{});
    }
  }
  const marco=window===window.top?"principal":"secundario";
  async function initialize(){
    let product=null, trace=null;
    for(let i=0;i<9;i++){
      const state=await chrome.storage.local.get(["product",TRACE]);
      const marker=state[TRACE];
      const isPending=marker && typeof marker.id==="string" &&
        typeof marker.at==="number" && Date.now()-marker.at<120000;
      trace=isPending?marker:null;
      const candidate=state.product;
      const fresh=candidate && typeof candidate.t==="number" &&
        Date.now()-candidate.t>=0 && Date.now()-candidate.t<120000;
      if(fresh){product=candidate;break;}
      if(!trace)return; // unrelated web page: record nothing
      if(i<8)await new Promise(resolve=>setTimeout(resolve,400));
    }
    const flujo=trace?.id||"";
    if(!product){
      event("formulario-sin-sesion",{flujo,marco,motivo:"sin-producto-temporal"});
      return;
    }
    let hostMatch=false;
    try{
      const u=new URL(product.d);
      hostMatch=location.hostname===u.hostname ||
        location.hostname.endsWith("."+u.hostname);
    }catch{}
    const hasEmail=typeof product.e==="string"&&product.e.trim().length>0;
    const hasPlain=typeof product.k==="string"&&product.k.length>0;
    const hasEncrypted=typeof product.ek==="string"&&product.ek.length>0;
    event("script-formulario-activo",{
      flujo,marco,dominioCoincide:hostMatch,
      correoDisponible:hasEmail,claveDisponible:hasPlain,
      claveCifradaDisponible:hasEncrypted,
      credencialesCompletas:hasEmail&&(hasPlain||hasEncrypted)
    });
    let previous="";
    let attempts=0;
    const scan=()=>{
      attempts++;
      const all=Array.from(document.querySelectorAll("input"));
      const passwords=all.filter(el=>(el.type||"").toLowerCase()==="password");
      const usernames=all.filter(el=>{
        const type=(el.type||"").toLowerCase();
        const label=[el.name,el.id,el.autocomplete,el.placeholder].join(" ");
        return type==="email" || (type==="text" && /email|correo|login|usuario|user|account|identifier/i.test(label));
      });
      const current={
        flujo,marco,camposCorreo:usernames.length,camposClave:passwords.length,
        correoConContenido:usernames.some(el=>Boolean(el.value)),
        claveConContenido:passwords.some(el=>Boolean(el.value))
      };
      const fingerprint=JSON.stringify(current);
      if(fingerprint!==previous){
        previous=fingerprint;
        event("formulario-observado",current);
      }
      if(current.correoConContenido && current.claveConContenido){
        clearInterval(timer);
        event("formulario-con-campos-rellenos",{
          flujo,marco,camposCorreo:current.camposCorreo,camposClave:current.camposClave,
          motivo:"origen-del-relleno-no-verificado"
        });
      }else if(attempts>=30){
        clearInterval(timer);
        event("formulario-tiempo-agotado",{
          flujo,marco,intentos:attempts,
          camposCorreo:current.camposCorreo,camposClave:current.camposClave
        });
      }
    };
    const timer=setInterval(scan,1000);
    scan();
  }
  initialize().catch(()=>{});
})();