"use strict";
/*
 * KAIZEN 233 LAB — isolated synthetic proof of concept.
 * No KAIZEN server, user account, browser profile or third-party service is
 * contacted. The credentials and domains are intentionally fictional.
 * This module does NOT change isLock for real catalogue entries.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.Kaizen233Lab=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const TOTAL=233;
  const MODES=Object.freeze(["authorized","locked","missing-credentials"]);
  const TTL_MS=60000;
  const text=v=>typeof v==="string"&&v.trim().length>0;
  function makeCatalog(mode="authorized",count=TOTAL){
    if(!MODES.includes(mode))throw new RangeError("Modo de prueba no reconocido");
    if(!Number.isSafeInteger(count)||count<1||count>TOTAL)
      throw new RangeError("La prueba admite de 1 a 233 tarjetas");
    return Object.freeze(Array.from({length:count},(_,i)=>{
      const suffix=String(i+1).padStart(3,"0");
      const authorized=mode!=="locked";
      const credentials=mode==="authorized";
      return Object.freeze({
        id:"TEST-"+suffix,
        name:"Herramienta ficticia "+suffix,
        d:"https://tool-"+suffix+".invalid/login",
        // Fake credentials never represent a service, person or account.
        e:credentials?"lab+"+suffix+"@kaizen.invalid":null,
        k:credentials?"SOLO-PRUEBA-"+suffix+"-NO-REAL":null,
        isLock:!authorized,
        is_premium:false,
        synthetic:true
      });
    }));
  }
  function isSynthetic(card){
    return card?.synthetic===true &&
      /^TEST-\d{3}$/.test(card?.id||"") &&
      /^https:\/\/tool-\d{3}\.invalid\/login$/.test(card?.d||"");
  }
  function metrics(cards){
    if(!Array.isArray(cards))throw new TypeError("Catálogo inválido");
    return Object.freeze({
      received:cards.length,
      authorized:cards.filter(card=>card?.isLock===false).length,
      restricted:cards.filter(card=>card?.isLock!==false).length,
      credentialPairs:cards.filter(card=>text(card?.e)&&text(card?.k)).length,
      eligible:cards.filter(card=>isSynthetic(card)&&card.isLock===false&&
        text(card.e)&&text(card.k)).length
    });
  }
  function beginAutofill(card,origin,now=Date.now()){
    if(!isSynthetic(card))return Object.freeze({ok:false,reason:"not-lab-data"});
    if(card.isLock!==false)return Object.freeze({ok:false,reason:"locked"});
    if(!text(card.e)||!text(card.k))
      return Object.freeze({ok:false,reason:"missing-credentials"});
    if(!Number.isFinite(now))return Object.freeze({ok:false,reason:"invalid-time"});
    try{
      const url=new URL(card.d);
      const caller=new URL(origin);
      if(url.protocol!=="https:"||caller.origin!==url.origin)
        return Object.freeze({ok:false,reason:"origin-mismatch"});
    }catch{
      return Object.freeze({ok:false,reason:"invalid-url"});
    }
    return Object.freeze({
      ok:true,
      origin:new URL(card.d).origin,
      expiresAt:now+TTL_MS,
      // Lab data only, stored in memory; never exported or persisted.
      e:card.e,k:card.k
    });
  }
  function fillFakeForm(fields,session,origin,now=Date.now()){
    if(!session?.ok)return Object.freeze({ok:false,reason:"no-session"});
    if(!Number.isFinite(now)||now>session.expiresAt)
      return Object.freeze({ok:false,reason:"expired"});
    if(origin!==session.origin)
      return Object.freeze({ok:false,reason:"origin-mismatch"});
    if(!fields?.email||!fields?.password||
       typeof fields.email.value!=="string"||
       typeof fields.password.value!=="string")
      return Object.freeze({ok:false,reason:"missing-fields"});
    fields.email.value=session.e;
    fields.password.value=session.k;
    if(typeof Event!=="undefined"){
      for(const field of [fields.email,fields.password]){
        if(typeof field.dispatchEvent==="function"){
          field.dispatchEvent(new Event("input",{bubbles:true}));
          field.dispatchEvent(new Event("change",{bubbles:true}));
        }
      }
    }
    // Deliberately no form.submit(), fetch(), storage or browser cookies.
    return Object.freeze({ok:true,filled:2});
  }
  return Object.freeze({TOTAL,MODES,makeCatalog,metrics,beginAutofill,fillFakeForm});
});
