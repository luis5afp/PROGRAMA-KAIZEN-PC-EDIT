"use strict";
// Diagnóstico 2FA: contrato de metadatos sin acceso al servidor, cookies ni códigos.
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");

const bundle=fs.readFileSync(path.join(__dirname,"..","app_view","dist","assets","index-DAX2BPbP.js"),"utf8");
const start=bundle.indexOf("function kzTwofaDiagnostic(");
const end=bundle.indexOf(";function W3()",start);
assert(start>=0&&end>start,"No se encontró la función de diagnóstico en el bundle");
const diagnostic=vm.runInNewContext("("+bundle.slice(start,end)+")",{});
function plain(value){return JSON.parse(JSON.stringify(value));}
function check(input,effective,setup,expected){
 const result=plain(diagnostic(input,effective,setup));
 assert.deepEqual(result.reportedMethods,expected.reported);
 assert.deepEqual(result.effectiveMethods,expected.effective);
 assert.equal(result.source,expected.source);
 assert.equal(result.serverAllowsApp,expected.serverAllowsApp);
 assert.equal(result.canSetupApp,setup);
 assert.equal(result.requires2fa,input.requires2fa===true);
 assert(!JSON.stringify(result).includes("TEMP_TOKEN_SENSITIVE"));
 assert(!JSON.stringify(result).includes("PRIVATE_EMAIL_SENSITIVE"));
 return result;
}
check(
 {methods:["email"],requires2fa:true,tempToken:"TEMP_TOKEN_SENSITIVE",maskedEmail:"PRIVATE_EMAIL_SENSITIVE"},
 ["email"],false,
 {reported:["email"],effective:["email"],source:"servidor",serverAllowsApp:false}
);
check(
 {methods:["app","email"],requires2fa:true},
 ["app","email"],false,
 {reported:["app","email"],effective:["app","email"],source:"servidor",serverAllowsApp:true}
);
check(
 {requires2fa:true},
 ["app"],false,
 {reported:[],effective:["app"],source:"compatibilidad_cliente",serverAllowsApp:false}
);
check(
 {methods:["unsupported","app"],requires2fa:true,canSetupApp:true},
 ["unsupported","app"],true,
 {reported:["app"],effective:["app"],source:"servidor",serverAllowsApp:true}
);
check(
 {methods:[],requires2faSetup:true},
 [],true,
 {reported:[],effective:[],source:"servidor",serverAllowsApp:false}
);
assert(bundle.includes("diagnostic:kzTwofaDiagnostic(G,X,te)"),"Diagnóstico no asociado al flujo real de login");
assert(bundle.includes("Diagnóstico 2FA (solo lectura)"),"Falta la sección visible");
assert(bundle.includes("Métodos anunciados por el servidor:"),"Falta indicador de métodos anunciados");
assert(bundle.includes("Servidor indica que permite configurar app:"),"Falta indicador de configuración de app");
assert(bundle.includes("No se envían solicitudes adicionales."),"Falta la aclaración de funcionamiento");
assert(bundle.includes('"/api/users/2fa/verify"'),"Se ha perdido la verificación por app");
assert(bundle.includes('"/api/users/2fa/email/verify"'),"Se ha perdido la verificación por correo");
assert(bundle.includes('iN=["appcbl_soft","admin","specific","member","all_profile","manager"]'),"Se ha alterado el control de roles");
console.log("PASS: diagnostico 2FA offline, 5 escenarios, sin secretos y sin cambios de autenticacion");
