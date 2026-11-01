"use strict";
const assert = require("node:assert/strict");
const { consultarCatalogoApk } = require("../apk-catalog-mode");
const BASE="https://test.example.org",TOKEN="TOKEN_DE_PRUEBA";

function failure(status) {
  const err=new Error("HTTP failed");
  err.response={status};
  return err;
}
async function scenario(options={}) {
  const calls=[];
  const http={get:async (url,cfg)=>{
    const path=new URL(url).pathname;
    calls.push({path,authorization:cfg?.headers?.Authorization,params:cfg?.params});
    if(path.endsWith("/variant-profiles")) {
      if(options.variantError) throw failure(options.variantError);
      return {status:200,data:{profiles:options.profiles||[]}};
    }
    if(path.endsWith("/getmostusedtool")){
      if(options.catalogError) throw failure(options.catalogError);
      return {status:200,data:{products:options.products??"CIFRADO_BASE64",hasMore:false}};
    }
    throw failure(404);
  }};
  const result=await consultarCatalogoApk(http,BASE,TOKEN);
  return {result,calls};
}
async function main(){
  {
    const {result,calls}=await scenario();
    assert.equal(result.variante,"Principal");
    assert.equal(result.selector.cantidad,0);
    assert.equal(result.catalogo.http,200);
    assert.match(result.catalogo.estado,/cifrado/);
    assert.equal(calls.length,2);
    assert(calls.every(c=>c.authorization==="Bearer "+TOKEN));
    assert.deepEqual(calls[1].params,{subtitle_id:"null",searchQuery:"null",page:1,limit:20});
    assert(!JSON.stringify(result).includes(TOKEN));
    assert(!JSON.stringify(result).includes("CIFRADO_BASE64"));
  }
  {
    const {result,calls}=await scenario({variantError:403});
    assert.equal(result.selector.http,403);
    assert.equal(result.catalogo.http,200);
    assert.equal(calls.length,2);
  }
  {
    const {result}=await scenario({catalogError:403});
    assert.equal(result.catalogo.http,403);
    assert.equal(result.productos.length,0);
  }
  {
    const {result}=await scenario({profiles:[{id:"1"}],products:[{name:"Herramienta A",secret:"NO_MOSTRAR"}, {title:"Herramienta B"}]});
    assert.equal(result.selector.cantidad,1);
    assert.equal(result.catalogo.cantidad,2);
    assert.deepEqual(result.productos,[{title:"Herramienta A"},{title:"Herramienta B"}]);
    assert(!JSON.stringify(result).includes("NO_MOSTRAR"));
  }
  {
    const {result}=await scenario({products:"[{\"title\":\"Producto demo\"}]"});
    assert.equal(result.catalogo.cantidad,1);
    assert.equal(result.productos[0].title,"Producto demo");
  }
  {
    const {consultarCatalogoApk:run}=require("../apk-catalog-mode");
    const result=await run({get:async()=>{throw Error("No network")} },BASE,"");
    assert.equal(result.catalogo.estado,"Sesión no disponible");
  }
  console.log("KAIZEN APK Principal catalogue: PASS (6 scenarios)");
}
main().catch(err=>{console.error(err);process.exitCode=1});
