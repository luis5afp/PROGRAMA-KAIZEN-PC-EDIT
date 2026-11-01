"use strict";
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const s=fs.readFileSync(path.join(__dirname,"..","app_view","dist","assets","index-DAX2BPbP.js"),"utf8");

// La UI debe distinguir catálogo remoto vacío de fallos de red, acceso denegado y cache.
for (const mark of [
  'actualizarEstadoCatalogo("Consultando servidor…")',
  '"HTTP "+Q.status+" · "+ue.length+" perfil(es) (servidor)"',
  '"HTTP "+Q.status+" · falta lista de perfiles"',
  '"HTTP "+Q.status+" · respuesta con error"',
  '"HTTP "+ue+" · consulta fallida"',
  '"Error de red · sin respuesta"',
  '"Caché local · "+Ce.profiles.length+" perfil(es); remoto "',
  'children:estadoCatalogo',
  'children:"Grupos: "+estadoGrupos',
  'ke.get(Ir+"/api/browser/group/get",{headers:{Authorization:"Bearer "+k}',
  '"HTTP "+respuestaGrupos.status+" · "+listaGrupos.length+" grupo(s) visibles"',
  '"HTTP "+estado+" · consulta denegada o fallida"',
  'actualizarEstadoGrupos("Consultando…")'
])assert(s.includes(mark),"Missing catalog state: "+mark);
assert(s.includes('iN=["appcbl_soft","admin","specific","member","all_profile","manager"]'));
assert(s.includes('ke.get(Ir+"/api/browser/get",{headers:{Authorization:"Bearer "+k}})'));
assert(s.includes('n.role==="admin"?'));
assert(s.includes('"/api/users/2fa/email/verify"'));
new Function(s.replaceAll("import.meta","({})"));
console.log("KAIZEN group and catalog UI diagnostics: PASS");
