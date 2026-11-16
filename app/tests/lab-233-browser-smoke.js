"use strict";
// Real Chromium UI smoke for the synthetic 233-card laboratory.
// This test never connects to KAIZEN backend, collects credentials or opens
// websites. Only file:// laboratory assets are permitted.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const puppeteer=require("puppeteer-core");

(async()=>{
  const exe=process.argv[2];
  if(!exe||!fs.existsSync(exe))throw Error("Se requiere ruta real de Chromium Windows");
  const labFile=path.join(__dirname,"..","lab","index.html");
  const site=pathToFileURL(labFile).href;
  let browser=null;
  let external=0;
  const errors=[];
  try{
    browser=await puppeteer.launch({
      executablePath:exe,headless:true,
      // CI-only, sandbox is disabled ONLY for synthetic offline file:// tests.
      // Production KAIZEN/Chromium launchers retain their normal sandbox.
      args:["--no-sandbox","--disable-gpu","--disable-software-rasterizer",
        "--disable-background-networking","--disable-default-apps",
        "--no-first-run","--no-default-browser-check"]
    });
    const page=await browser.newPage();
    page.on("pageerror",error=>errors.push(String(error?.message||error)));
    // Windows Chromium snapshots can stall file:// navigations when Puppeteer
    // uses request interception. Observe instead; CSP connect-src 'none'
    // prevents network, and fail the test on any remote request.
    page.on("request",request=>{
      if(/^https?:/i.test(request.url()))external++;
    });
    await page.goto(site,{waitUntil:"domcontentloaded",timeout:35000});
    await page.waitForSelector("#test-all");
    let summary=await page.evaluate(()=>({
      received:document.querySelector("#received").textContent,
      authorized:document.querySelector("#authorized").textContent,
      restricted:document.querySelector("#restricted").textContent,
      pairs:document.querySelector("#pairs").textContent,
      cards:document.querySelectorAll("#card-list button").length
    }));
    assert.deepEqual(summary,{
      received:"233",authorized:"233",restricted:"0",pairs:"233",cards:233
    },"La interfaz real debe renderizar 233 tarjetas ficticias");

    await page.click("#test-all");
    let result=await page.$eval("#result",el=>el.textContent);
    assert.match(result,/Autocompletados ficticios:\s*233/);
    assert.match(result,/Fallos técnicos:\s*0/);
    assert.match(result,/Omitidos por bloqueo\/datos ausentes:\s*0/);
    await page.click("#fill");
    const input=await page.$eval("#fake-email",el=>el.value);
    const password=await page.$eval("#fake-pass",el=>el.value);
    assert.equal(input,"lab+001@kaizen.invalid");
    assert.equal(password,"SOLO-PRUEBA-001-NO-REAL");

    await page.select("#mode","locked");
    await page.click("#test-all");
    result=await page.$eval("#result",el=>el.textContent);
    assert.match(result,/Autocompletados ficticios:\s*0/);
    assert.match(result,/Omitidos por bloqueo\/datos ausentes:\s*233/);

    await page.select("#mode","missing-credentials");
    await page.click("#test-all");
    result=await page.$eval("#result",el=>el.textContent);
    assert.match(result,/Autocompletados ficticios:\s*0/);
    assert.match(result,/Omitidos por bloqueo\/datos ausentes:\s*233/);

    // The production lab can also summarize SANITIZED diagnostics from the
    // real extensions, without contacting the backend from Chromium.
    assert.equal(await page.$eval("#integration-summary",el=>el.textContent.includes("0/3")),true);
    const safeReport={
      version:7,
      resumen:[
        "Cliente de acceso: extension_main · perfil KAIZZEN-MAIN",
        "Productos (servidor): HTTP 200 · bloque cifrado sí",
        "Productos (tras descifrar): 233 · d 233 · e 0 · k 0 · proxy 0 · bloqueadas 233",
        "Inmediatamente tras descifrar: 233 objetos · e presente 233, e con texto 0, e nulo 233 · k presente 233, k con texto 0, k nulo 233",
        "Acceso según respuesta: autorizadas 0 / 233 · restringidas 233 · bloqueos explícitos 233",
        "Pestaña: conectada · ID 501",
        "Sesión product: sin preparación observada",
        "Formulario: sin observación asociada"
      ].join("\\n"),
      token:"NEVER_DISPLAY_SECRET"
    };
    await page.$eval("#integration-report",(el,value)=>{el.value=value;},JSON.stringify(safeReport));
    assert.equal(await page.$eval("#integration-profile",el=>el.value),"auto",
      "La importación debe sugerir detección automática");
    await page.click("#integration-analyze");
    assert.equal(await page.$eval("#integration-profile",el=>el.value),"main",
      "El informe debe identificar el perfil Principal");
    const compareText=await page.$eval("#integration-summary",el=>el.textContent);
    assert.match(compareText,/MAIN/);
    assert.match(compareText,/233/);
    assert.match(compareText,/restringidas 233/);
    assert(!compareText.includes("NEVER_DISPLAY_SECRET"));
    assert.equal(await page.$eval("#integration-report",el=>el.value),"");
    await page.select("#integration-profile","custom");
    await page.$eval("#integration-report",(el,value)=>{el.value=value;},JSON.stringify(safeReport));
    await page.click("#integration-analyze");
    const mismatch=await page.$eval("#integration-status",el=>el.textContent);
    assert.match(mismatch,/Selecciona KAIZZEN-MAIN o detección automática/);
    assert(!mismatch.includes("NEVER_DISPLAY_SECRET"));
    assert.equal(await page.$eval("#integration-report",el=>el.value),"",
      "Un informe erróneo tampoco debe conservarse en el laboratorio");
    await page.click("#live-api-probe");
    const apiText=await page.$eval("#live-api-status",el=>el.textContent);
    assert.match(apiText,/solo dentro de KAIZEN PC/);
    await page.click("#integration-clear");
    assert.equal(await page.$eval("#integration-summary",el=>el.textContent.includes("0/3")),true);
    assert.equal(external,0,"El laboratorio no debe intentar conectar con Internet");
    assert.deepEqual(errors,[],"No debe haber errores JavaScript en Chromium");
    console.log("PASS: Chromium real mostró 233 tarjetas; 233 autocompletados ficticios; bloqueadas y sin credenciales = 0; sin conexiones de red.");
  }finally{
    if(browser)await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
