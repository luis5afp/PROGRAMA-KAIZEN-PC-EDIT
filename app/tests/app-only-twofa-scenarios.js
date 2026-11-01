const assert = require("assert");
const fs = require("fs");
const path = require("path");

const bundle = fs.readFileSync(path.join(__dirname, "..", "app_view", "dist", "assets", "index-DAX2BPbP.js"), "utf8");
new Function(bundle.replaceAll("import.meta", "({})"));

const loginStart = bundle.indexOf("function W3()");
const loginEnd = bundle.indexOf("/*!", loginStart);
assert(loginStart >= 0 && loginEnd > loginStart, "login/2FA component missing");
const login = bundle.slice(loginStart, loginEnd);

assert(login.includes('ne={step:X.includes("app")?"app":"choose"'), "app must be first when server advertises it");
assert(login.includes('"/api/users/2fa/setup"'), "app registration must remain available");
assert(bundle.includes('I3={setup:"/api/users/2fa/activate"}'), "app activation endpoint missing");
assert(login.includes('"/api/users/2fa/verify"'), "server-side app OTP verification must remain");
assert(login.includes("Esta versión de KAIZEN PC no enviará códigos por correo."), "missing explanation when app is unavailable");
assert(login.includes("Probar código de aplicación 2FA"), "legacy app verification option missing");
assert(login.includes('onClick:()=>p({...d,step:"app"})'), "legacy app option must use genuine app verification flow");
assert(!login.includes("/api/users/2fa/email/send"), "email OTP sending is still present in login");
assert(!login.includes("/api/users/2fa/email/verify"), "email OTP verification is still present in login");
assert(!login.includes("Enviar código a mi correo"), "email login choice still visible");
assert(!login.includes('step:"email"'), "email step still available");
assert(login.includes("ne.data?.token"), "session must only be accepted when server issues a token");
console.log("KAIZEN app-only 2FA login: PASS");
