"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {validate}=require("../scripts/verify-security-extensions");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"kaizen-security-validation-"));
try{
  for(const [dir,version] of [["ex1","1.2"],["ex2","1.1"]]){
    const folder=path.join(root,dir);
    fs.mkdirSync(folder);
    const manifest={
      manifest_version:3,name:dir,version,
      background:{service_worker:"backgroundScript.js"},
      content_scripts:[{matches:["<all_urls>"],js:["contentScript.js"]}],
      icons:{"16":"icon.png"}
    };
    if(dir==="ex1")manifest.web_accessible_resources=[{
      resources:["inject.js"],matches:["<all_urls>"]
    }];
    for(const name of ["backgroundScript.js","contentScript.js","icon.png","inject.js"])
      fs.writeFileSync(path.join(folder,name),"fixture only");
    fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest));
  }
  assert.equal(validate(root),true);
  // El archivo inject.js se menciona como web_accessible_resources, pero
  // NO forma parte del paquete original: Chrome sí puede cargar EX1 sin él.
  fs.rmSync(path.join(root,"ex1","inject.js"));
  assert.equal(validate(root),true);
  // Un script realmente ejecutado sí es obligatorio: el build debe fallar.
  fs.rmSync(path.join(root,"ex1","contentScript.js"));
  assert.throws(()=>validate(root),/Falta un recurso declarado.*contentScript.js/);
  fs.writeFileSync(path.join(root,"ex1","contentScript.js"),"fixture only");
  assert.equal(validate(root),true);
  // La excepción no debe permitir cualquier otro recurso ausente.
  const ex1Manifest=path.join(root,"ex1","manifest.json");
  const ex1Data=JSON.parse(fs.readFileSync(ex1Manifest,"utf8"));
  ex1Data.web_accessible_resources[0].resources.push("otro-recurso-no-incluido.js");
  fs.writeFileSync(ex1Manifest,JSON.stringify(ex1Data));
  assert.throws(()=>validate(root),/otro-recurso-no-incluido.js/);
  ex1Data.web_accessible_resources[0].resources.pop();
  fs.writeFileSync(ex1Manifest,JSON.stringify(ex1Data));
  const file=path.join(root,"ex2","manifest.json");
  const m=JSON.parse(fs.readFileSync(file,"utf8"));
  m.version="999";fs.writeFileSync(file,JSON.stringify(m));
  assert.throws(()=>validate(root),/Identidad o versión inesperada/);
  assert.throws(()=>validate(path.join(root,"not-found")),/No existe extensionForSecurity/);
  console.log("KAIZEN security extension bundle validation: PASS (no extensions executed)");
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
