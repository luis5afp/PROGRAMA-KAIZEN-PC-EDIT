# KAIZEN PC 1.5.41 — Diagnóstico v8 de integridad del catálogo

## Alcance

Instrumentación de observación **solo de metadatos**, idéntica en KAIZZEN_MAIN,
KAIZZEN_GOOGLE y KAIZZEN_CUSTOM. No modifica solicitudes HTTP, autenticación,
descifrado, `isLock`, rutas de apertura, cookies, sesiones ni autocompletado.
No autoriza el uso de credenciales de tarjetas restringidas.

## Orden real observado

1. El servidor responde a `GET /api/products/getmostusedtool` con un bloque `products` cifrado.
2. La extensión descifra y ejecuta `JSON.parse`.
3. `__kzDiagnosticRawBatch` recibe **solo booleanos**, antes de mapear los objetos.
4. Se aplica la transformación original y los alias **solo para productos autorizados**.
5. `__kzDiagnosticProductBatch` recibe **solo booleanos** después del mapeo.
6. `conciliacion-campos` correlaciona ambas observaciones por número de lote y
   orden, usando información booleana **transitoria en memoria**.

## Campos nuevos del informe

- `autorizadasOrigen`, `restringidasOrigen`: número de objetos clasificados con el
  estado que ya traían del catálogo, no roles de usuario confirmados en el backend.
- `restringidasSinParOrigen`: restringidas que no tienen simultáneamente
  `e` y `k` con texto. `restringidasConEOrigen` y `restringidasConKOrigen`
  son **solo contadores**.
- `autorizadasConParOrigen` y `autorizadasConParFinal`: disponibilidad de
  ambos campos en el grupo clasificado como autorizado, antes y después del mapeo.
- `perdidaEAutorizada` y `perdidaKAutorizada`: tarjetas autorizadas en ambas
  etapas que tenían campo no vacío y que ya no muestran campo presente después.
- `gananciaEAutorizada` y `gananciaKAutorizada`: cambios de presencia en sentido inverso,
  por ejemplo mediante alias; *no prueban* que el campo sea válido para inicio de sesión.
- `cambioBloqueo`: diferencias de estado calculado dentro del mismo lote.
- `conciliacion-campos` aparece únicamente si ambos hooks se ejecutan con
  el mismo número de objetos; si no, el informe deja el resultado como pendiente.

Los valores de producto, URL, identificador, correo, contraseña, token, cookie,
texto cifrado y cabeceras HTTP **nunca se introducen en estos hooks ni en el informe**.

## Procedimiento para revisar una cuenta propia

1. Abrir una de las tres extensiones con la sesión autorizada que ya posees.
2. Abrir el panel **Diagnóstico** y limpiar los eventos anteriores si deseas aislar la prueba.
3. Recargar el catálogo; abrir de nuevo el panel y consultar **Acceso en objetos descifrados**
   e **Integridad de tarjetas autorizadas**.
4. Si una herramienta **autorizada** no rellena los campos, pulsarla y comprobar
   la sección de formulario del mismo flujo, sin copiar credenciales.
5. Repetir en cada variante que sea relevante. Exportar **Copiar informe** para
   compartir únicamente las métricas sanitizadas.

## Interpretación y límites

- Si `perdidaEAutorizada` o `perdidaKAutorizada` supera cero,
  existe una pérdida observable en la transformación de productos autorizados;
  se debe investigar el código del cliente.
- Si `restringidasSinParOrigen` cubre todas las tarjetas restringidas
  del lote, no hay un par utilizable `e/k` en esas tarjetas inmediatamente
  después del descifrado. Quitar `isLock` no generaría datos ausentes.
- No se puede deducir el motivo de la omisión desde el cliente, ni si el backend
  almacena tales credenciales en otras fuentes. Hace falta código del servidor
  o registros de servidor obtenidos con autorización.
- La medición posterior utiliza la presencia booleana del bundle (`!!e`/`!!k`);
  cadenas de espacios o alias pueden producir una diferencia aparente. La pérdida
  de un valor originalmente no vacío sí amerita investigación.
- La clasificación de una tarjeta por `isLock` **no demuestra** qué comprobaciones
  de permisos se aplicaron en el backend.
- Los datos restringidos **no se usan para iniciar sesión** y no se modifican
  restricciones de acceso en este cambio.

## Validaciones previstas

- `node app/tests/catalog-diagnostic-v2-runtime.js`
- `node app/tests/catalog-autofill-diagnostic-scenarios.js`

El test de ejecución incluye dos lotes simulados de metadatos: uno con
campos autorizados conservados y otro con pérdida deliberada de `e`
en una tarjeta autorizada. También comprueba que ningún dato sensible
de la simulación aparezca en el registro.
