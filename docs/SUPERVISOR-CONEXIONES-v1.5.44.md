# KAIZEN PC 1.5.44 — Supervisor de API y formatos (diagnóstico v9)

## Objetivo

Ampliar el botón **Diagnóstico** existente en los perfiles Chromium
KAIZZEN-MAIN, KAIZZEN-GOOGLE y KAIZZEN-CUSTOM. No sustituye el catálogo
real ni utiliza las 233 tarjetas ficticias del laboratorio.

Permite identificar fallos en la comunicación **autorizada** de una
extensión con las rutas `/api/` de `kaizzen.org` visibles para ella,
sin capturar ni exportar contenidos sensibles.

## Qué observa

- **Interfaz:** `fetch` y `XMLHttpRequest` observan el envío, método,
  clasificación fija de ruta, estado de respuesta, duración y un número
  **local** de correlación `traza`.
- **Chromium:** `webRequest` observa solicitudes y resultados, cuando
  el permiso/API está disponible, y de manera opcional las cabeceras
  de respuesta sin conservar las cabeceras originales.
- **Formatos:** clasifica el `Content-Type` de la respuesta como
  `json`, `html`, `xml`, `texto`, `formulario`, `multipart`,
  `protobuf`, `sse`, `javascript`, `css`, `imagen`,
  `audio`, `video`, `binario`, `otro` o `sin-tipo`.
  Reconoce `Content-Encoding` `gzip`, `br`, `deflate`, `zstd`,
  `identity`, `otro` o `sin-dato`.
- **Tamaños:** si existe `Content-Length`, lo agrupa en rangos, sin
  conservar el valor original. Estos rangos indican el tamaño informado
  por el servidor, **no** el tamaño real total o transferido.
- **Incidentes:** resume HTTP `401/403`, `429`, errores `5xx` y
  fallos de red. Una respuesta `HTTP 200` no implica que las tarjetas
  tengan credenciales autorizadas.
- **Catálogo:** mantiene el diagnóstico v8 anterior de `e/k`
  inmediatamente después del descifrado y después del mapeo, solo
  mediante contadores de presencia y estados autorizados.

## Interpretación correcta

El panel muestra la **ventana reciente** de hasta 240 eventos.
Las observaciones de `fetch/XHR` y `webRequest` pueden representar la
misma solicitud: el panel presenta los recuentos separados en lugar de
sumarlos como tráfico nuevo. El identificador `traza` es temporal y
se usa para correlacionar envío/respuesta dentro del mismo observador.

El informe descargado con **Copiar informe** tiene `version: 9` y
mantiene `resumen` como texto y `events` como eventos saneados.
El comparador del Laboratorio acepta el campo `resumen` sin necesitar
acceso a los valores de las credenciales.

## Lo que deliberadamente NO hace

- No almacena valores de `Authorization`, `Cookie`, `Set-Cookie`,
  peticiones con tokens, cabeceras originales, cuerpos JSON, contraseñas,
  claves de cifrado, URL completa o parámetros de consulta.
- No intercepta, descifra ni altera TLS.
- No observa el tráfico de otros dominios ni todas las páginas del
  navegador; solo rutas de API de KAIZEN observables desde su extensión.
- No cubre automáticamente IPC interno de Electron, procesos externos,
  la totalidad de Service Workers, WebSocket frames ni cuerpos
  comprimidos. Un campo `sin-dato` significa *no observado*.
- No cambia `isLock`, roles, permisos, inicio de sesión, respuestas
  del servidor, cifrado, descifrado o comportamiento de autocompletado.
- No utiliza cookies o credenciales de tarjetas restringidas.

## Comprobación práctica

1. Abrir un perfil Chromium de KAIZEN, entrar en una de las extensiones
   mediante una sesión propia y pulsar **Diagnóstico**.
2. Usar **Borrar eventos** para iniciar una observación nueva.
3. Recargar el catálogo y abrir de nuevo Diagnóstico.
4. Revisar los renglones **Supervisor** y el bloque de `e/k`.
5. Si hay una tarjeta **autorizada** con problemas, hacer clic y revisar
   el informe de ese flujo sin copiar secretos.
6. Repetir por separado en Principal, Google y Custom.

## Validación

- `node app/tests/catalog-diagnostic-v2-runtime.js`
- `node app/tests/catalog-autofill-diagnostic-scenarios.js`
- `node app/tests/lab-1542-integration-scenarios.js`

Se incluyen casos ficticios de JSON, XML, compresión, tamaños y
cabeceras con marcadores secretos para comprobar que únicamente
sobreviven los metadatos saneados.
