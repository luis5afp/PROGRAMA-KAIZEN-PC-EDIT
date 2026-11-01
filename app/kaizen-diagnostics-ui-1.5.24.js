"use strict";
// UI for KAIZEN's privacy-safe, live, cross-feature diagnostics.
module.exports=function installKaizenDiagnostics(ipcRenderer){
  let openPanel=null,loading=false;
  function el(tag,parent,text,style){
    const n=document.createElement(tag);
    if(typeof text==="string")n.textContent=text;
    if(style)n.style.cssText=style;
    if(parent)parent.appendChild(n);
    return n;
  }
  const style={
    btn:"background:#1a2540;border:1px solid #5c7295;color:#f1f5f9;padding:11px 14px;border-radius:10px;cursor:pointer;font:600 13px system-ui;",
    small:"font:13px/1.6 system-ui;color:#bec9da;",
    row:"display:flex;justify-content:space-between;align-items:center;gap:15px;padding:12px;border-bottom:1px solid #344255;flex-wrap:wrap;",
    table:"border:1px solid #344255;border-radius:12px;overflow:hidden;margin-top:14px;"
  };
  async function refresh(content,remote){
    if(loading)return;
    loading=true;
    content.replaceChildren();
    el("p",content,"Consultando el estado real de KAIZEN…",style.small);
    try{
      const summary=await ipcRenderer.invoke("kaizen-1524-overview");
      if(!content.isConnected)return;
      content.replaceChildren();
      if(summary?.error)throw Error("not authorized");
      el("h3",content,"Perfiles Chromium locales ("+summary.prepared+"/3 preparados)",
        "font:700 17px system-ui;margin:20px 0 9px;");
      const table=el("div",content,"",style.table);
      for(const p of summary.profiles||[]){
        const row=el("div",table,"",style.row);
        el("strong",row,p.title+" · "+p.extension,"font:600 14px system-ui;");
        el("span",row,p.status,"font:13px system-ui;color:"+
          (p.available&&p.prepared?"#86efac":"#fca5a5")+";");
      }
      const browser=el("div",content,"",
        "Chromium incluido: "+(summary.chromiumReady?"Disponible":"No detectado"),
        style.small+"margin-top:14px;");
      const security=el("div",content,"",style.table);
      el("h3",content,"Extensiones de seguridad","font:700 17px system-ui;margin:23px 0 9px;");
      for(const x of summary.security||[]){
        const row=el("div",security,"",style.row);
        el("strong",row,x.name+" · "+(x.installed?"incluida":x.present?"incompleta":"no incluida"),
          "font:600 14px system-ui;");
        el("span",row,x.active?"Activa":x.note,style.small);
      }
      el("p",content,
        "Privacidad: ex1 puede registrar y enviar URLs del historial. ex2 puede bloquear navegación y herramientas de inspección. Ninguna se activa automáticamente en esta compilación. El diagnóstico no recopila contraseñas, tokens ni páginas visitadas.",
        style.small+"margin:14px 0;color:#fcd34d;");
      el("h3",content,"Eventos de funciones reales","font:700 17px system-ui;margin:20px 0 9px;");
      const events=el("div",content,"",style.table);
      const recent=summary.events||[];
      if(!recent.length)el("p",events,"Sin eventos recientes: abre un perfil para comprobar su inicio.",style.small+"padding:14px;");
      for(const e of recent.slice(-15).reverse()){
        const row=el("div",events,"",style.row);
        el("span",row,e.area+" · "+e.status,"font:600 13px system-ui;");
        el("span",row,e.description||"","font:12px system-ui;color:#b5c6d9;");
      }
      el("h3",content,"APIs del programa (consulta bajo demanda)",
        "font:700 17px system-ui;margin:23px 0 8px;");
      el("p",content,
        "Cuatro catálogos y la sesión principal se comprueban con la sesión KAIZEN; una respuesta 403 significa que el servidor denegó acceso. Esta prueba no cambia permisos ni renueva tokens.",
        style.small);
      const action=el("button",content,"Comprobar sesión y catálogos",style.btn+"margin:10px 0;");
      const out=el("div",content,"",style.table);
      action.addEventListener("click",()=>refresh(content,true));
      if(remote){
        const token=String(localStorage.getItem("token")||"");
        const checked=await ipcRenderer.invoke("kaizen-1524-remote-checks",token);
        if(!out.isConnected)return;
        if(!checked?.ok)el("p",out,String(checked?.message||"No autorizado"),
          style.small+"padding:15px;");
        for(const c of checked?.checks||[]){
          const row=el("div",out,"",style.row);
          el("strong",row,c.id.replace(/_/g," "),"font:600 13px system-ui;");
          el("span",row,c.http?"HTTP "+c.http:"Sin respuesta"+
            (Number.isInteger(c.count)?" · "+c.count+" elemento(s)":""),
            "font:13px system-ui;color:"+(c.http===200?"#86efac":"#fca5a5"));
        }
      }
    }catch{
      if(content.isConnected)content.textContent=
        "No se pudo consultar el diagnóstico local en este momento.";
    }finally{loading=false;}
  }
  function open(){
    if(openPanel)openPanel.remove();
    openPanel=el("div",document.body,"",
      "position:fixed;inset:0;z-index:2147483200;background:rgba(2,7,17,.97);color:#f8fafc;overflow-y:auto;padding:22px;box-sizing:border-box;font-family:system-ui;");
    const shell=el("section",openPanel,"",
      "max-width:950px;margin:auto;background:#101a2a;padding:24px;border-radius:17px;border:1px solid #41526e;");
    const header=el("div",shell,"","display:flex;justify-content:space-between;align-items:center;gap:15px;");
    el("h2",header,"KAIZEN PC 1.5.24 · Diagnóstico integral","font:700 20px system-ui;margin:0;");
    const close=el("button",header,"Cerrar",style.btn);
    close.addEventListener("click",()=>{openPanel?.remove();openPanel=null;});
    const content=el("div",shell,"","");
    refresh(content,false);
  }
  function mount(){
    if(document.getElementById("kaizen-1524-diagnostics-button"))return;
    const b=el("button",document.body,"🩺 Diagnóstico integral",
      style.btn+"position:fixed;right:24px;bottom:23px;z-index:2147482900;");
    b.id="kaizen-1524-diagnostics-button";
    b.addEventListener("click",open);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();
};
