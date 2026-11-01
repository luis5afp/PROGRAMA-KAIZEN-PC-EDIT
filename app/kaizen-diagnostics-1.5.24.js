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
  const base=path.join(app.isPackaged?path.dirname(process.execPath):__dirname,"KAIZEN_EXTENSIONS");
  return ["KAIZZEN_SECURITY_EX1","KAIZZEN_SECURITY_EX2"].map((name,i)=>{
    try{
      const m=JSON.parse(fs.readFileSync(path.join(base,name,"manifest.json"),"utf8"));
      return {name:"ex"+(i+1),installed:!!m,
        version:typeof m.version==="string"?m.version.slice(0,20):"",
        active:false,
        note:"Disponible, pero no activada automáticamente; puede vigilar la navegación"};
    }catch{return {name:"ex"+(i+1),installed:false,active:false,note:"No instalada"};}
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
