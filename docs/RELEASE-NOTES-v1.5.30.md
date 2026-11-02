# KAIZEN PC 1.5.30 — Diagnóstico detallado de apertura y autocompletado

## Qué cambia

Se amplía el botón **Diagnóstico** dentro de los catálogos de KAIZZEN-MAIN, KAIZZEN-GOOGLE y KAIZZEN-CUSTOM. Ahora informa el recorrido de una tarjeta, sin modificar la política del servidor:

1. `catalogo-envio`: método de solicitud y transporte (fetch/XHR).
2. `catalogo-respuesta`: HTTP, duración, cantidades y estructura reconocida del catálogo (raíz / data / result / payload), sin incluir los datos originales.
3. `clic-tarjeta`: identificador aleatorio de flujo, que no es el ID de la tarjeta.
4. `apertura-solicitada`, `apertura-confirmada`, `apertura-error`: observación del intento de abrir una página mediante los mecanismos originales de Chromium, sin registrar su URL.
5. `chromium-ventana-detectada`: detección de nueva ventana mediante la API de Chrome, cuando está disponible.
6. `sesion-temporal-preparada` o `sesion-temporal-eliminada`: registra solo presencia de componentes autorizados, no sus valores.
7. `script-formulario-activo`, `formulario-observado`, `formulario-con-campos-rellenos` o `formulario-sin-sesion`: distingue la carga del observador de los campos y los resultados observables.

El panel muestra un resumen legible del flujo y permite **Copiar informe**, **Actualizar** y **Borrar eventos**. Los eventos se guardan con claves independientes para evitar que dos páginas sobrescriban sus registros.

## Privacidad y permisos

- No se guardan ni copian contraseñas, correos, tokens, cookies, proxy, URL de destino ni respuestas completas.
- No se modifican EX1, EX2 ni el código original `contentScript.js` del autocompletado.
- Las tarjetas bloqueadas continúan bajo los permisos del servidor. Una página abierta no implica autorización de acceso.
- Detectar campos con contenido **no confirma** quién los completó; esta distinción se mantiene explícita.

## Comprobaciones

La compilación ejecuta pruebas de sintaxis, validación de extensiones y una simulación de clic, apertura de Chromium, respuesta de catálogo y formulario para comprobar que ningún secreto entra al informe.

**El EXE debe pasar la instalación en Windows antes de publicarse**. Un instalador correcto no prueba autenticación en sitios externos: el flujo completo se verifica con una tarjeta autorizada en una prueba real.
