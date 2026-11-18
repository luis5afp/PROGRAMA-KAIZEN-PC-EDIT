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

## Captura cronológica desde la carga hasta el clic

El script `catalog-diagnostic.js` se ejecuta antes del módulo React. La
marca `diagnostico-catalogo-iniciado` se registra ahora durante la
inicialización del observador, **sin esperar a DOMContentLoaded**.

La captura segura sigue estos eventos:

1. `captura-productos-iniciada`: inicia una petición real
   `getmostusedtool`. Se guardan solo `ciclo`, `traza`, transporte y método.
2. `comunicacion-http-respuesta`: estado HTTP y formato de respuesta, sin
   conservar cabeceras completas ni URL completa.
3. `productos-sobre-recibido`: antes del descifrado en la lógica del
   cliente se examina únicamente el **sobre JSON externo**. Se registra
   si contiene la propiedad `products`, su tipo (`texto`, `nulo`,
   `ausente`, `lista` u `otro`), y si existe `hasMore`.
   El texto cifrado **nunca se guarda ni se copia**.
4. `origen-tras-descifrado`: el hook actual, inmediatamente después de
   `JSON.parse(await Gh(...))`, cuenta `e/k` presentes, nulos,
   vacíos y con texto. Este hook **no recibe valores**.
5. `productos-descifrados` y `conciliacion-campos`: comparan
   las marcas booleanas antes y después del mapeo.
6. `tarjeta-campos-al-clic`: añade el lote y ciclo recientemente
   observado a los estados booleanos del clic; los eventos de
   apertura, pestaña y formulario se asocian mediante `flujo`.

Cuando existe exactamente una respuesta de productos candidata en
los 15 segundos anteriores al hook descifrado, el vínculo es
`temporal-unico`. **Es solo una asociación temporal**: no prueba
que un paquete concreto generase un JSON determinado. Con varias
respuestas o ninguna, el vínculo es `no-identificable`.
No se usa para conceder acceso ni para recuperar credenciales.

Los informes v9 exportados ahora se limitan a eventos desde la
última `diagnostico-catalogo-iniciado` que aún permanezca en la
ventana de retención. Esto evita mezclar automáticamente
observaciones de una carga anterior.

**Límite de certeza:** el cliente puede ver el sobre cifrado antes
del descifrado, y el esquema después del descifrado, pero no puede
inspeccionar la preparación anterior al cifrado dentro del backend
sin código o registros del servidor **obtenidos con autorización**.
Los valores `e/k` nulos en el JSON descifrado no implican que el
navegador los haya borrado, ni prueban la razón del filtrado backend.

El informe indica «no evaluable: ninguna tarjeta autorizada» si
el lote no contiene tarjetas autorizadas; un cero de pérdida en esa
situación no prueba que el autocompletado esté funcionando.
