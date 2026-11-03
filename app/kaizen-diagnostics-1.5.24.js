"use strict";
// KAIZEN 1.5.24 diagnostics: read-only, privacy-limited, no traffic recorder.
// Covers offline profiles, Chromium readiness, extension packages,
// authentication token validity, remote profile/group catalogue and APK catalog.
const fs=require("node:fs");
const path=require("node:path");
const {app,ipcMain}=require("electron");
const crypto=require("node:crypto");
const {EXPECTED:LEGACY_SHA256}=require("./scripts/verify-legacy-core-resources");
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
  const base=securityRoot();
  const activeProfiles=typeof local.activeSecurityProfiles==="function"?
    local.activeSecurityProfiles():[];
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
      // El EX1 original carga en Chromium sin inject.js: su declaración
      // residual no es prueba de que el paquete no pueda ejecutarse.
      // No se alteran los seis archivos protegidos por hashes SHA-256.
      const optionalMissing=[];
      for(const x of m.web_accessible_resources||[]){
        for(const entry of x.resources||[]){
          if(item.name==="ex1"&&entry==="inject.js"&&
             !fs.existsSync(path.join(folder,"inject.js")))
            optionalMissing.push("inject.js (referencia no utilizada en la prueba)");
          else refs.push(entry);
        }
      }
      const complete=m.manifest_version===3&&m.name===item.name&&
        m.version===item.version&&refs.every(file=>{
          if(typeof file!=="string"||!file||path.isAbsolute(file)||
             file.split(/[\\/]/).some(x=>!x||x==="."||x==="..")||/[*?]/.test(file))return false;
          const p=path.resolve(folder,file);
          return p.startsWith(folder+path.sep)&&fs.existsSync(p)&&fs.statSync(p).isFile();
        });
      return {name:item.name,installed:complete,present:true,
        active:activeProfiles.length>0,activeProfiles:activeProfiles.slice(),
        version:m.version,warning:complete&&optionalMissing.length>0,
        note:complete?
          "Archivos principales listos. "+
          (optionalMissing.length?"Aviso: inject.js figura en el manifiesto pero no se distribuye. ":"")+
          (activeProfiles.length?"Cargada en perfiles Chromium: "+activeProfiles.join(", ")+". ":
            "Obligatoria al abrir los perfiles desde el selector; el cliente legado podría cargarla por separado. ")+
          item.note:
          "Archivos necesarios ausentes o versión no reconocida."};
    }catch{
      return {name:item.name,installed:false,present:true,active:false,
        note:"Paquete presente pero inválido"};
    }
  });
}
function securityRoot(){
  return app.isPackaged?
    (process.resourcesPath||path.join(path.dirname(process.execPath),"resources"))+"/extensionForSecurity":
    path.resolve(__dirname,"..","runtime-resources","extensionForSecurity");
}
function integrityStatus(){
  const root=securityRoot(),bad=[];
  let matched=0;
  for(const [relative,sha] of Object.entries(LEGACY_SHA256)){
    try{
      const file=path.join(root,...relative.split("/"));
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw Error("missing");
      const digest=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      if(digest!==sha)throw Error("mismatch");
      matched++;
    }catch{bad.push(relative);}
  }
  return {ok:bad.length===0,verified:matched,total:Object.keys(LEGACY_SHA256).length,
    failedFiles:bad,note:bad.length?"Hay archivos originales ausentes o modificados; reinstalar el paquete completo.":"Los 6 SHA-256 originales coinciden."};
}
function featureState(){
  const handlers=[
    ["perfiles_locales","Principal · Google · Streaming / Custom","kaizen-original-extensions-list"],
    ["apertura_chromium","Botones Abrir Chromium","kaizen-original-extension-open"],
    ["importador_opcional","Importación de respaldo","kaizen-original-extensions-import"],
    ["catalogo_apk","Pestaña catálogo APK","kaizen-apk-catalog-probe"],
    ["variantes_android","Pestañas de variantes Android","kaizen-android-extension-catalog"],
    ["diagnostico","Diagnóstico y eventos","kaizen-1524-window-overview"]
  ];
  return handlers.map(([id,title,channel])=>({id,title,
    connected:typeof ipcMain?.hasHandler==="function"?ipcMain.hasHandler(channel):null,
    note:"Conexión local de la interfaz; no certifica permisos del servidor."}));
}
async function overview(){
  const warm=await local.warmupOriginalProfiles();
  const originalStates=local.listOriginalExtensions();
  const profiles=originalStates.map(x=>({
    id:x.id,title:x.title,extension:x.name,version:x.version,
    available:!!x.available,prepared:!!x.prepared,
    status:x.available?(x.prepared?"Preparado localmente":"Disponible"):String(x.reason||"Falta paquete").slice(0,90)
  }));
  const summary={
    version:"1.5.33",
    profiles,prepared:profiles.filter(x=>x.prepared).length,
    chromiumReady:warm.reason!=="Falta Chromium incluido"&&
      !originalStates.some(x=>x.reason==="Falta Chromium compatible incluido"),
    security:extensionSecurityState(),
    integrity:integrityStatus(),
    features:featureState(),
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
  // Solo metadatos de la operación; jamás registrar token, cuerpo ni encabezados.
  record("http_envio","info","ENVÍO GET "+pathName);
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
    record("http_recibido","ok","RECIBIDO HTTP "+result.http+" GET "+pathName+
      (Number.isInteger(count)?" · "+count+" elemento(s)":""));
    if(pathName==="/api/verify-token"){
      const role=data.user?.role;
      result.role=["member","admin","appcbl_soft","specific","all_profile","manager"].includes(role)?role:"otro";
    }
    return result;
  }catch(error){
    const status=safeStatus(error);
    record("http_error",status?"warning":"error",status?
      "RECIBIDO HTTP "+status+" GET "+pathName:
      "ERROR de red GET "+pathName);
    return {http:status,count:null,error:status?"Servidor rechazó consulta":"Sin respuesta de red"};
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
module.exports={record,overview,remoteChecks,integrityStatus,featureState};
