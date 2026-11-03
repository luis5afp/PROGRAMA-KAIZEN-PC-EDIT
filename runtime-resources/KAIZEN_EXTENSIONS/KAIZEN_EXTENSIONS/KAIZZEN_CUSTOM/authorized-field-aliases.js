"use strict";
(() => {
  // Compatibilidad con nombres alternativos de campos, SOLO si el producto
  // ya llegó autorizado desde el servidor. No altera isLock ni permisos.
  if (typeof globalThis.__kzAuthorizedFieldAliases === "function") return;
  const nonempty = value => typeof value === "string" && value.trim().length > 0;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const find = (obj, names) => {
    for (const key of names) {
      if (own(obj,key) && nonempty(obj[key])) return obj[key];
    }
    return null;
  };
  const emailNames = Object.freeze(["email","correo","loginEmail","login_email","user_email"]);
  const passwordNames = Object.freeze(["password","clave","contrasena","contraseña","pass","pwd"]);
  globalThis.__kzAuthorizedFieldAliases = product => {
    if (!product || typeof product !== "object" || Array.isArray(product)) return {};
    // Misma regla de bloqueo que usa la tarjeta React original.
    if (product.isLock || (product.is_premium && product.isLock !== false)) return {};
    // Modo cookie tiene sesión independiente, no requiere e/k.
    if (product.lm === "cookie") return {};
    const fields = {};
    if (!nonempty(product.e)) {
      const email = find(product,emailNames);
      if (email !== null) fields.e=email;
    }
    if (!nonempty(product.k)) {
      const password = find(product,passwordNames);
      if (password !== null) fields.k=password;
    }
    return fields;
  };
})();
