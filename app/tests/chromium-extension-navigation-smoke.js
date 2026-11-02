"use strict";
/*
 * Windows Chrome for Testing headless smoke check.
 * Diagnostic only; does not execute login or inspect credentials.
 * Runs the original catalog extension alone and again with EX1 + EX2.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const chrome=process.argv[2];
const catalog=process.argv[3];
const ex1=process.argv[4];
const ex2=process.argv[5];
assert(chrome&&fs.existsSync(chrome),"Falta Chrome for Testing");
for(const dir of [catalog,ex1,ex2]){
  assert(dir&&fs.existsSync(path.join(dir,"manifest.json")),"Paquete sin manifest: "+String(dir));
}
function extensionId(folder){
  let win=path.win32.resolve(folder);
  if(/^[a-z]:/.test(win))win=win[0].toUpperCase()+win.slice(1);
  return crypto.createHash("sha256").update(Buffer.from(win,"utf16le"))
    .digest("hex").slice(0,32).replace(/[0-9a-f]/g,c=>
      String.fromCharCode(97+parseInt(c,16)));
}
const url="chrome-extension://"+extensionId(catalog)+"/index.html";
const root=fs.mkdtempSync(path.join(os.tmpdir(),"kaizen-chromium-url-smoke-"));
function run(label,folders,profileName=label){
  const args=[
    "--user-data-dir="+path.join(root,profileName),
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
    "--disable-extensions-except="+folders.join(","),
    "--load-extension="+folders.join(","),
    "--dump-dom",
    url
  ];
  const result=spawnSync(chrome,args,{encoding:"utf8",timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const html=String(result.stdout||"");
  const blocked=/ERR_BLOCKED_BY_CLIENT|page has been blocked|pagina.*bloqueada|página.*bloqueada/i.test(html);
  const hasApp=/KAIZEN|KAIZZEN|<html|<!doctype/i.test(html);
  const ok=!result.error&&result.status===0&&!blocked&&hasApp;
  console.log("[smoke] "+label+": "+(ok?"PASS":"FAIL")+
    " exit="+result.status+
    " blocked="+blocked+
    " appHtml="+hasApp+
    " bytes="+Buffer.byteLength(html));
  if(result.error)console.log("[smoke] chrome error: "+result.error.code);
  return {ok,blocked};
}
try{
  const single=run("catalog-alone",[catalog]);
  const combined=run("catalog-with-security",[catalog,ex1,ex2]);
  const migrated=run("old-profile-with-security",[catalog,ex1,ex2],"catalog-alone");
  if(!single.ok)throw Error("La URL no pasó la prueba ni con la extensión sola; revisar prueba headless/ID/Chromium");
  if(!combined.ok)throw Error("La URL no pasó con EX1 y EX2 en perfil limpio; consultar regla/registro");
  if(!migrated.ok)throw Error("El perfil usado previamente con una sola extensión falla al cargar EX1 y EX2");
  console.log("[smoke] PASSED: navegación a KAIZZEN-MAIN limpia y tras reutilizar un perfil previo.");
}catch(error){console.error("[smoke] "+error.message);process.exitCode=1;}
finally{fs.rmSync(root,{force:true,recursive:true});}
