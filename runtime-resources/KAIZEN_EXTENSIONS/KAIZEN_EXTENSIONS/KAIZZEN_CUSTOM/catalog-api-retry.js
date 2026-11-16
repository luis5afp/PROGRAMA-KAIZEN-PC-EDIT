"use strict";
(() => {
  // Resilience ONLY for the original, authenticated READ of catalogue products.
  // Never invent tokens or permissions; use the existing request unchanged.
  // Never retry 401/403 (authorization) or 429 (server rate limit).
  if (typeof globalThis.__kzCatalogGetWithRetry === "function") return;
  const BACKOFF_MS = [350, 900];
  const RETRY_HTTP = new Set([502, 503, 504]);
  const RETRY_CODES = new Set(["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"]);

  function transient(error) {
    const status = Number(error?.response?.status || 0);
    if (status) return RETRY_HTTP.has(status);
    return RETRY_CODES.has(String(error?.code || ""));
  }

  function pause(milliseconds, signal) {
    if (signal?.aborted) return Promise.reject(
      Object.assign(new Error("request aborted"), {name: "AbortError"}));
    return new Promise((resolve, reject) => {
      let timer;
      const cancelled = () => {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", cancelled);
        reject(Object.assign(new Error("request aborted"), {name: "AbortError"}));
      };
      timer = setTimeout(() => {
        signal?.removeEventListener?.("abort", cancelled);
        resolve();
      }, milliseconds);
      signal?.addEventListener?.("abort", cancelled, {once: true});
    });
  }

  globalThis.__kzCatalogGetWithRetry = async function(read, signal) {
    if (typeof read !== "function") throw new TypeError("Se requiere una petición de catálogo");
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted)
        throw Object.assign(new Error("request aborted"), {name: "AbortError"});
      try {
        return await read();
      } catch (error) {
        if (signal?.aborted || attempt >= BACKOFF_MS.length || !transient(error))
          throw error;
        // Only diagnostic status counts; do not log paths, bodies, headers,
        // identifiers, cookies, account information, or access credentials.
        try {
          globalThis.__kzDiagnosticCatalogRetry?.({
            intentos: attempt + 1,
            http: Number(error?.response?.status || 0),
            motivo: "transitorio"
          });
        } catch {}
        await pause(BACKOFF_MS[attempt], signal);
      }
    }
  };
})();
