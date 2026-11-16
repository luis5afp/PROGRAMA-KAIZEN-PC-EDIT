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

    assert.equal(external,0,"El laboratorio no debe intentar conectar con Internet");
    assert.deepEqual(errors,[],"No debe haber errores JavaScript en Chromium");
    console.log("PASS: Chromium real mostró 233 tarjetas; 233 autocompletados ficticios; bloqueadas y sin credenciales = 0; sin conexiones de red.");
  }finally{
    if(browser)await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
