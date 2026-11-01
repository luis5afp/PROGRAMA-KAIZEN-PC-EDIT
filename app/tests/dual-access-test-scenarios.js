"use strict";
const assert = require("node:assert/strict");
const { ejecutarPrueba } = require("../dual-access-test/service");

const credenciales = {
  primera: {email: "primera@example.test", password:"secret1"},
  segunda: {email: "segunda@example.test", password:"secret2"}
};
const baseUrl = "https://test.example.org";
function httpError(status) {
  const e = new Error("Solicitud fallida");
  e.response = { status };
  return e;
}
function simulador({ role2 = "admin", catalogError = null, firstMfa = false,
                     secondMfa = false, firstRole = "member", secondVerified = true,
                     firstLoginError = null, firstLoginMessage = "" } = {}) {
  const calls = [];
  const http = {
    post: async (url, payload) => {
      calls.push({ method:"POST", path:new URL(url).pathname, hasPassword: !!payload.password });
      if (payload.email === credenciales.primera.email) {
        if (firstLoginError) {
          const error = httpError(firstLoginError);
          error.response.data = { error:true, message:firstLoginMessage };
          throw error;
        }
        if (firstMfa) return { status:200, data:{requires2faSetup:true,methods:["email"],tempToken:"TEMP1"} };
        return {status:200, data:{token:"TOKEN1-SECRET"}};
      }
      if (payload.email === credenciales.segunda.email) {
        if (secondMfa) return { status:200, data:{requires2fa:true,methods:["email"],tempToken:"TEMP2"} };
        return { status:200, data:{token:"TOKEN2-SECRET"} };
      }
      throw httpError(400);
    },
    get: async (url, options) => {
      const bearer = options?.headers?.Authorization;
      calls.push({ method:"GET", path:new URL(url).pathname, bearer });
      if (url.endsWith("/api/verify-token")) {
        if (bearer === "Bearer TOKEN2-SECRET")
          return { status:200, data:{ user:{ role:role2, email_verified:secondVerified } } };
        if (bearer === "Bearer TOKEN1-SECRET")
          return { status:200, data:{ user:{ role:firstRole, email_verified:true } } };
        throw httpError(401);
      }
      if (url.endsWith("/api/browser/get")) {
        if (bearer !== "Bearer TOKEN1-SECRET") throw httpError(403);
        if (catalogError) throw httpError(catalogError);
        return { status:200, data:{ error:false, profiles:[{name:"A"},{name:"B"}] } };
      }
      throw httpError(404);
    }
  };
  return { http, calls };
}
async function run() {
  {
    const {http,calls}=simulador();
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.ok,true);
    assert.equal(result.cantidadPerfiles,2);
    assert.equal(result.pasos.find(p=>p.id==="validacion_1").rol,"member");
    assert.equal(calls.find(c=>c.path.endsWith("/api/browser/get")).bearer,"Bearer TOKEN1-SECRET");
    const output=JSON.stringify(result);
    assert(!output.includes("TOKEN1-SECRET")&&!output.includes("TOKEN2-SECRET"));
    assert(!output.includes("secret1")&&!output.includes("secret2"));
  }
  {
    const {http,calls}=simulador({catalogError:403});
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.ok,false);
    assert.equal(result.pasos.at(-1).http,403);
    assert.equal(calls.filter(c=>c.path.endsWith("/api/browser/get")).length,1);
  }
  {
    const {http,calls}=simulador({secondMfa:true});
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.ok,false);
    assert.equal(result.pasos.at(-1).causa,"MFA_REQUERIDO");
    assert.equal(calls.filter(c=>c.path.endsWith("/api/browser/get")).length,0);
  }
  {
    const {http,calls}=simulador({firstMfa:true});
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.ok,false);
    assert.equal(result.pasos[0].causa,"MFA_REQUERIDO");
    assert.equal(calls.length,1);
  }
  {
    const {http,calls}=simulador({role2:"member"});
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.ok,false);
    assert.equal(result.pasos.find(p=>p.id==="permiso_2").ok,false);
    assert.equal(calls.filter(c=>c.path.endsWith("/api/browser/get")).length,0);
  }
  {
    const {http}=simulador({secondVerified:false});
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.ok,false);
    assert.equal(result.pasos.find(p=>p.id==="permiso_2").ok,false);
  }
  {
    const {http}=simulador();
    const result=await ejecutarPrueba({http,baseUrl,primera:credenciales.primera,
      segunda:{...credenciales.segunda,email:credenciales.primera.email}});
    assert.equal(result.ok,false);
    assert.equal(result.pasos[0].id,"entrada");
  }
  {
    const {http,calls}=simulador({firstLoginError:400,firstLoginMessage:"Credenciales inválidas"});
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.ok,false);
    assert.equal(result.pasos[0].id,"login_1");
    assert.equal(result.pasos[0].http,400);
    assert.equal(result.pasos[0].causa,"CREDENCIALES_INVALIDAS");
    assert.equal(calls.length,1);
    assert(!JSON.stringify(result).includes("secret1"));
  }
  {
    const {http}=simulador({firstLoginError:400,firstLoginMessage:"Mensaje privado: secreto"});
    const result=await ejecutarPrueba({http,baseUrl,...credenciales});
    assert.equal(result.pasos[0].causa,"SOLICITUD_RECHAZADA");
    assert(!JSON.stringify(result).includes("secreto"));
  }
  console.log("KAIZEN dual credential test: PASS (9 scenarios)");
}
run().catch(error => { console.error(error.message); process.exitCode=1; });
