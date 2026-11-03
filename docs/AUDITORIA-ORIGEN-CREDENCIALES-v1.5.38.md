# KAIZEN PC 1.5.38 — Auditoría de procedencia de credenciales (solo lectura)

## Qué está demostrado por el código de las tres extensiones

**Solicitud inicial y autorización.** La UI envía el token autenticado y los parámetros de filtros/paginación a `GET /api/products/getmostusedtool`. En esta solicitud no envía el resultado de `isLock` de cada tarjeta. El servidor responde con `products` cifrado. La UI descifra el bloque, ejecuta `JSON.parse` y obtiene los productos. El cliente **no descifra individualmente tarjetas autorizadas o restringidas** dentro de este recorrido.

**Transformación de los datos.** El mapeo original utiliza `{...producto, active_users: producto.activeUsersCount ?? 0}` y desde 1.5.37 agrega alias de campos **solo para tarjetas autorizadas**. Ese mapeo no borra `e`, `k` ni `isLock`. Los diagnósticos v5 anteriores mostraron 236 tarjetas con `isLock=true`, 0 valores disponibles en `e/k` después de ese mapeo. Esto permite descartar que el mapeo normal esté eliminando credenciales no vacías con esos nombres exactos. No permite inferir *por qué* el servidor devolvió esos objetos ni si otras propiedades contienen datos alternativos.

**Las dos rutas al abrir.** La llamada a la apertura pasa `d,e,k,proxy,id,kZ(producto),lm`. La condición `kZ` consulta `isLock` y premium. Si la tarjeta está restringida, la función abre la URL pública y retorna antes de preparar `chrome.storage.local.product`. Si ya está autorizada, usa los datos del producto previamente descifrado para preparar `product`; no hay en esa rama una petición dedicada a descargar `e/k` de la misma tarjeta. El modo `cookie` sí puede utilizar su propio mecanismo adicional para sesiones autorizadas.

**Autocompletado.** En el content script, una sesión `product` debe existir, estar vigente, corresponder al dominio y ofrecer datos de correo/clave utilizables. Una clave cifrada `ek` por sí sola no equivale a credenciales completas. El informe CÓDIGOS anterior mostraba `ek=true,e=false` y ningún campo de login detectado: no era una prueba de tarjeta del catálogo.

## Qué no puede demostrarse sin acceso a evidencias del servidor

No contamos con el código del controlador backend, la base de permisos ni una respuesta comparativa obtenida de **otra sesión legítimamente autorizada** sobre el mismo producto. Por eso NO está confirmado al 100 % que el backend esté omitiendo `e/k` **por falta de permisos**, aunque es una hipótesis compatible con lo observado. La recepción de HTTP 200 significa que se atendió la petición, no que se concedieran credenciales de todos los productos. El tipo de cliente y el token deben ser los válidos para la cuenta real; no es válido modificar `isLock` en el cliente ni suplantar un perfil privilegiado para obtener datos restringidos.

## Diagnóstico v7: dónde nacen los campos

`origen-tras-descifrado` es una medición de indicadores *booleanos* dentro de los objetos recién producidos por `JSON.parse`, antes de construir las tarjetas.

- `eProp/kProp`: cuántos productos tienen exactamente esas propiedades.
- `eValue/kValue`: cuántos productos tienen texto utilizable bajo esos nombres.
- `eEmpty/kEmpty`, `eNull/kNull`, `eSpaces/kSpaces`, `eOther/kOther`: cómo están representados los campos.
- `eAlias/kAlias`: cuántos productos contienen al menos uno de los nombres alternativos reconocidos por la versión 1.5.37 (solo **presencia**, nunca el valor).
- `ekPresente`: cuántos productos contienen una propiedad `ek` de tipo cadena no vacía.
- `lockProp/lockTrue/lockFalse/lockOther`, `premium`: indicadores originales de restricción y modo premium.

El evento `productos-descifrados` mide los objetos usados para construir las tarjetas. `tarjeta-campos-al-clic` y los eventos de `product`, pestaña y formulario permiten seguir el flujo posterior de un clic. Los eventos HTTP y de mensajes entre UI/background identifican peticiones observadas, con límites de cobertura explícitos.

**No se copian contraseñas, correos, tokens, cookies, dominios, nombres, identificadores, claves ni texto cifrado.** Tampoco se toca `isLock`, el login, la obtención del token, los endpoints, los permisos, EX1/EX2 ni el autocompletado original.

## Matriz de interpretación

| Datos en origen | Estado después | Diagnóstico compatible |
| --- | --- | --- |
| `eValue=0,kValue=0,eAlias=0,kAlias=0` | 0 en catálogo | Ninguno de los nombres comprobados tenía credenciales útiles en esos objetos recién descifrados. No desaparecieron por el mapeo. |
| `eProp=0,kProp=0`, alias > 0 | Según estado de tarjetas | Esquema con nombres alternativos; compatibilidad en productos **autorizados**. |
| `eValue/kValue>0` | 0 después | Incompatibilidad o procesamiento a revisar en cliente. |
| `lockTrue=236` antes y después | 236 bloqueadas | La restricción ya figura en el JSON descifrado, no la inventa el renderizador. |
| Producto autorizado con `e/k` y `product` vigente | No rellena formulario | Revisar dominio, tipo de login, renderizado tardío, iframe/SSO y content script. |
| Cuenta autorizada y otra no autorizada dan respuestas distintas para el mismo producto | Diferentes permisos | Apoya la hipótesis de filtrado del backend; confirmación causal exige evidencia de backend o reglas del proveedor. |

## Cómo obtener una conclusión reproducible

1. Abrir una extensión real y una cuenta propia. En **Diagnóstico**, pulsar **Borrar eventos**; recargar catálogo y exportar el informe **version:7**.
2. Revisar `origen-tras-descifrado` y `productos-descifrados` del mismo `lote`. No exportar DevTools ni solicitudes crudas con headers.
3. Pulsar una sola tarjeta **autorizada** y exportar el diagnóstico completo, con `flujo`, `product`, pestaña y formulario. No confundir el botón **CÓDIGOS** con una tarjeta.
4. Si existe una segunda cuenta con permisos legítimos comprobados sobre **el mismo producto**, repetir con el mismo perfil/versión de extensión. Comparar solamente contadores y estados de acceso. No compartir contraseñas ni tokens.
5. Si no hay cuenta autorizada ni acceso al backend, el diagnóstico puede demostrar que los valores están ausentes de la respuesta descifrada de la cuenta observada, pero **no puede probar el motivo exacto por el que el servidor no los entregó**.

**Límite de seguridad:** no falsificar permisos ni modificar la ruta restringida para conseguir credenciales de terceros. La corrección legítima consiste en reparar los datos de una sesión autorizada o su tratamiento en cliente.
