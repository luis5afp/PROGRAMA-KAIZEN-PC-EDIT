"use strict";
(() => {
  // Solo observabilidad: este archivo NO modifica formularios, sesiones ni permisos.
  // Una página web normal no se supervisa hasta recibir la señal dirigida a su tab.
  const PREFIX="kzDiagnosticSafeEventV2:";
  const STORE_OLD="kzDiagnosticSafeEventsV1";
  const ALLOWED=new Set([
    "flujo","ventana","pestana","marco","motivo","dominioCoincide",
    "correoDisponible","claveDisponible","claveCifradaDisponible",
    "credencialesCompletas","sesionRespaldo","camposCorreo","camposClave",
    "correoConContenido","claveConContenido","intentos"
  ]);
  const bindings=new Set();
  let fallback=Promise.resolve();
  function event(stage,info={}){
    const row={time:new Date().toISOString(),stage:String(stage).slice(0,60)};
    for(const [key,value] of Object.entries(info)){
      if(!ALLOWED.has(key))continue;
      if(typeof value==="boolean")row[key]=value;
      else if(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0)row[key]=value;
      else if(typeof value==="string"&&value.length<85&&/^[a-zA-Z0-9_.:-]+$/.test(value))
        row[key]=value;
    }
    if(typeof chrome.storage.local.getKeys==="function"){
      const key=PREFIX+Date.now().toString(36)+":"+Math.random().toString(36).slice(2,12);
      chrome.storage.local.set({[key]:row}).catch(()=>{});
    }else{
      fallback=fallback.then(async()=>{
        const old=(await chrome.storage.local.get(STORE_OLD))[STORE_OLD];
        const rows=Array.isArray(old)?old:[];
        rows.push(row);
        await chrome.storage.local.set({[STORE_OLD]:rows.slice(-160)});
      }).catch(()=>{});
    }
  }
  const marco=window===window.top?"principal":"secundario";
  function freshProduct(product){
    if(!product||typeof product!=="object")return {ok:false,motivo:"ausente"};
    if(typeof product.t!=="number"||!Number.isFinite(product.t))
      return {ok:false,motivo:"fecha-invalida"};
    if(Date.now()-product.t>120000||product.t>Date.now()+5000)
      return {ok:false,motivo:"caducada"};
    return {ok:true};
  }
  async function inspect(flujo,ventana,pestana){
    const ctx={flujo,ventana,pestana,marco};
    event("diagnostico-pestana-activa",ctx);
    let product=null,reason="ausente",respaldo=false;
    for(let i=0;i<12;i++){
      const state=await chrome.storage.local.get(["product","autofillSession"]);
      const info=freshProduct(state.product);
      respaldo=!!(state.autofillSession&&typeof state.autofillSession==="object");
      reason=info.motivo||"";
      if(info.ok){product=state.product;break;}
      if(i<11)await new Promise(resolve=>setTimeout(resolve,400));
    }
    if(!product){
      event("formulario-sin-sesion",{...ctx,motivo:respaldo?"solo-respaldo":reason,
        sesionRespaldo:respaldo});
      return;
    }
    let domainMatch=false;
    try{
      const host=new URL(product.d).hostname;
      domainMatch=location.hostname===host||location.hostname.endsWith("."+host);
    }catch{}
    const email=typeof product.e==="string"&&product.e.trim().length>0;
    const plain=typeof product.k==="string"&&product.k.length>0;
    const encrypted=typeof product.ek==="string"&&product.ek.length>0;
    event("script-formulario-activo",{
      ...ctx,dominioCoincide:domainMatch,correoDisponible:email,
      claveDisponible:plain,claveCifradaDisponible:encrypted,
      credencialesCompletas:email&&(plain||encrypted),sesionRespaldo:respaldo
    });
    // Solo contar campos, nunca registrar su valor.
    let last="",attempts=0,timer=null;
    const scan=()=>{
      attempts++;
      const all=Array.from(document.querySelectorAll("input"));
      const passes=all.filter(n=>(n.type||"").toLowerCase()==="password");
      const mails=all.filter(n=>{
        const type=(n.type||"").toLowerCase();
        const desc=[n.name,n.id,n.autocomplete,n.placeholder].join(" ");
        return type==="email"||(type==="text"&&/email|correo|login|usuario|user|account|identifier/i.test(desc));
      });
      const result={...ctx,camposCorreo:mails.length,camposClave:passes.length,
        correoConContenido:mails.some(n=>!!n.value),claveConContenido:passes.some(n=>!!n.value)};
      const fingerprint=JSON.stringify(result);
      if(fingerprint!==last){last=fingerprint;event("formulario-observado",result);}
      if(result.correoConContenido&&result.claveConContenido){
        if(timer)clearInterval(timer);
        event("formulario-con-campos-rellenos",{...ctx,motivo:"origen-no-verificado",
          camposCorreo:result.camposCorreo,camposClave:result.camposClave});
      }else if(attempts>=30){
        if(timer)clearInterval(timer);
        event("formulario-tiempo-agotado",{...ctx,intentos:attempts,
          camposCorreo:result.camposCorreo,camposClave:result.camposClave});
      }
    };
    // Evitar error de temporal dead zone en un formulario que ya esté rellenado.
    timer=setInterval(scan,1000);
    scan();
  }
  try {
    chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
      if(message?.type!=="kz-diagnostic-bind-v3")return false;
      const flujo=message.flujo;
      const ventana=message.ventana;
      const pestana=message.pestana;
      if(typeof flujo!=="string"||!/^f[a-z0-9]{8,35}$/.test(flujo)||
         !Number.isSafeInteger(ventana)||ventana<0||
         !Number.isSafeInteger(pestana)||pestana<0)return false;
      // La señal solo identifica el tab: nunca transporta producto ni credenciales.
      const id=flujo+":"+pestana+":"+String(location.href);
      if(!bindings.has(id)){
        bindings.add(id);
        inspect(flujo,ventana,pestana).catch(()=>{
          event("formulario-diagnostico-error",{flujo,ventana,pestana,marco,motivo:"observador"});
        });
      }
      sendResponse({ok:true});
      return false;
    });
  }catch{}
})();