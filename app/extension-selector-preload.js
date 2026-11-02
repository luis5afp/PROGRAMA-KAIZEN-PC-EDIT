"use strict";
// Windows UI selector equivalent to the APK's Principal / Streaming screen.
// Uses the authenticated KAIZEN session; doesn't modify the original Chrome
// catalogue or silently open external sites, import cookies, or bypass proxies.
const { sameAccountJwt } = require("./extension-session-identity");
module.exports = function installAndroidExtensionSelector(ipcRenderer) {
  let button, panel, startedForToken=null, busy=false;
  const css={
    btn:"border:1px solid #5b3d91;background:#19112e;color:#f3e8ff;border-radius:12px;padding:12px;font-weight:700;cursor:pointer;",
    card:"display:flex;flex-direction:column;gap:8px;align-items:flex-start;text-align:left;padding:19px;background:#111827;border:1px solid #4f3b77;color:#f1f5f9;border-radius:16px;cursor:pointer;",
    sub:"font-size:13px;color:#a6acc5;line-height:1.6;",
    small:"font-size:12px;color:#b8c2d6;"
  };
  function element(type, parent, text, style) {
    const node=document.createElement(type);
    if (text!==undefined && text!==null) node.textContent=String(text);
    if (style) node.style.cssText=style;
    if (parent) parent.appendChild(node);
    return node;
  }
  function loginState() {
    const hash=String(window.location.hash||"");
    const token=String(window.localStorage.getItem("token")||"");
    return {
      token,
      ok:!!token && !hash.toLowerCase().includes("/login")
    };
  }
  function close() {
    if(panel) panel.remove();
    panel=null;
  }
  function open() {
    if(!loginState().ok) return;
    close();
    panel=element("div",document.body,"",
      "position:fixed;inset:0;background:rgba(3,5,16,.96);z-index:2147483100;overflow:auto;padding:32px 16px;color:#f8fafc;font-family:system-ui,Arial,sans-serif;box-sizing:border-box;");
    const shell=element("div",panel,"",
      "max-width:940px;margin:25px auto;border-radius:20px;background:linear-gradient(155deg,#10172a,#130b25);border:1px solid #493469;padding:24px;box-sizing:border-box;box-shadow:0 16px 60px #0007;");
    const header=element("div",shell,"","display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;");
    const title=element("div",header,"","display:flex;flex-direction:column;gap:5px;");
    element("strong",title,"KAIZEN · Elige tu extensión","font-size:21px;");
    element("span",title,"Tu sesión puede solicitar ambas variantes; el servidor decide el acceso.",css.sub);
    const exit=element("button",header,"✕ Cerrar",css.btn);
    exit.addEventListener("click",close);
    const content=element("div",shell,"","margin-top:20px;");
    renderChooser(content);
  }
  function renderChooser(content) {
    content.replaceChildren();
    element("p",content,"Selecciona un catálogo para abrirlo directamente, como en la APK Android.",
      css.sub+"margin-bottom:20px;");
    const grid=element("div",content,"","display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;");
    for(const variant of [
      {id:"main",title:"Principal",description:"Todas las herramientas de trabajo",icon:"🦁"},
      {id:"custom",title:"Streaming",description:"Plataformas de streaming",icon:"▶️"}
    ]) {
      const card=element("button",grid,"",css.card);
      element("span",card,variant.icon,"font-size:34px;");
      element("strong",card,variant.title,"font-size:20px;");
      element("span",card,variant.description,css.sub);
      card.addEventListener("click",()=>showCatalog(content,variant,1,""));
    }
    element("p",content,
      "Este selector utiliza los catálogos de productos Android. Los perfiles Chrome de Windows siguen gestionándose por separado.",
      css.small+"margin-top:20px;");
  }
  async function showCatalog(content,variant,page,search) {
    if(busy)return;
    busy=true;
    content.replaceChildren();
    const bar=element("div",content,"","display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px;");
    element("strong",bar,variant.title+" · Catálogo","font-size:20px;");
    const back=element("button",bar,"← Cambiar extensión",css.btn);
    back.addEventListener("click",()=>{busy=false;renderChooser(content);});
    const searchRow=element("div",content,"","display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 16px;");
    const inp=element("input",searchRow,undefined,
      "flex:1;min-width:180px;background:#0c1020;color:#fff;border:1px solid #54437b;padding:12px;border-radius:10px;");
    inp.type="search";
    inp.placeholder="Buscar producto…";
    inp.value=search;
    const searchBtn=element("button",searchRow,"Buscar",css.btn);
    searchBtn.addEventListener("click",()=>{busy=false;showCatalog(content,variant,1,inp.value);});
    inp.addEventListener("keydown",e=>{if(e.key==="Enter"){busy=false;showCatalog(content,variant,1,inp.value);}});
    const status=element("p",content,"Consultando al servidor con la sesión actual…",css.small+"margin:13px 0;");
    const grid=element("div",content,"","display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:13px;");
    try {
      const token=loginState().token;
      if(!token) throw Error("Sesión no disponible");
      let data=await ipcRenderer.invoke("kaizen-android-extension-catalog",
        {token,variant:variant.id,page,search});
      let renewMessage="";
      // Only 401 means expired/invalid authentication. Never attempt re-login
      // because of HTTP 400/403 or an unassigned role.
      if(data?.sessionExpired && loginState().token===token){
        status.textContent="Sesión vencida. Intentando renovar la misma cuenta…";
        try {
          // Uses KAIZEN's existing encrypted remembered credentials in the
          // Electron main process, not passwords handled by this UI.
          const renewed=await ipcRenderer.invoke("session-refresh",{});
          if(renewed?.ok && typeof renewed.token==="string" &&
             sameAccountJwt(token,renewed.token) &&
             loginState().token===token){
            window.localStorage.setItem("token",renewed.token);
            startedForToken=renewed.token;
            renewMessage=" · sesión principal renovada";
            data=await ipcRenderer.invoke("kaizen-android-extension-catalog",
              {token:renewed.token,variant:variant.id,page,search});
          } else if(renewed?.requires2fa || renewed?.requires2faSetup ||
                    renewed?.reason==="2fa-required"){
            renewMessage=" · el servidor exige 2FA; vuelve a iniciar sesión en KAIZEN";
          } else if(renewed?.ok && renewed.token){
            renewMessage=" · identidad no confirmada: inicia sesión de nuevo (no se reemplazó la cuenta)";
          } else if(renewed?.reason==="no-credentials"){
            renewMessage=" · sin credenciales guardadas: inicia sesión de nuevo";
          } else {
            renewMessage=" · renovación rechazada: vuelve a iniciar sesión";
          }
        } catch (_){
          renewMessage=" · no se pudo renovar: vuelve a iniciar sesión";
        }
      }
      if (!grid.isConnected) return;
      const switchStatus=Number(data?.switchStatus)||0;
      const catalogStatus=Number(data?.catalogStatus)||0;
      status.textContent="Extensión "+variant.title+
        " · sesión: "+String(data?.sessionClient||"sin indicar")+
        " · cliente solicitado: "+String(data?.requestedClient||"sin indicar")+
        " · cambio: "+(data?.switchMode==="sesión existente"?"no requerido":switchStatus?"HTTP "+switchStatus:"sin respuesta")+
        " · catálogo: "+(catalogStatus?"HTTP "+catalogStatus:"sin respuesta")+
        (Number.isInteger(data?.catalogCount)?" · "+data.catalogCount+" producto(s) en página "+page:"")+
        (data?.variantRenewed?" · token de extensión renovado":"")+
        (data?.error?" · "+String(data.error).slice(0,180):"")+
        renewMessage;
      if(!Array.isArray(data?.items) || !data.items.length){
        element("p",grid,
          data?.error||"No hay productos visibles para esta selección.",css.sub);
        return;
      }
      for(const item of data.items){
        const card=element("article",grid,"",
          "background:#0d1222;border:1px solid #42335d;border-radius:14px;overflow:hidden;min-height:165px;");
        if(item.image){
          const img=element("img",card,undefined,
            "display:block;width:100%;aspect-ratio:4/3;object-fit:contain;background:#060913;");
          img.src=item.image;
          img.alt=String(item.title||"Producto");
          img.referrerPolicy="no-referrer";
        } else {
          element("div",card,"📦","height:115px;display:grid;place-items:center;font-size:35px;background:#080d1a;");
        }
        const details=element("div",card,"","padding:12px;display:flex;flex-direction:column;gap:7px;");
        element("strong",details,item.title||"Producto","font-size:14px;word-break:break-word;");
        if(item.premium) element("span",details,"SOLO PREMIUM","color:#facc15;font-size:11px;font-weight:700;");
        if(item.activeUsers) element("span",details,item.activeUsers+" activo(s)",css.small);
        if(item.note) element("span",details,item.note,
          "color:#fbbf7b;font-size:12px;line-height:1.4;");
      }
      if(data.hasMore){
        const next=element("button",content,"Ver más productos →",css.btn+"margin-top:20px;");
        next.addEventListener("click",()=>{busy=false;showCatalog(content,variant,page+1,search);});
      }
      element("p",content,
        "Catálogo de productos de Android. Esta prueba no inicia sesiones automáticas en servicios externos ni instala extensiones Chrome.",
        css.small+"margin-top:16px;");
    } catch {
      if(status.isConnected)status.textContent="No se pudo consultar el catálogo con la sesión actual.";
    } finally {busy=false;}
  }
  function mount() {
    if(document.getElementById("kaizen-android-extensions-button"))return;
    button=element("button",document.body,"🧩 Extensiones",
      css.btn+"position:fixed;left:24px;bottom:85px;z-index:2147483000;box-shadow:0 8px 22px #0008;");
    button.id="kaizen-android-extensions-button";
    button.addEventListener("click",open);
    function sync(){
      const {ok,token}=loginState();
      button.style.display=ok?"block":"none";
      if(!ok){close();startedForToken=null;return;}
      if(startedForToken!==token){
        startedForToken=token;
        setTimeout(()=>{if(loginState().ok)open();},650);
      }
    }
    window.addEventListener("hashchange",sync);
    sync();
    setInterval(sync,1800);
  }
  if(document.readyState==="loading")
    window.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();
};
