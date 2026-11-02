"use strict";
// Conservative guard for renewal of an existing authenticated KAIZEN account.
// Tokens issued by the backend may contain a stable user subject or email.
// Refuse silent account replacement when subject cannot be confirmed.
function claims(token) {
  if(typeof token!=="string" || token.length>8192) return null;
  const part=token.split(".")[1];
  if(!part || part.length>8000) return null;
  try {
    const data=JSON.parse(Buffer.from(part,"base64url").toString("utf8"));
    return data && typeof data==="object" ? data : null;
  }catch {return null;}
}
function stable(value){
  if(typeof value==="number" && Number.isSafeInteger(value))return String(value);
  if(typeof value==="string" && value.trim() && value.length<200)return value.trim();
  return "";
}
function sameAccountJwt(before,after){
  if(before===after && typeof before==="string" && before.length>20)return true;
  const a=claims(before),b=claims(after);
  if(!a || !b) return false;
  const ae=stable(a.email||a.user_email).toLowerCase();
  const be=stable(b.email||b.user_email).toLowerCase();
  if(ae && be) return ae===be;
  for(const key of ["user_id","userId","uid","id","sub"]){
    const av=stable(a[key]),bv=stable(b[key]);
    if(av && bv)return av===bv;
  }
  return false;
}
module.exports={sameAccountJwt};
