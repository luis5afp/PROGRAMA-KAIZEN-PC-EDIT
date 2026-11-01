"use strict";

// Prueba de solo lectura. No guarda contraseñas, tokens, cookies ni perfiles.
// Tokens A y B permanecen únicamente en variables locales de esta ejecución.
const ROLES_DE_ACCESO = new Set(["appcbl_soft", "admin", "specific", "all_profile", "manager"]);

function paso(id, ok, detalle, extra = {}) {
  return { id, ok: !!ok, detalle, ...extra };
}
function httpStatus(error) {
  return Number(error?.response?.status || 0) || null;
}
function metodos(value) {
  return Array.isArray(value) ? value.filter(x => x === "email" || x === "app") : [];
}

async function autenticar(http, baseUrl, email, password, id) {
  try {
    const response = await http.post(baseUrl + "/api/users/login",
      { email, password },
      { timeout: 30000 });
    const data = response?.data || {};
    if (typeof data.token === "string" && data.token.length > 0) {
      return { token: data.token, resultado: paso(id, true, "Sesión emitida por el servidor.", { http: response.status || 200 }) };
    }
    if (data.requires2fa || data.requires2faSetup) {
      return { token: null, resultado: paso(id, false,
        "El servidor exige un segundo factor; no se intentará evitarlo.",
        { http: response.status || 200, causa: "MFA_REQUERIDO", metodos: metodos(data.methods) }) };
    }
    return { token: null, resultado: paso(id, false,
      "El servidor no entregó un token de sesión.", { http: response.status || 200, causa: "SIN_TOKEN" }) };
  } catch (error) {
    return { token: null, resultado: paso(id, false,
      "La petición de inicio de sesión fue rechazada o falló.",
      { http: httpStatus(error), causa: "LOGIN_ERROR" }) };
  }
}

async function verificarSesion(http, baseUrl, token, id) {
  try {
    const response = await http.get(baseUrl + "/api/verify-token",
      { headers: { Authorization: "Bearer " + token }, timeout: 30000 });
    const user = response?.data?.user;
    if (!user || typeof user !== "object")
      return { resultado: paso(id, false, "El servidor no devolvió información de usuario.",
        { http: response.status || 200 }), rol: "" };
    const role = typeof user.role === "string" ? user.role : "";
    const correoVerificado = user.email_verified !== false;
    return {
      rol: role, correoVerificado,
      resultado: paso(id, true, "Sesión comprobada por el servidor.",
        { http: response.status || 200, rol: role || "(no informado)", correoVerificado })
    };
  } catch (error) {
    return { rol: "", resultado: paso(id, false, "El servidor rechazó la verificación de sesión.",
      { http: httpStatus(error), causa: "VERIFY_ERROR" }) };
  }
}

async function consultarCatalogo(http, baseUrl, token) {
  try {
    const response = await http.get(baseUrl + "/api/browser/get",
      { headers: { Authorization: "Bearer " + token }, timeout: 30000 });
    const data = response?.data || {};
    if (data.error || !Array.isArray(data.profiles)) {
      return paso("catalogo_1", false,
        "El servidor no entregó una lista de perfiles autorizada.",
        { http: response.status || 200, causa: "RESPUESTA_SIN_CATALOGO" });
    }
    return paso("catalogo_1", true,
      "El servidor entregó el catálogo con la sesión de la cuenta 1.",
      { http: response.status || 200, cantidadPerfiles: data.profiles.length });
  } catch (error) {
    return paso("catalogo_1", false,
      "No se autorizó la consulta de perfiles con la cuenta 1.",
      { http: httpStatus(error), causa: "CATALOGO_DENEGADO" });
  }
}

// La cuenta 2 controla el acceso al comprobador, no altera los permisos
// de la cuenta 1. Nunca usamos el token 2 en /api/browser/get.
async function ejecutarPrueba({ http, baseUrl, primera, segunda }) {
  const pasos = [];
  if (!http || typeof http.post !== "function" || typeof http.get !== "function" ||
      typeof baseUrl !== "string" || !baseUrl.startsWith("https://")) {
    return { ok: false, pasos: [paso("configuracion", false, "Configuración HTTP no válida.")] };
  }
  if (!primera?.email?.trim() || !primera?.password ||
      !segunda?.email?.trim() || !segunda?.password) {
    return { ok: false, pasos: [paso("entrada", false, "Completa los cuatro campos.")] };
  }
  if (primera.email.trim().toLowerCase() === segunda.email.trim().toLowerCase()) {
    return { ok: false, pasos: [paso("entrada", false, "Utiliza dos cuentas diferentes.")] };
  }

  const auth1 = await autenticar(http, baseUrl, primera.email.trim(), primera.password, "login_1");
  pasos.push(auth1.resultado);
  if (!auth1.token) return { ok: false, pasos };

  const auth2 = await autenticar(http, baseUrl, segunda.email.trim(), segunda.password, "login_2");
  pasos.push(auth2.resultado);
  if (!auth2.token) return { ok: false, pasos };

  const verificacion2 = await verificarSesion(http, baseUrl, auth2.token, "validacion_2");
  pasos.push(verificacion2.resultado);
  if (!verificacion2.resultado.ok) return { ok: false, pasos };

  const permiso = ROLES_DE_ACCESO.has(verificacion2.rol) &&
    verificacion2.correoVerificado === true;
  pasos.push(paso("permiso_2", permiso,
    permiso ? "Cuenta 2 admitida para la interfaz KAIZEN." :
      "La cuenta 2 no tiene un rol admitido o su correo no está verificado."));
  if (!permiso) return { ok: false, pasos };

  const verificacion1 = await verificarSesion(http, baseUrl, auth1.token, "validacion_1");
  pasos.push(verificacion1.resultado);
  if (!verificacion1.resultado.ok) return { ok: false, pasos };

  // El rol de la primera cuenta es informativo. Los permisos del catálogo
  // los decide el servidor al responder a /api/browser/get con el token 1.
  const catalogo = await consultarCatalogo(http, baseUrl, auth1.token);
  pasos.push(catalogo);
  return { ok: catalogo.ok, pasos, cantidadPerfiles: catalogo.ok ? catalogo.cantidadPerfiles : null };
}

module.exports = { ejecutarPrueba, ROLES_DE_ACCESO };
