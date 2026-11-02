"use strict";
const $=id=>document.getElementById(id);
function node(tag,txt,parent,className=""){
  const n=document.createElement(tag);
  n.textContent=String(txt??"");if(className)n.className=className;
  parent.appendChild(n);return n;
}
function clear(id){$(id).replaceChildren();return $(id);}
function item(parent,a,b,kind=""){
  const r=node("div","",parent,"item");
  node("strong",a,r);
  node("span",b,r,"value "+kind);
}
async function load(){
  $("refresh").disabled=true;
  try{
    const data=await window.kaizenDiagnostics.overview();
    if(data?.error)throw Error("diagnóstico no disponible");
    const profile=clear("profiles");
    for(const p of data.profiles||[])
      item(profile,p.title+" · "+p.extension,p.status,p.available?"good":"warn");
    const security=clear("security");
    for(const x of data.security||[])
      item(security,x.name+" · "+(x.installed?(x.warning?"incluida · aviso":"incluida"):x.present?"incompleta":"no incluida"),
        x.active?"Activa":x.note,x.active?"good":"warn");
    const events=clear("events");
    const latest=(data.events||[]).slice(-20).reverse();
    if(!latest.length)item(events,"Eventos","Abre un perfil para generar eventos de lanzamiento");
    for(const ev of latest)item(events,ev.area+" · "+ev.status,ev.description,
       ev.status==="ok"?"good":ev.status==="error"?"warn":"");
  }catch{
    clear("profiles");item($("profiles"),"Diagnóstico","No se pudo consultar");
  }finally{$("refresh").disabled=false;}
}
async function probe(){
  $("probe").disabled=true;
  $("probeStatus").textContent="Consultando el servidor con la sesión actual…";
  clear("remote");
  try{
    const result=await window.kaizenDiagnostics.probe();
    if(!result?.ok){
      $("probeStatus").textContent=result?.message||"No se pudo consultar.";
      return;
    }
    $("probeStatus").textContent="Comprobaciones completadas; HTTP 403 indica acceso denegado por el servidor.";
    for(const c of result.checks||[])
      item($("remote"),c.id.replaceAll("_"," "),
        (c.http?"HTTP "+c.http:"Sin respuesta de red")+
        (Number.isInteger(c.count)?" · "+c.count+" elemento(s)":"")+
        (c.role?" · rol "+c.role:""),c.http===200?"good":"warn");
  }catch{
    $("probeStatus").textContent="El servidor no respondió.";
  }finally{$("probe").disabled=false;load();}
}
$("refresh").addEventListener("click",load);
$("probe").addEventListener("click",probe);
load();
