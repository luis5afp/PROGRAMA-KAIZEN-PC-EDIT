# KAIZEN PC 1.5.32 — Diagnóstico del recorrido de campos por tarjeta

## Causa encontrada

El diagnóstico 1.5.31 solo inspeccionaba `/api/shops/extension`, cuyo `normal` y `premium` representan categorías y no necesariamente tarjetas con credenciales. En la extensión original, los productos se cargan por separado desde `/api/products/getmostusedtool` y llegan cifrados; luego se descifran en la interfaz mediante `Gh`/`Ih` antes de representar las tarjetas.

## Nuevo diagnóstico de extremo a extremo

- `catalogo-envio` y `catalogo-respuesta`: número de **categorías** recibidas.
- `productos-envio` y `productos-respuesta`: HTTP, si el servidor devolvió un bloque cifrado y si hay más páginas. **Nunca** se guarda el bloque cifrado.
- `productos-descifrados`: cantidad de productos descifrados en cada lote y conteos agregados de presencia de `d`, `e`, `k`, `proxy` y bloqueo.
- `producto-campos`: por índice (máximo 30 por lote), indicadores booleanos para `d`, `e`, `k`, `proxy`, `lm`, `id`, `isLock`, `locked` y `cookie`.
- `tarjeta-campos-al-clic`: metadatos booleanos de **la tarjeta exacta** pulsada, antes de ejecutar la lógica original de apertura.
- `sesion-temporal-preparada`, `pestana-vinculada` y los eventos del formulario se mantienen para localizar dónde se interrumpe el flujo.

Se agregaron dos llamadas de **observabilidad** a cada bundle (justo después de descifrar el lote y antes del manejo original del clic). Solo envían booleanos, no pasan el objeto de producto, URL, usuario ni contraseña. Mantienen intactos los argumentos y el retorno de la función original de apertura.

## Autorización y privacidad

El comportamiento original de `isLock`, `product`, `chrome.windows.create`, `contentScript.js`, EX1, EX2 y permisos del servidor **no cambia**. Si la tarjeta está restringida, la página puede abrirse públicamente sin sesión gestionada, según el código original.

Las pruebas verifican la instrumentación en los tres perfiles, los dos endpoints y que ningún valor sensible ni ciphertext se escriba en el informe.

## Prueba manual

Abrir el diagnóstico antes de cargar el catálogo, actualizarlo y pulsar una tarjeta. Revisar `productos-respuesta` → `productos-descifrados` → `tarjeta-campos-al-clic` → `sesion-temporal-preparada` (solo si está autorizada) → `pestana-vinculada` → observación del formulario.

En el informe `d/e/k = true` significa *presencia*, no que se haya efectuado autocompletado ni que exista permiso de acceso.
