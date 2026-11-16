"use strict";
/* UI for opt-in live API metadata and sanitized reports, with no persistence. */
(() => {
  const parser=globalThis.KaizenIntegration1542;
  const $=id=>document.getElementById(id);
  if(!parser||!$("integration-report"))return;
  const reports=Object.create(null);
  const names={main:"Principal · KAIZZEN-MAIN",google:"Google · KAIZZEN-GOOGLE",custom:"Custom · KAIZZEN-CUSTOM"};
  const reportBox=$("integration-report");
  const status=$("integration-status");
  const summary=$("integration-summary");
  const liveStatus=$("live-api-status");
  const liveResults=$("live-api-results");
  const row=(where,name,value)=>{
    const el=document.createElement("div");
    el.className="integration-row";
    const strong=document.createElement("strong");
    strong.textContent=name;
    const span=document.createElement("span");
    span.textContent=String(value);
    el.append(strong,span);
    where.append(el);
  };
  function refresh(){
    const all=parser.compare(reports);
    summary.replaceChildren();
    row(summary,"Informes de extensiones",all.present+"/3");
    row(summary,"Tarjetas recibidas en informes",all.totalReceived);
    row(summary,"Autorizadas según informes",all.totalAuthorized);
    row(summary,"Restringidas según informes",all.totalRestricted);
    for(const profile of parser.PROFILES){
      const p=reports[profile];
      row(summary,names[profile],!p?"Informe no cargado":
        "HTTP "+(p.http??"sin dato")+" · recibidas "+p.received+
        " · autorizadas "+p.authorized+" · restringidas "+p.restricted+
        " · e con texto "+p.emailValues+" · k con texto "+p.passwordValues);
      if(p){
        row(summary,"Etapas ("+profile+")",
          "Ventana: "+p.window+" · Pestaña: "+p.tab+
          " · Sesión: "+p.session+" · Formulario: "+p.form);
        row(summary,"Diagnóstico ("+profile+")",p.diagnosis);
      }
    }
    if(!all.complete)row(summary,"Cobertura",
      "Faltan informes de "+(3-all.present)+" perfil(es). No se extrapolan permisos.");
    row(summary,"Interpretación","Estos datos son de informes locales de las extensiones. No se solicita ni recupera ninguna contraseña.");
  }
  $("integration-analyze").addEventListener("click",()=>{
    const profile=$("integration-profile").value;
    try {
      const outcome=parser.analyze(reportBox.value,profile);
      reports[outcome.profile]=outcome;
      $("integration-profile").value=outcome.profile;
      status.textContent="Informe sanitizado analizado: "+names[outcome.profile]+
        " · HTTP "+(outcome.http??"sin datos")+
        " · autorizadas "+outcome.authorized+"/"+outcome.received;
    }catch(error){
      // Only predefined parser errors are shown; never echo pasted report text.
      const safe=[
        /^El informe está vacío o excede el límite permitido$/,
        /^El JSON del diagnóstico no es válido$/,
        /^Falta el campo resumen del diagnóstico$/,
        /^El informe no identifica el perfil de la extensión$/,
        /^El informe no contiene todos los conteos de catálogo descifrado$/,
        /^Los totales de autorizaciones no coinciden con las tarjetas descifradas$/,
        /^Los conteos de presencia de campos son inconsistentes$/,
        /^El informe es KAIZZEN-(?:MAIN|GOOGLE|CUSTOM)\. Selecciona KAIZZEN-(?:MAIN|GOOGLE|CUSTOM) o detección automática\.$/
      ];
      const msg=String(error?.message||"");
      status.textContent=safe.some(re=>re.test(msg))?msg:
        "No se pudo analizar el informe. Copia el reporte desde Diagnóstico de la extensión.";
    }finally{
      // Never preserve raw JSON that could accidentally contain cookies/tokens.
      reportBox.value="";
      refresh();
    }
  });
  $("integration-clear").addEventListener("click",()=>{
    for(const k of parser.PROFILES)delete reports[k];
    reportBox.value="";
    status.textContent="Se limpiaron las comparaciones en memoria.";
    refresh();
  });
  $("live-api-probe").addEventListener("click",async()=>{
    const bridge=globalThis.kaizenLab;
    if(typeof bridge?.probe!=="function"){
      liveStatus.textContent="La consulta de servidor está disponible solo dentro de KAIZEN PC instalado.";
      return;
    }
    $("live-api-probe").disabled=true;
    liveStatus.textContent="Consultando solo metadatos de cinco rutas, con la sesión de KAIZEN PC…";
    liveResults.replaceChildren();
    try{
      const result=await bridge.probe();
      if(!result?.ok){
        liveStatus.textContent=String(result?.message||"No se pudo consultar las APIs").slice(0,115);
        return;
      }
      liveStatus.textContent="Respuestas del servidor para la sesión de KAIZEN PC; no equivalen a los permisos de Principal, Google y Custom.";
      for(const c of result.checks||[]){
        const name=["cuenta","perfiles_chrome","grupos","variantes_android","catalogo_productos"].includes(c.id)?
          c.id.replaceAll("_"," "):"Consulta";
        row(liveResults,name,"HTTP "+(Number.isInteger(c.http)&&c.http?c.http:"sin respuesta")+
          (Number.isInteger(c.count)?" · "+c.count+" elementos":"")+
          (c.role?" · rol "+c.role:""));
      }
    }catch(_){
      liveStatus.textContent="No se pudo completar la consulta desde KAIZEN.";
    }finally{$("live-api-probe").disabled=false;}
  });
  refresh();
})();
