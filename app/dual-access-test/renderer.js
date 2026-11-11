"use strict";
const form = document.getElementById("test-form");
const results = document.getElementById("resultados");
const button = document.getElementById("ejecutar");
function linea(step) {
  const item = document.createElement("div");
  item.className = "linea " + (step.ok ? "ok" : "error");
  const heading = document.createElement("strong");
  heading.textContent = (step.ok ? "✓ " : "✕ ") + step.id.replaceAll("_", " ");
  const detail = document.createElement("p");
  detail.textContent = step.detalle;
  item.append(heading, detail);
  if (step.http != null) {
    const meta = document.createElement("small");
    meta.textContent = "HTTP " + step.http;
    if (step.rol) meta.textContent += " · Rol: " + step.rol;
    if (Number.isInteger(step.cantidadPerfiles)) meta.textContent +=
      " · Perfiles: " + step.cantidadPerfiles;
    if (step.causa) meta.textContent += " · " + step.causa;
    if (Array.isArray(step.metodos) && step.metodos.length)
      meta.textContent += " · Métodos: " + step.metodos.join(", ");
    item.append(meta);
  }
  return item;
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (button.disabled) return;
  const datos = {
    primera: {
      email: document.getElementById("correo1").value.trim(),
      password: document.getElementById("clave1").value
    },
    segunda: {
      email: document.getElementById("correo2").value.trim(),
      password: document.getElementById("clave2").value
    }
  };
  // No conservar contraseñas en el formulario ni escribirlas en registros.
  document.getElementById("clave1").value = "";
  document.getElementById("clave2").value = "";
  results.replaceChildren();
  button.disabled = true;
  button.textContent = "Consultando al servidor…";
  try {
    const resultado = await window.pruebaKaizen.comprobar(datos);
    const h = document.createElement("h2");
    h.textContent = resultado.ok
      ? "Acceso dual confirmado: el catálogo de la cuenta 1 responde."
      : "No se confirmó el acceso dual; consulta los pasos.";
    results.append(h);
    for (const p of resultado.pasos || []) results.append(linea(p));
  } catch (_) {
    const msg = document.createElement("p");
    msg.textContent = "La prueba no pudo completarse (fallo local de comunicación).";
    results.append(msg);
  } finally {
    datos.primera.password = "";
    datos.segunda.password = "";
    button.disabled = false;
    button.textContent = "Probar doble acceso";
  }
});
