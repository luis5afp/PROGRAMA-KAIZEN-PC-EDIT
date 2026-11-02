"use strict";
// Panel de ayuda para credenciales propias. No lee ni guarda contraseñas.
(()=>{
  function ready(){
    if(document.getElementById("kaizen-my-passwords"))return;
    const b=document.createElement("button");
    b.id="kaizen-my-passwords";
    b.type="button";
    b.textContent="🔑 Mis contraseñas";
    b.title="Configurar autocompletado de mis cuentas guardadas en Chromium";
    b.style.cssText="position:fixed;bottom:16px;right:16px;z-index:2147483000;border:1px solid #658fbe;border-radius:10px;padding:10px 14px;color:#f1f5ff;background:#203655;font:600 12px system-ui;cursor:pointer;box-shadow:0 6px 20px #0007";
    b.addEventListener("click",()=>chrome.runtime.openOptionsPage());
    document.body.appendChild(b);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready,{once:true});
  else ready();
})();
