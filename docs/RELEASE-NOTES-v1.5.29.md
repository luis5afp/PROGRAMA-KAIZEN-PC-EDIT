# KAIZEN PC 1.5.29 — Autocompletado original y diagnóstico de comunicaciones

## Incluye
- Catálogo y autocompletado originales de KAIZZEN-MAIN 2.5.11, KAIZZEN-GOOGLE 1.0.8 y KAIZZEN-CUSTOM 1.0.11. El popup de autocompletado lo muestra cada extensión al abrir una tarjeta autorizada en Chromium, sin sustituciones.
- EX1 1.2 y EX2 1.1 cargadas con los tres perfiles de Chromium y verificadas por los hashes originales.
- Nuevo evento `catalogo-envio` para solicitudes hechas por Fetch y XMLHttpRequest, `catalogo-respuesta` para el código HTTP y cantidades de tarjetas recibidas, y `catalogo-error` para errores de red. Estas estadísticas aparecen en el botón «Diagnóstico» dentro del catálogo.
- La ventana de Diagnóstico integral (Ctrl+Shift+D) identifica, en la comprobación del servidor, los endpoints consultados y sus respuestas HTTP, sin cabeceras ni cuerpos de petición.
- Instalador Windows x64 NSIS, con Chromium, los tres perfiles y EX1/EX2 integradas. SHA-256 adjunto a la publicación cuando termine satisfactoriamente la compilación.

## Privacidad y autorización
No se exportan credenciales, cookies, tokens, cabeceras de autenticación ni respuestas completas. Las tarjetas restringidas mantienen su estado autorizado por el servidor. El diagnóstico no inyecta credenciales ni crea nuevas solicitudes: observa el flujo ya existente.

## Validación
El workflow ejecuta pruebas de regresión, verifica los tres manifiestos y las cinco extensiones, empaqueta Chromium y prueba la instalación silenciosa del Setup en Windows. La existencia del instalador **no certifica** que una web de terceros acepte las credenciales: hay que realizar una prueba de autocompletado con una tarjeta autorizada.

Para diagnosticarlo: abre Chromium desde KAIZEN PC, pulsa «Diagnóstico» en el catálogo, abre una tarjeta autorizada, vuelve al catálogo y pulsa «Copiar informe». Comprueba `catalogo-envio`, `catalogo-respuesta`, `clic-tarjeta`, `sesion-temporal-preparada`, `script-formulario-activo` y `formulario-observado`.

**No compartas registros de red completos ni datos de cuentas.**
