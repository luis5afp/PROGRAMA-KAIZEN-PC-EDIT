"use strict";
// Reproduce the APK's READ-ONLY default-variant / catalog lookup on Windows.
// Does not request Chrome profile archives or bypass server authorisation.

function status(err) {
  return Number(err?.response?.status || 0) || 0;
}
function cleanName(value) {
  return typeof value === "string" ? value.slice(0, 80) : "";
}
function safeProduct(value) {
  if (!value || typeof value !== "object") return null;
  const label = cleanName(value.name || value.title || value.label || value.n);
  return label ? { title: label } : null;
}
async function consultarCatalogoApk(http, backendUrl, token) {
  const result = {
    variante: "Principal",
    selector: { estado: "Sin consultar", http: 0, cantidad: null },
    catalogo: { estado: "Sin consultar", http: 0, cantidad: null },
    productos: []
  };
  if (!http || typeof http.get !== "function" ||
      typeof backendUrl !== "string" || !backendUrl.startsWith("https://") ||
      typeof token !== "string" || !token || token.length > 8192 ||
      /[\r\n]/.test(token)) {
    result.catalogo.estado = "Sesión no disponible";
    return result;
  }

  // In the APK, variant-profiles is optional: if absent/error/empty,
  // the chooser is skipped, and the dashboard still loads.
  try {
    const response = await http.get(backendUrl + "/api/browser/variant-profiles",
      { headers: { Authorization: "Bearer " + token }, timeout: 8000 });
    const body = response?.data || {};
    const profiles = Array.isArray(body.profiles) ? body.profiles : null;
    result.selector = {
      estado: profiles === null ? "Sin lista" : profiles.length ? "Selector disponible" : "Sin perfiles: continuar directo",
      http: Number(response?.status || 200),
      cantidad: profiles ? profiles.length : null
    };
  } catch (err) {
    result.selector = {
      estado: "No disponible: continuar directo",
      http: status(err),
      cantidad: null
    };
  }

  // The APK's product catalogue is distinct from Chrome /api/browser/get.
  try {
    const response = await http.get(backendUrl + "/api/products/getmostusedtool",{
      params: { subtitle_id: "null", searchQuery: "null", page: 1, limit: 20 },
      headers: { Authorization: "Bearer " + token },
      timeout: 20000
    });
    const body = response?.data || {};
    let products = null;
    if (Array.isArray(body.products)) products = body.products;
    else if (typeof body.products === "string" && /^\s*\[/.test(body.products)) {
      try {
        const parsed = JSON.parse(body.products);
        if (Array.isArray(parsed)) products = parsed;
      } catch (_) {}
    }
    result.catalogo = {
      estado: products ? "Catálogo recibido" :
        typeof body.products === "string" ? "HTTP OK; catálogo cifrado por la APK" : "HTTP OK; estructura no reconocida",
      http: Number(response?.status || 200),
      cantidad: products ? products.length : null,
      masPaginas: body.hasMore === true
    };
    result.productos = products ? products.slice(0, 20).map(safeProduct).filter(Boolean) : [];
  } catch(err) {
    result.catalogo = {
      estado: "Consulta no autorizada o fallida",
      http: status(err),
      cantidad: null
    };
  }
  return result;
}
module.exports = { consultarCatalogoApk };
