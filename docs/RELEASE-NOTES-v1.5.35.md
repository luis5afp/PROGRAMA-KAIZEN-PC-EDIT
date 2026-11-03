# KAIZEN PC 1.5.35 — Diagnóstico de comunicación servidor / extensiones / tarjetas

## Qué investiga

Esta versión añade un trazador de **metadatos** en las extensiones Principal, Google y Custom para responder:

1. ¿Se consulta al servidor al cargar el catálogo?
2. ¿Hay nuevas peticiones HTTP desde la interfaz al pulsar una tarjeta?
3. ¿Qué mensajes envía la interfaz al background de la extensión?
4. ¿En qué momento se descifra el lote y qué campos están disponibles?
5. ¿Se guarda una sesión temporal `product` y la observa la pestaña del formulario?

## Emisores, receptores y etapas

- `comunicacion-http-envio`: `extension-ui` → `servidor-kaizzen`, tipo de ruta, método y transporte (`fetch`/`xhr`).
- `comunicacion-http-respuesta`: `servidor-kaizzen` → `extension-ui`, etiqueta de ruta, estado HTTP y duración.
- `comunicacion-http-error`: fallo técnico de la petición.
- `comunicacion-red-envio`, `comunicacion-red-respuesta` y `comunicacion-red-error`: observación opcional de peticiones HTTP a KAIZZEN mediante el permiso existente `webRequest` de Chromium. Los eventos solo indican ruta clasificada, estado y flujo, nunca origen sensible ni contenido. Pueden duplicar llamadas de UI ya registradas.
- `productos-respuesta` y `productos-descifrados`: presencia del bloque cifrado y disponibilidad booleana de `d`, `e`, `k`, `proxy`, `lm`, `isLock`; nunca se exportan valores.
- `clic-tarjeta` + `tarjeta-campos-al-clic`: mismo `flujo` que las comunicaciones posteriores, si las hay.
- `comunicacion-mensaje-envio` y `comunicacion-mensaje-respuesta`: `extension-ui` ↔ `extension-background`, **solo** nombres de mensaje de una lista permitida, sin parámetros ni contenido.
- `sesion-temporal-preparada` y `sesion-temporal-eliminada`: evento de Chrome storage cuando aparece o desaparece `product`, junto con presencia de campos.
- `comunicacion-formulario-recibida`, `pestana-vinculada`, `script-formulario-activo`: vínculo UI → content script y observación del formulario.

El resumen **Peticiones tras el clic** distingue envíos desde la UI, solicitudes opcionales observadas en la red Chromium y mensajes UI a background. Las cifras HTTP UI y webRequest **pueden solaparse**. Un valor de 0 significa **ninguna petición observada en ese ámbito**, no que otros procesos no hayan contactado el servidor.

## Alcance y límites de observación

- El trazador `fetch`/`XHR` observa las solicitudes de la **interfaz** de la extensión hacia dominios `kaizzen.org` reconocidos. Cuando Chromium permite usar `webRequest` desde esta página, también se observan eventos de red cuyo iniciador es la propia extensión o es desconocido; estos eventos **no identifican con certeza** el proceso emisor ni garantizan cobertura del background. No observa IPC interno del proceso principal Electron.
- Los mensajes de UI a background se registran por etiquetas conocidas; no se inspecciona el contenido del mensaje ni de su respuesta.
- No se guarda **ninguna** URL, cabecera de autorización, token, contraseña, cookie, cuerpo cifrado, ID de producto o dirección de correo.
- Los estados `isLock` y `premium` del servidor **no se cambian**. El diagnóstico no concede acceso ni inventa credenciales.
- El informe usa `version: 5` y se conserva en el almacenamiento local de diagnóstico de la extensión, con botón **Copiar informe**.

## Prueba recomendada

1. Abrir Principal, iniciar sesión y entrar en el catálogo.
2. Abrir Diagnóstico, pulsar **Borrar eventos** y actualizar el catálogo (separar inicio/carga del clic).
3. Pulsar **una sola tarjeta**. Copiar el informe después de que aparezcan ventana y observador de pestaña.
4. Buscar el mismo `flujo` entre `clic-tarjeta`, comunicaciones HTTP o mensajes, `tarjeta-campos-al-clic`, `sesion-temporal-preparada` y `formulario-sin-sesion`.
5. Comparar ese flujo con el botón **CÓDIGOS** (evento `clic-codigos`, que es independiente).

Si el lote contiene 236 tarjetas restringidas sin credenciales, el trazador puede demostrar si el clic dispara alguna nueva comunicación UI; no podrá convertir una restricción del servidor en acceso autorizado.

## Integridad

Se mantienen los cinco paquetes Chromium originales (Principal, Google, Custom, EX1 y EX2). No se introducen endpoints alternativos ni cambian el servidor, la autenticación, la política `isLock`, las cookies, el contenido del paquete cifrado ni el autofill. Se validan los transportes `fetch` y `XHR` y los callbacks/Promises de `sendMessage`.
