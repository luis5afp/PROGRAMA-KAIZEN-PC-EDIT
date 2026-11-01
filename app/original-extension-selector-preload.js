"use strict";
// Original Chrome extension selector shown after a valid local KAIZEN login.
// No credentials are copied into an extension. Each extension owns its login.
module.exports=function installOriginalExtensionSelector(ipcRenderer){
  let overlay=null,button=null,openedAtStartup=false,pending=false;
  const styles={
    button:"border:1px solid #65509a;background:#201333;color:#f4edff;border-radius:11px;padding:11px 15px;cursor:pointer;font-weight:700;font-family:system-ui;",
    text:"font:13px/1.6 system-ui;color:#c3c9dc;",
    card:"background:#111b2b;border:1px solid #594479;border-radius:16px;padding:18px;text-align:left;color:#f4edff;cursor:pointer;display:flex;flex-direction:column;gap:8px;min-height:150px;"
  };
  function el(tag,parent,text,style){
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=String(text);
    if(style)node.style.cssText=style;
    if(parent)parent.appendChild(node);
    return node;
  }
  // Local Chromium profiles never need a KAIZEN catalogue token. The original
  // extension will request its own valid login when the user opens it.
  function canOpenLocalProfiles(){ return true; }
  function close(){
    if(overlay)overlay.remove();
    overlay=null;
  }
  async function open(){
    if(!canOpenLocalProfiles() || pending)return;
    close();
    overlay=el("div",document.body,"",
      "position:fixed;inset:0;z-index:2147483000;overflow-y:auto;background:rgba(2,4,14,.96);padding:38px 18px;color:#f8fafc;font-family:system-ui;box-sizing:border-box;");
    const shell=el("section",overlay,"",
      "max-width:960px;margin:18px auto;background:linear-gradient(145deg,#0f172a,#160d27);border:1px solid #594679;border-radius:20px;padding:24px;box-shadow:0 20px 65px #0008;");
    const row=el("header",shell,"","display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;");
    const head=el("div",row,"","display:flex;flex-direction:column;gap:7px;");
    el("h2",head,"KAIZEN · Perfiles Chromium locales","font-size:23px;margin:0;");
    el("p",head,"Selecciona un perfil: KAIZEN abrirá Chromium con su extensión y su catálogo.",styles.text+"margin:0;");
    const exit=el("button",row,"✕ Cerrar",styles.button);
    exit.addEventListener("click",close);
    const info=el("p",shell,"Estos tres perfiles se preparan localmente al abrir KAIZEN, sin consultar el servidor. Al pulsar Abrir, Chromium inicia con la extensión original. Solo el catálogo y el inicio de sesión de la extensión podrían requerir internet o 2FA.",styles.text+"margin:20px 0;");
    const state=el("div",shell,"Buscando extensiones locales…",styles.text+"margin-bottom:13px;");
    const cards=el("div",shell,"","display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:15px;");
    pending=true;
    try {
      const extensions=await ipcRenderer.invoke("kaizen-original-extensions-list");
      if(!cards.isConnected)return;
      state.textContent=Array.isArray(extensions)&&extensions.some(x=>x.available)?
        "Perfiles Chromium preparados. Elige cuál quieres abrir.":
        "Aún no se han instalado los archivos de las extensiones.";
      for(const x of Array.isArray(extensions)?extensions:[]){
        const b=el("button",cards,"",styles.card);
        b.disabled=!x.available;
        b.style.opacity=x.available?"1":"0.6";
        b.style.cursor=x.available?"pointer":"not-allowed";
        el("strong",b,x.title,"font-size:20px;");
        el("div",b,x.name+" · v"+x.version,styles.text);
        el("small",b,x.available?(x.prepared?"✓ Preparado localmente":"✓ Disponible"):"⚠ "+x.reason,
          "font-size:12px;color:"+(x.available?"#86efac":"#fda4af"));
        el("span",b,"▶ Abrir perfil Chromium","font-size:13px;font-weight:750;color:#d8b4fe;margin-top:9px;");
        if(x.available)b.addEventListener("click",async ()=>{
          b.disabled=true;
          state.textContent="Abriendo "+x.name+" en su perfil Chromium…";
          try{
            const res=await ipcRenderer.invoke("kaizen-original-extension-open",x.id);
            if(!state.isConnected)return;
            state.textContent=res?.ok ?
              x.name+" abierta en Chromium. Introduce tus credenciales en la extensión original cuando se soliciten.":
              String(res?.message||"No se pudo iniciar esta extensión.");
          } catch {
            if(state.isConnected)state.textContent="La extensión no se pudo iniciar.";
          } finally {b.disabled=false;}
        });
      }
      const allAvailable=Array.isArray(extensions)&&extensions.length===3&&extensions.every(x=>x.available);
      el("p",shell,allAvailable?
        "Los tres paquetes se detectaron en esta instalación. Sus sesiones se conservan en carpetas Chromium independientes.":
        "Faltan archivos locales para activar uno o más perfiles. Coloca KAIZEN_EXTENSIONS_Originales.zip o la carpeta KAIZEN_EXTENSIONS, con los tres paquetes originales autorizados, junto al archivo .exe de KAIZEN y reinicia la aplicación. No se pueden abrir perfiles sin estos archivos.",styles.text+"margin-top:22px;");
      el("p",shell,"Estas extensiones pueden gestionar cookies y proxy dentro de sus propios perfiles Chromium aislados. El catálogo remoto sigue sujeto a los permisos del servidor.",styles.text+"margin-top:12px;");
    } catch {
      if(state.isConnected)state.textContent="No fue posible consultar los paquetes instalados.";
    } finally {pending=false;}
  }
  function mount(){
    if(document.getElementById("kaizen-original-extension-button"))return;
    button=el("button",document.body,"🧩 Perfiles Chromium",
      styles.button+"position:fixed;left:24px;bottom:85px;z-index:2147482900;box-shadow:0 8px 24px #0008;");
    button.id="kaizen-original-extension-button";
    button.addEventListener("click",open);
    function sync(){
      const ready=canOpenLocalProfiles();
      button.style.display=ready?"block":"none";
      if(!ready){
        openedAtStartup=false;close();return;
      }
      if(!openedAtStartup){
        openedAtStartup=true;
        setTimeout(()=>{if(canOpenLocalProfiles())open();},750);
      }
    }
    window.addEventListener("hashchange",sync);
    sync();
    setInterval(sync,1800);
  }
  if(document.readyState==="loading"){
    window.addEventListener("DOMContentLoaded",mount,{once:true});
  }else mount();
};
