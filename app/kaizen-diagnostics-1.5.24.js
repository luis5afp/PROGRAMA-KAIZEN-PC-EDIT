"use strict";
// KAIZEN 1.5.24 diagnostics: read-only, privacy-limited, no traffic recorder.
// Covers offline profiles, Chromium readiness, extension packages,
// authentication token validity, remote profile/group catalogue and APK catalog.
const fs=require("node:fs");
const path=require("node:path");
const {app}=require("electron");
const signedHttp=require("./axiosConfig");
const {BACKEND_URL}=require("./config");
const local=require("./kaizen-original-extensions-host");

const history=[];
function record(area,status,description=""){
  const allowedArea=/^[a-z0-9_-]{1,35}$/i.test(String(area))?area:"app";
  const allowedStatus=["ok","error","warning","pending","info"].includes(status)?status:"info";
  const entry={at:new Date().toISOString(),area:allowedArea,status:allowedStatus,
    description:String(description).slice(0,140)};
  history.push(entry);
  if(history.length>80)history.shift();
  return entry;
}
function safeStatus(error){return Number(error?.response?.status)||0;}
function extensionSecurityState(){
  // El instalador deja ex1/ex2 en resources/extensionForSecurity, NO en
  // KAIZEN_EXTENSIONS. Solo lectura: nunca se cargan ni se ejecutan aquí.
  const base=app.isPackaged?
    path.join(path.dirname(process.execPath),"resources","extensionForSecurity"):
    path.resolve(__dirname,"..","runtime-resources","extensionForSecurity");
  return [
    {name:"ex1",version:"1.2",note:"Puede recopilar y enviar URLs del historial."},
    {name:"ex2",version:"1.1",note:"Puede restringir navegación y herramientas de inspección."}
  ].map(item=>{
    const folder=path.join(base,item.name);
    const file=path.join(folder,"manifest.json");
    if(!fs.existsSync(file))return {name:item.name,installed:false,active:false,note:"No incluida"};
    try{
      const m=JSON.parse(fs.readFileSync(file,"utf8"));
      const refs=[m.background?.service_worker];
      for(const x of m.content_scripts||[])refs.push(...(x.js||[]),...(x.css||[]));
      for(const x of m.web_accessible_resources||[])refs.push(...(x.resources||[]));
      const complete=m.manifest_version===3&&m.name===item.name&&
        m.version===item.version&&refs.every(file=>{
          if(typeof file!=="string"||!file||path.isAbsolute(file)||
             file.split(/[\\/]/).some(x=>!x||x==="."||x==="..")||/[*?]/.test(file))return false;
          const p=path.resolve(folder,file);
          return p.startsWith(folder+path.sep)&&fs.existsSync(p)&&fs.statSync(p).isFile();
        });
      return {name:item.name,installed:complete,present:true,active:false,
        version:m.version, note:complete?
          "Incluida pero desactivada. "+item.note:
          "Archivos presentes, pero el paquete está incompleto o no coincide con la versión esperada."};
    }catch{
      return {name:item.name,installed:false,present:true,active:false,
        note:"Paquete presente pero inválido"};
    }
  });
}
async function overview(){
  await local.warmupOriginalProfiles();
  const profiles=local.listOriginalExtensions().map(x=>({
    id:x.id,title:x.title,extension:x.name,version:x.version,
    available:!!x.available,prepared:!!x.prepared,
    status:x.available?(x.prepared?"Preparado localmente":"Disponible"):String(x.reason||"Falta paquete").slice(0,90)
  }));
  const summary={
    version:"1.5.24",
    profiles,prepared:profiles.filter(x=>x.prepared).length,
    chromiumReady:!profiles.some(x=>x.reason==="Falta Chromium compatible incluido"),
    security:extensionSecurityState(),
    notes:{
      local:"Los perfiles locales no requieren catálogo remoto.",
      auth:"Cada extensión autentica su sesión directamente con el servidor. No se copian tokens.",
      diagnostics:"Solo estados y cantidades, sin contraseñas ni datos de navegación."
    },
    events:history.slice(-35)
  };
  return summary;
}
async function endpoint(token,pathName){
  try{
    const response=await signedHttp.get(BACKEND_URL+pathName,{
      headers:{Authorization:"Bearer "+token},timeout:9000,
      maxContentLength:8*1024*1024,maxBodyLength:8*1024*1024
    });
    const data=response.data||{};
    let count=null;
    if(Array.isArray(data.profiles))count=data.profiles.length;
    else if(Array.isArray(data.groups))count=data.groups.length;
    else if(Array.isArray(data.group))count=data.group.length;
    else if(Array.isArray(data.products))count=data.products.length;
    const result={http:Number(response.status)||200,count};
    if(pathName==="/api/verify-token"){
      const role=data.user?.role;
      result.role=["member","admin","appcbl_soft","specific","all_profile","manager"].includes(role)?role:"otro";
    }
    return result;
  }catch(error){
    return {http:safeStatus(error),count:null,error:safeStatus(error)?"Servidor rechazó consulta":"Sin respuesta de red"};
  }
}
async function remoteChecks(token){
  if(typeof token!=="string"||!token||token.length>8192||/[\r\n]/.test(token)){
    return {ok:false,message:"Inicia sesión en KAIZEN para comprobar las APIs"};
  }
  const routes=[
    ["cuenta","/api/verify-token"],
    ["perfiles_chrome","/api/browser/get"],
    ["grupos","/api/browser/group/get"],
    ["variantes_android","/api/browser/variant-profiles"],
    ["catalogo_productos","/api/products/getmostusedtool"]
  ];
  const results=[];
  for(const [id,route] of routes){
    const answer=await endpoint(token,route);
    results.push({id,...answer});
    record(id,answer.http===200?"ok":"warning",
      "HTTP "+(answer.http||"sin respuesta")+
      (Number.isInteger(answer.count)?" · "+answer.count+" elemento(s)":""));
  }
  return {ok:true,checks:results};
}
module.exports={record,overview,remoteChecks};
