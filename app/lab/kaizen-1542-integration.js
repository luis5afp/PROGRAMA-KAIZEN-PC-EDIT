"use strict";
/*
 * KAIZEN 1.5.42: compare sanitized diagnostics from original KAIZZEN
 * MAIN / GOOGLE / CUSTOM. This helper neither connects to the backend
 * nor reads credentials, tokens, URLs or raw product objects.
 *
 * Only the allowlisted summary string is interpreted; the events array,
 * request bodies and any other JSON keys are deliberately discarded.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.KaizenIntegration1542=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const PROFILES=Object.freeze(["main","google","custom"]);
  const MAX_REPORT=240000;
  const expected={main:"KAIZZEN-MAIN",google:"KAIZZEN-GOOGLE",custom:"KAIZZEN-CUSTOM"};
  function countMatch(s,re){
    const m=String(s||"").match(re);
    if(!m)return null;
    const n=Number(m[1]);
    return Number.isSafeInteger(n)&&n>=0&&n<=100000?n:null;
  }
  function lineSummary(report){
    const input=String(report||"");
    if(!input.trim()||input.length>MAX_REPORT)throw Error("El informe está vacío o excede el límite permitido");
    if(input.trimStart().startsWith("{")){
      let parsed;
      try{parsed=JSON.parse(input);}catch{throw Error("El JSON del diagnóstico no es válido");}
      if(!parsed||typeof parsed.resumen!=="string")
        throw Error("Falta el campo resumen del diagnóstico");
      return parsed.resumen.slice(0,16000);
    }
    // Plain text is supported only for the copied, sanitized summary.
    return input.slice(0,16000);
  }
  function analyze(report,selection="auto"){
    if(selection!=="auto"&&!PROFILES.includes(selection))throw Error("Perfil no reconocido");
    const text=lineSummary(report);
    const found=text.match(/perfil\s+(KAIZZEN-(?:MAIN|GOOGLE|CUSTOM))/i);
    if(!found)throw Error("El informe no identifica el perfil de la extensión");
    const profile=found[1].toUpperCase();
    const detected=PROFILES.find(name=>expected[name]===profile);
    if(!detected)throw Error("El perfil del informe no es reconocido");
    if(selection!=="auto"&&selection!==detected)
      throw Error("El informe es "+profile+". Selecciona "+profile+" o detección automática.");

    const http=countMatch(text,/Productos \(servidor\): HTTP\s+(\d{3})/i);
    const decoded=countMatch(text,/Productos \(tras descifrar\):\s*(\d+)/i);
    const authorized=countMatch(text,/Acceso según respuesta:\s*autorizadas\s*(\d+)/i);
    const restricted=countMatch(text,/Acceso según respuesta:[^\n]*restringidas\s*(\d+)/i);
    const emailValues=countMatch(text,/Inmediatamente tras descifrar:[^\n]*e con texto\s*(\d+)/i);
    const passwordValues=countMatch(text,/Inmediatamente tras descifrar:[^\n]*k con texto\s*(\d+)/i);
    const explicitLocked=countMatch(text,/Acceso según respuesta:[^\n]*bloqueos explícitos\s*(\d+)/i);
    // El informe v8 añade contadores agregados; conservar compatibilidad v7.
    const restrictedWithoutPair=countMatch(text,/Acceso en objetos descifrados:[^\n]*restringidas sin par e\/k\s*(\d+)/i);
    const lossEmail=countMatch(text,/Integridad de tarjetas autorizadas:[^\n]*pérdida de e\s*(\d+)/i);
    const lossPassword=countMatch(text,/Integridad de tarjetas autorizadas:[^\n]*pérdida de k\s*(\d+)/i);
    if([decoded,authorized,restricted,emailValues,passwordValues].some(x=>x===null))
      throw Error("El informe no contiene todos los conteos de catálogo descifrado");
    if(authorized+restricted!==decoded)
      throw Error("Los totales de autorizaciones no coinciden con las tarjetas descifradas");
    if(emailValues>decoded||passwordValues>decoded)
      throw Error("Los conteos de presencia de campos son inconsistentes");

    const sessionLine=text.match(/^Sesión product:\s*([^\r\n]{0,125})/im);
    const formLine=text.match(/^Formulario:\s*([^\r\n]{0,125})/im);
    const windowLine=text.match(/^Ventana:\s*([^\r\n]{0,95})/im);
    const tabLine=text.match(/^Pestaña:\s*([^\r\n]{0,95})/im);
    const safeStage=(line,words)=>{
      const v=String(line?.[1]||"").toLowerCase();
      if(!v)return "sin información";
      const w=words.find(([re])=>re.test(v));
      return w?w[1]:"sin información";
    };
    const session=safeStage(sessionLine,[
      [/sin preparación|no preparada|ausente|no hay/i,"no preparada"],
      [/preparada|creada|activa/i,"preparada"]
    ]);
    const form=safeStage(formLine,[
      [/sin observación|no observad|sin información/i,"sin observación"],
      [/sin sesión|sin sesion/i,"sin sesión"],
      [/autocomplet|rellenad|completad/i,"autocompletado observado"],
      [/conectad|observad|detectad/i,"observador conectado"]
    ]);
    const tab=safeStage(tabLine,[
      [/conectad|vinculad|identificad/i,"conectada"],
      [/sin observación|no identificad|ausente/i,"sin observación"]
    ]);
    const windowState=safeStage(windowLine,[
      [/creada|abierta/i,"creada"],
      [/sin observación|no creada/i,"sin observación"]
    ]);

    let diagnosis="No se ha recibido una respuesta HTTP de productos.";
    if(http===200&&decoded===0)diagnosis="API conectada; el catálogo descifrado está vacío.";
    else if(http===200&&restricted===decoded&&decoded>0)
      diagnosis="API conectada; todas las tarjetas figuran restringidas en el catálogo.";
    else if(http===200&&emailValues===0&&passwordValues===0)
      diagnosis="API conectada; no hay datos e/k disponibles para autocompletar.";
    else if(http===200&&authorized>0&&session==="no preparada")
      diagnosis="Hay tarjetas autorizadas; falta comprobar la preparación de la sesión.";
    else if(http===200)diagnosis="API conectada; continuar prueba de sesión y formulario autorizado.";
    else if(http===401)diagnosis="Sesión de la extensión caducada o rechazada.";
    else if(http===403)diagnosis="Permisos denegados por la API del servidor.";
    else if(http>=500)diagnosis="Posible falla temporal del servidor.";

    return Object.freeze({
      profile:detected,source:"diagnóstico original de extensión",http,
      received:decoded,authorized,restricted,emailValues,passwordValues,
      explicitLocked,restrictedWithoutPair,lossEmail,lossPassword,
      session,form,tab,window:windowState,diagnosis
    });
  }
  function compare(reports){
    const results=PROFILES.map(p=>reports?.[p]||null);
    return Object.freeze({
      profiles:results,
      present:results.filter(Boolean).length,
      totalReceived:results.reduce((n,x)=>n+(x?.received||0),0),
      totalAuthorized:results.reduce((n,x)=>n+(x?.authorized||0),0),
      totalRestricted:results.reduce((n,x)=>n+(x?.restricted||0),0),
      complete:results.every(Boolean)
    });
  }
  return Object.freeze({PROFILES,MAX_REPORT,analyze,compare});
});
