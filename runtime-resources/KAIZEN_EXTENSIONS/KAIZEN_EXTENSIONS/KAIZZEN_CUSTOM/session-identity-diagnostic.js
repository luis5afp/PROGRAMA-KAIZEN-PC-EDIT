"use strict";
(() => {
  if (globalThis.__kzSessionIdentityDiagnostic) return;
  globalThis.__kzSessionIdentityDiagnostic = true;
  // Read-only test tool. Only the existing KAIZEN token is read, in memory.
  // Never export credentials, cookies, raw tokens or account identifiers.
  const SERVER = "https://www.kaizzen.org";
  const name = String(chrome.runtime.getManifest().name || "KAIZZEN").slice(0,40);
  const ROLES = new Set(["member","admin","appcbl_soft","specific","all_profile","manager"]);

  function jwtClaims(token) {
    try {
      const part = String(token).split(".")[1];
      if (!part || part.length > 8000) return null;
      const normalized = part.replace(/-/g,"+").replace(/_/g,"/");
      const obj = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4,"=")));
      return obj && typeof obj === "object" ? obj : null;
    } catch { return null; }
  }
  function identityOf(user) {
    if (!user || typeof user !== "object") return null;
    for (const field of ["id","_id","user_id","userId","uid","sub"]) {
      const value = user[field];
      if ((typeof value === "string" || typeof value === "number") &&
          String(value).trim() && String(value).length < 160)
        return "id:" + String(value).trim();
    }
    for (const field of ["email","user_email"]) {
      if (typeof user[field] === "string" && user[field].trim().length < 200)
        return "email:" + user[field].trim().toLowerCase();
    }
    return null;
  }
  async function hmac(phrase,identity) {
    if (!identity || phrase.length < 12) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",enc.encode(phrase),{name:"HMAC",hash:"SHA-256"},false,["sign"]
    );
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(identity)));
    return Array.from(bytes.slice(0,12),b=>b.toString(16).padStart(2,"0")).join("");
  }
  function expiryOf(claims) {
    const exp = claims?.exp;
    if (!Number.isSafeInteger(exp) || exp < 946684800 || exp > 4102444800) return null;
    return new Date(exp * 1000).toISOString();
  }
  async function inspect(phrase) {
    const report = {
      version:1,profile:name,checkedAt:new Date().toISOString(),
      tokenPresent:false,verification:"sin-token",http:null,
      role:null,identitySource:null,accountFingerprint:null,
      expiresAt:null,expiredByClock:null
    };
    let token = "";
    try {
      const stored = await chrome.storage.local.get("token");
      token = typeof stored?.token === "string" ? stored.token : "";
    } catch { report.verification = "almacenamiento-no-disponible"; return report; }
    report.tokenPresent = !!token;
    if (!token) return report;
    const claims = jwtClaims(token);
    report.expiresAt = expiryOf(claims);
    if (report.expiresAt) report.expiredByClock = Date.now() >= Date.parse(report.expiresAt);
    let identity = null;
    try {
      // The same read-only endpoint used by KAIZEN itself; no authentication changes.
      const response = await fetch(SERVER + "/api/verify-token", {
        method:"GET",headers:{Authorization:"Bearer " + token},
        credentials:"omit",cache:"no-store",redirect:"error"
      });
      report.http = response.status;
      if (response.ok) {
        const body = await response.json();
        const user = body && typeof body === "object" ? body.user : null;
        identity = identityOf(user);
        report.verification = identity ? "servidor-verificado" : "sin-identidad-verificable";
        report.identitySource = identity ? "servidor" : null;
        if (user && ROLES.has(user.role)) report.role = user.role;
      } else {
        report.verification = response.status === 401 || response.status === 403 ?
          "rechazado-por-servidor" : "error-http";
      }
    } catch { report.verification = "sin-respuesta-del-servidor"; }
    // Claims are never a substitute for a server-verified identity.
    if (!identity && claims) {
      identity = identityOf(claims);
      if (identity) report.identitySource = "jwt-sin-verificar";
    }
    try { report.accountFingerprint = await hmac(phrase,identity); }
    catch { report.accountFingerprint = null; }
    token = "";
    return report;
  }

  function install() {
    if (!document.body) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Diagnóstico de sesión";
    Object.assign(toggle.style,{
      position:"fixed",right:"12px",bottom:"12px",zIndex:"2147483646",
      padding:"9px 12px",borderRadius:"8px",border:"1px solid #64748b",
      background:"#172033",color:"#fff",font:"12px system-ui",cursor:"pointer"
    });
    const panel = document.createElement("section");
    panel.setAttribute("aria-label","Diagnóstico de sesión KAIZEN");
    Object.assign(panel.style,{
      display:"none",position:"fixed",right:"12px",bottom:"52px",
      zIndex:"2147483647",width:"min(360px,calc(100vw - 24px))",
      padding:"14px",borderRadius:"10px",background:"#101827",
      color:"#fff",font:"13px system-ui",boxShadow:"0 4px 24px #000a"
    });
    const heading = document.createElement("strong");
    heading.textContent = name + " · sesión";
    const help = document.createElement("p");
    help.textContent = "Usa la misma frase privada (mínimo 12 caracteres) en MAIN, GOOGLE y CUSTOM para comparar huellas. No se guarda ni se envía esa frase.";
    const phrase = document.createElement("input");
    phrase.type = "password";
    phrase.placeholder = "Frase privada de comparación";
    phrase.autocomplete = "off";
    phrase.style.cssText = "width:100%;box-sizing:border-box;padding:8px;margin-bottom:8px";
    const check = document.createElement("button");
    check.textContent = "Comprobar sesión";
    const download = document.createElement("button");
    download.textContent = "Descargar informe seguro";
    download.disabled = true;
    download.style.marginLeft = "8px";
    const result = document.createElement("pre");
    result.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:12px monospace";
    let snapshot = null;
    check.onclick = async () => {
      if (phrase.value.length < 12) {
        result.textContent = "Introduce una frase privada de al menos 12 caracteres.";
        return;
      }
      check.disabled = true;
      result.textContent = "Consultando únicamente /api/verify-token...";
      const secret = phrase.value;
      phrase.value = "";
      try {
        snapshot = await inspect(secret);
        result.textContent = JSON.stringify(snapshot,null,2);
        download.disabled = false;
      } catch {
        snapshot = null;
        result.textContent = "No se pudo completar la comprobación local.";
      } finally { check.disabled = false; }
    };
    download.onclick = () => {
      if (!snapshot) return;
      const blob = new Blob([JSON.stringify(snapshot,null,2)],{type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kaizen-sesion-" + name.toLowerCase().replace(/[^a-z0-9_-]+/g,"-") + ".json";
      a.click();
      URL.revokeObjectURL(url);
    };
    toggle.onclick = () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };
    panel.append(heading,help,phrase,check,download,result);
    document.body.append(toggle,panel);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
