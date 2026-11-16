# KAIZEN — Diagnóstico de conexión de catálogo y autocompletado

## Hallazgos verificables
- La extensión abre la interfaz y utiliza el token ya existente de la sesión en
  `GET /api/products/getmostusedtool`.
- El backend entrega un bloque cifrado `products`; la extensión lo descifra y
  conserva `isLock`. Un HTTP 200 prueba comunicación, **no** autorización.
- Si una tarjeta figura como `Requiere acceso` o `NO AUTOMATIZAR`, la ruta
  original no crea la sesión temporal `chrome.storage.local.product`.
- Solo en tarjetas autorizadas, el cliente prepara una sesión con una URL de
  destino y los valores que el backend entregó. El content script debe
  identificar un formulario compatible en ese dominio.
- No se ha recibido el código del backend ni evidencia que permita identificar
  por qué una cuenta real tiene determinadas tarjetas bloqueadas.

## Reparación de confiabilidad
Las extensiones Principal, Google y Custom ejecutan el mismo módulo
`catalog-api-retry.js`. Envuelve **solo** la lectura autenticada de productos,
sin cambiar URL, token, encabezados, permisos ni el cuerpo de la petición.
Hace como máximo dos reintentos de 350 y 900 milisegundos cuando el error es de
red transitoria o HTTP 502/503/504. Respeta la cancelación del usuario.
No reintenta 400, 401, 403 ni 429, y no intenta recuperar campos omitidos por
el backend. Evita repetir solicitudes de cambio de estado o login.

El panel **Diagnóstico** ahora explica el último HTTP registrado para productos:
- 200: llegó una respuesta; comprobar si las tarjetas figuran bloqueadas.
- 401: sesión vencida/token rechazado; volver a iniciar sesión.
- 403: permisos denegados por el backend.
- 429: límite de peticiones; no reintentar en bucle.
- 502/503/504 u otros 5xx: posible problema temporal del servidor.
- 0: posible error de red, DNS, proxy o bloqueo de conexión.

## Prueba sin compartir secretos
1. Abrir Principal en Chromium y pulsar **Diagnóstico → Borrar eventos**.
2. Recargar el catálogo; comprobar el apartado **Conexión API (productos)** y
   **Acceso según respuesta**.
3. Si aparece una tarjeta propia **sin** etiqueta `Requiere acceso`, abrirla,
   esperar a que cargue su formulario y pulsar **Actualizar** en el diagnóstico.
4. Examinar **Sesión product**, **Pestaña** y **Formulario** para distinguir una
   ausencia de datos autorizados de un fallo de detección de campos.
5. Pulsar **Copiar informe** y compartir solo ese reporte reducido. **No**
   compartir cookies, tokens, respuesta API, contraseñas, correos ni datos de
   identificación personal.

El informe registra únicamente indicadores, contadores, tipo de error y tiempos;
no incluye los secretos necesarios para iniciar sesión.

## Límite
Si la API entrega `isLock=true` para una tarjeta o carece de credenciales
para el producto, los cambios de cliente **no** pueden hacer funcionar su
autocompletado: deben revisarse los permisos o la respuesta del backend para
un producto legítimamente autorizado. No se desactivaron EX1/EX2, ni se
alteraron las rutas de acceso o autenticación del servidor.

**Validación pendiente:** la prueba de regresión simula fallos del catálogo,
pero no sustituye una sesión real contra el backend ni pruebas de formulario
en sitios autorizados. No publicar instalador sin revisión final.
