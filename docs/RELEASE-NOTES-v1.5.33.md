# KAIZEN PC 1.5.33 — Diferenciar botón CÓDIGOS de tarjetas

## Hallazgo

El botón «CÓDIGOS» en la cabecera no pertenece al catálogo de herramientas. Llama a la función original de apertura de email con `reuseSession:true`. Las tarjetas del catálogo usan otro disparador y algunas muestran «Requiere acceso» si el servidor restringe su sesión gestionada.

El diagnóstico anterior podía atribuir a una tarjeta una escritura posterior en `chrome.storage.local.product`, porque conservaba el identificador del último clic sin límite al registrar cambios del almacenamiento. Eso explica la confusión al ver `ek:true` sin una tarjeta seleccionada recientemente.

## Correcciones

- `clic-codigos` registra el botón CÓDIGOS de forma independiente.
- `clic-tarjeta` continúa representando exclusivamente tarjetas de herramientas.
- Las escrituras `sesion-temporal-preparada` incluyen origen: `codigos`, `tarjeta` o `sin-asociar`.
- La asociación de una sesión a una acción solo se hace si esta se observó en los últimos 20 segundos; los clics antiguos no atribuyen sesiones futuras.
- El resumen identifica claramente qué acción se ejecutó y no presenta CÓDIGOS como si fuera una tarjeta.
- La eliminación de la sesión usa el origen de la sesión creada (si lo observó), no el último clic posterior.

## Intacto

No se modifican las condiciones `isLock`, los controles de autorización del servidor, ni la funcionalidad original de `product`, `contentScript.js` o EX1/EX2. El diagnóstico nunca registra valores de contraseña, correo, cookies ni tokens.

## Pruebas

Regresión de tres perfiles, apertura con callback o Promise y prueba de clic en CÓDIGOS con `ek` presente pero `e/k` ausentes. La compilación e instalación del Setup dependen de GitHub Actions Windows.
