# KAIZEN PC 1.5.31 — Diagnóstico de ventana/pestaña desde la raíz

## Diagnóstico confirmado en código fuente

KAIZEN PC (Electron) inicia perfiles de Chromium aislados con la extensión de catálogo correspondiente y EX1/EX2. Dentro del perfil seleccionado, las tarjetas usan `chrome.windows.create` para abrir otra ventana del mismo perfil.

La lógica original tiene dos rutas:
- Tarjetas restringidas: abre únicamente la URL pública; no crea `product`, no transfiere credenciales y no intenta el inicio de sesión gestionado.
- Tarjetas autorizadas: guarda `product` con la sesión temporal antes de abrir la ventana; el `contentScript.js` original de la extensión puede usar además `autofillSession`.

## Corrección del observador

- Se enlaza la ventana realmente creada por su `windowId` y la pestaña por `tabId`. Se soportan las dos variantes de `chrome.windows.create`: Promise y callback.
- Una vez que se crea la pestaña, el catálogo envía exclusivamente una señal de diagnóstico (`kz-diagnostic-bind-v3`) a esa pestaña mediante `chrome.tabs.sendMessage`, con reintentos breves mientras carga el sitio.
- El observador del formulario **no supervisa páginas sin esa señal**. Esto evita asignar al último clic los eventos de una pestaña ajena.
- Eventos adicionales: `pestana-identificada`, `pestana-vinculada`, `pestana-sin-respuesta`, `diagnostico-pestana-activa`.
- Se distingue entre `product` ausente, caducado y con marca de tiempo no válida; también se informa de la existencia de una sesión de respaldo, sin almacenar su contenido.
- El resumen integrado separa ventana creada, pestaña vinculada, producto preparado y formulario realmente observado.

## Integridad

No cambia el código de autocompletado de `contentScript.js`, ni la lógica de autorización de las tarjetas. No toca EX1 ni EX2. Las señales y reportes no contienen correos, contraseñas, cookies, tokens, URLs de destino ni respuestas completas del servidor.

Los eventos muestran qué ocurrió en la pestaña observada, pero el hecho de que un campo tenga contenido **no prueba que la extensión lo escribió**.

## Validación

Pruebas automáticas para los tres perfiles: sintaxis, recorrido de apertura con Promise y con callback, señal exclusiva por tab y protección de datos ficticios. Se ejecutan en GitHub Actions junto al empaquetado, instalación silenciosa e integridad del Setup en Windows.

Para probar: abrir un perfil, pulsar «Diagnóstico» en el catálogo, escoger una tarjeta **autorizada** y copiar el informe cuando termine la carga de la ventana. Los registros deben contener `pestana-vinculada` y `diagnostico-pestana-activa`. Una tarjeta restringida puede producir `formulario-sin-sesion` de manera esperada.
