"use strict";
(() => {
  // Observes only booleans and counts, never the entered values.
  const STORE="kzDiagnosticSafeEventsV1";
  const write=(stage,info={})=>chrome.storage.local.get(STORE).then(x=>{
    const rows=Array.isArray(x[STORE])?x[STORE]:[];
    rows.push({time:new Date().toISOString(),stage,...info});
    return chrome.storage.local.set({[STORE]:rows.slice(-70)});
  }).catch(()=>{});
  chrome.storage.local.get("product").then(({product})=>{
    if(!product || typeof product.t!=="number" || Date.now()-product.t>120000) return;
    let hostMatch=false;
    try {
      const d=new URL(product.d);
      hostMatch=location.hostname===d.hostname ||
        location.hostname.endsWith("."+d.hostname);
    }catch {}
    const frame=window===window.top?"principal":"secundario";
    const secretPresent=typeof product.e==="string"&&product.e.trim().length>0&&
      typeof product.k==="string"&&product.k.length>0;
    write("script-formulario-activo",{
      marco:frame,dominioCoincide:hostMatch,
      correoDisponible:!!product.e,claveDisponible:!!product.k,
      credencialesCompletas:secretPresent
    });
    let previous="";
    let polls=0;
    const scan=()=>{
      if(++polls>30){clearInterval(timer);return;}
      const all=[...document.querySelectorAll("input")];
      const passwords=all.filter(n=>n.type==="password");
      const usernames=all.filter(n=>{
        const kind=(n.type||"").toLowerCase();
        const label=[n.name,n.id,n.autocomplete,n.placeholder].join(" ");
        return kind==="email"||kind==="text"&&/email|correo|login|usuario|user|account|identifier/i.test(label);
      });
      const summary={
        marco:frame,
        camposCorreo:usernames.length,
        camposClave:passwords.length,
        correoConContenido:usernames.some(n=>!!n.value),
        claveConContenido:passwords.some(n=>!!n.value)
      };
      const fingerprint=JSON.stringify(summary);
      if(fingerprint!==previous){previous=fingerprint;write("formulario-observado",summary);}
      if(summary.correoConContenido && summary.claveConContenido)clearInterval(timer);
    };
    const timer=setInterval(scan,1000);
    scan();
  }).catch(()=>{});
})();