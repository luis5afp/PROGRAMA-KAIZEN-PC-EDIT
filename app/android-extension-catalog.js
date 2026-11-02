"use strict";
// Read-only Windows catalogue for the two Android variants: Principal / Streaming.
// The API, not the desktop client, decides which variant a member can access.
// The decoding key is the SHA-256 derivative of the content-format constant
// already distributed in the official Android bundle; it is NOT an auth token.
const crypto = require("node:crypto");
const APK_CONTENT_KEY = Buffer.from("70b72aa4c457ca40482fae3e094556fd4c1afee5a49962d9c0976f870a7d71fd", "hex");
// In the Android shell the bundle selects android/android_custom.
// In a Windows browser context the SAME bundle selects extension/extension_custom.
const VALID_VARIANTS = Object.freeze({ main: "extension", custom: "extension_custom" });
const ANDROID_VARIANTS = Object.freeze({ main: "android", custom: "android_custom" });
const ALLOWED_CLIENTS = new Set(["android","android_custom","extension","extension_custom"]);
function tokenClient(token) {
  if(typeof token!=="string") return "sin-indicar";
  try {
    const segment=token.split(".")[1];
    if(!segment || segment.length>12000) return "sin-indicar";
    const data=JSON.parse(Buffer.from(segment,"base64url").toString("utf8"));
    return ALLOWED_CLIENTS.has(data?.client) ? data.client : "sin-indicar";
  } catch { return "sin-indicar"; }
}
function status(err) { return Number(err?.response?.status || 0) || 0; }
function txt(x, max=160) { return typeof x==="string" ? x.slice(0,max) : ""; }
function decodeCatalog(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.length > 6_000_000) throw Error("Formato de catálogo no válido");
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  // Android implements AES-256-CTR, zero 16-byte counter, counter length 64.
  // All HTTP authorization is still performed by the server before this stage.
  const bytes=Buffer.from(value,"base64");
  if (!bytes.length) throw Error("Catálogo vacío");
  const decipher=crypto.createDecipheriv("aes-256-ctr",APK_CONTENT_KEY,Buffer.alloc(16));
  const decoded=Buffer.concat([decipher.update(bytes),decipher.final()]).toString("utf8");
  const parsed=JSON.parse(decoded);
  if (!Array.isArray(parsed)) throw Error("La respuesta no es una lista");
  return parsed;
}
function safeMedia(base, path) {
  if (typeof path !== "string" || path.length > 500 || !path.trim()) return "";
  try {
    const u=new URL(path.replace(/\\/g,"/"),base+"/");
    if (u.origin !== new URL(base).origin || u.protocol !== "https:") return "";
    return u.href;
  } catch { return ""; }
}
function visibleItem(item,base) {
  if (!item || typeof item!=="object" || Array.isArray(item)) return null;
  const title=txt(item.c||item.name||item.title||item.label||"",120);
  if (!title) return null;
  return {
    title, image:safeMedia(base,item.m),
    premium:!!(item.is_premium||item.isLock),
    activeUsers:Math.max(0,Math.min(99999,Number(item.activeUsersCount||item.active_users||0)||0)),
    note:txt(item.tool_note,180)
  };
}
async function loadVariantCatalog(http, base, currentToken, variant, page=1, search="") {
  const result={
    variant:variant==="custom"?"Streaming":"Principal",
    requestedClient:"", sessionClient:"sin-indicar", switchMode:"sin consulta",
    switchStatus:0, selectorStatus:0, selectorCount:null,
    sessionExpired:false, variantRenewed:false,
    catalogStatus:0, catalogCount:null, hasMore:false,
    items:[], error:""
  };
  if (!Object.prototype.hasOwnProperty.call(VALID_VARIANTS,variant)) {
    result.error="Extensión desconocida"; return result;
  }
  if (!http || typeof http.get!=="function" || typeof http.post!=="function" ||
      typeof base!=="string" || !base.startsWith("https://") ||
      typeof currentToken!=="string" || !currentToken || currentToken.length>8192 ||
      /[\r\n]/.test(currentToken)) {
    result.error="Sesión no disponible";return result;
  }
  const headers={Authorization:"Bearer "+currentToken};
  const currentClient=tokenClient(currentToken);
  const family=currentClient.startsWith("android") ? ANDROID_VARIANTS : VALID_VARIANTS;
  const target=family[variant];
  result.sessionClient=currentClient;
  result.requestedClient=target;
  let variantToken;
  if(currentClient===target){
    // No switch required. The server still validates the bearer for EVERY GET.
    variantToken=currentToken;
    result.switchMode="sesión existente";
  } else {
    result.switchMode="solicitado al servidor";
    try {
      const change=await http.post(base+"/api/users/switch-client",
        {client:target},
        {headers,timeout:12000});
      result.switchStatus=Number(change.status||200);
      variantToken=change?.data?.token;
      if(typeof variantToken!=="string"||!variantToken) {
        result.error="El servidor no entregó una sesión para esta extensión";
        return result;
      }
    } catch(e) {
      result.switchStatus=status(e);
      result.sessionExpired=result.switchStatus===401;
      result.error=result.switchStatus===400 ?
        "Solicitud de extensión rechazada (HTTP 400). Verifica el tipo de cliente indicado." :
        "El servidor rechazó el cambio de extensión";
      return result;
    }
  }

  // The chooser is optional on Android, even if the user has zero proxy profiles.
  const variantHeaders={Authorization:"Bearer "+variantToken};
  try {
    const response=await http.get(base+"/api/browser/variant-profiles",
      {headers:variantHeaders,timeout:8000});
    result.selectorStatus=Number(response.status||200);
    result.selectorCount=Array.isArray(response?.data?.profiles)?response.data.profiles.length:null;
  } catch(e) { result.selectorStatus=status(e); }

  const productConfig=()=>({
    headers:{Authorization:"Bearer "+variantToken},
    params:{subtitle_id:"null",searchQuery:txt(search,100)||"null",
      page:Math.max(1,Math.min(1000,Math.floor(Number(page)||1))),limit:20},
    timeout:20000
  });
  try {
    let response;
    try {
      response=await http.get(base+"/api/products/getmostusedtool",productConfig());
    } catch(lookupError) {
      if(status(lookupError)!==401 || variantToken===currentToken) throw lookupError;
      // The extension token can expire independently of the main account token.
      // Renew once using the same server-authorized account; no role substitution.
      try {
        const renewed=await http.post(base+"/api/users/switch-client",
          {client:target},{headers,timeout:12000});
        if(typeof renewed?.data?.token!=="string" || !renewed.data.token)
          throw Error("El servidor no emitió token de variante");
        variantToken=renewed.data.token;
        result.variantRenewed=true;
        response=await http.get(base+"/api/products/getmostusedtool",productConfig());
      } catch (renewError) {
        result.sessionExpired=status(renewError)===401;
        throw renewError;
      }
    }
    result.catalogStatus=Number(response.status||200);
    const items=decodeCatalog(response?.data?.products);
    result.catalogCount=items.length;
    result.hasMore=response?.data?.hasMore===true;
    result.items=items.slice(0,20).map(item=>visibleItem(item,base)).filter(Boolean);
  } catch(e) {
    result.catalogStatus=status(e);
    if(result.catalogStatus===401) result.sessionExpired=true;
    result.error=result.catalogStatus
      ? "No se pudo cargar el catálogo (HTTP "+result.catalogStatus+")"
      : "No se pudo procesar el catálogo de productos";
  }
  return result;
}
module.exports={loadVariantCatalog,decodeCatalog,VALID_VARIANTS,ANDROID_VARIANTS,tokenClient};
