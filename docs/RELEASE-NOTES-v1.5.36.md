# KAIZEN PC 1.5.36 — Auditoría final de procedencia de e, k e isLock

## Objetivo

Localizar, sin cambiar el servidor, **el primer punto observable** donde los datos `e`, `k` e `isLock` llegan disponibles, faltan, están vacíos o aparecen restringidos. Esta edición completa el trazador de comunicación de 1.5.35 con una comprobación nueva entre descifrado y mapeo del catálogo.

## Recorrido original confirmado en el código

1. La extensión inicia sesión usando `POST /api/users/login`, incluida la propiedad `client` definida por cada perfil. Principal declara `extension`; Google `extension_google`; Custom `extension_custom`.
2. La interfaz pide el catálogo con `GET /api/products/getmostusedtool`, enviando token de sesión, categoría/subtítulo, búsqueda y paginación.
3. El servidor devuelve `products` cifrado. El paquete JavaScript lo descifra, luego ejecuta `JSON.parse`.
4. **Nuevo observador `origen-tras-descifrado`:** recibe únicamente indicadores booleanos calculados en el mismo punto donde aparecen por primera vez los objetos JSON. Se ejecuta **antes** de la transformación React.
5. El cliente transforma cada objeto únicamente mediante `{...producto,active_users:producto.activeUsersCount??0}`. La propiedad `e`, `k` o `isLock` no se elimina en esa transformación.
6. El observador existente `productos-descifrados` mide presencia en los objetos transformados. El diagnóstico compara los conteos de ambos puntos.
7. La selección de la tarjeta llama a la función original con `d,e,k,proxy,id,locked,lm`; `locked` depende de `isLock` y de la condición premium.
8. Si está restringida, la extensión abre únicamente su URL pública. Si está autorizada, sigue el mecanismo original de sesión cookie o credenciales, sin cambio alguno.
9. El diagnóstico existente muestra los eventos posteriores de `product` (presencia booleana), apertura de ventana, vinculación de pestaña y formulario.

## Nuevos contadores de datos brutos tras descifrado

Los valores numéricos agregados son:
- `eProp`, `kProp`: objetos donde existe la propiedad exacta.
- `eValue`, `kValue`: propiedades con texto no vacío.
- `eEmpty`, `kEmpty`: cadena vacía.
- `eNull`, `kNull`: valor JSON nulo.
- `eSpaces`, `kSpaces`: solo espacios en blanco.
- `eOther`, `kOther`: tipo distinto de cadena, no nulo.
- `lockProp`: existe la propiedad exacta `isLock`.
- `lockTrue`, `lockFalse`: su valor booleano; `lockOther`: presente con tipo diferente de booleano no nulo.
- `premium`: objetos con `is_premium===true`.

Los datos de diagnóstico **no contienen correos, contraseñas, IDs de producto, cookies, URLs, tokens, respuesta cifrada, texto descifrado ni valores de propiedades**.

## Interpretación

| Resultado | Qué demuestra |
| --- | --- |
| `eProp=0` / `kProp=0` en origen | Los objetos JSON observados después de descifrar no contienen esos **nombres exactos**. La transformación del catálogo no es la causa. No descarta nombres alternativos ni datos entregados por otro canal. |
| Propiedad presente, pero `eValue=0` / `kValue=0` | El nombre existe, pero no contiene texto utilizable; ver contadores vacío/nulo/otro tipo. |
| Texto disponible en origen, pero no después del mapeo | Hay una diferencia que exige revisar mapeo, tipos y recorrido del cliente. |
| `lockTrue=236` tras descifrar y `bloqueoExplicito=236` después del mapeo | La restricción ya estaba presente en los objetos descifrados; no la creó el mapeo React. |
| Sin llamadas nuevas tras clic restringido | La apertura pública no pidió otra sesión en los canales observados. La red de background/Electron puede tener límites de visibilidad. |

## Comprobación de cuentas y permisos

Para estudiar diferencias de autorización sin modificar el servidor:
1. Usar una cuenta propia con permisos comprobados y abrir la **misma** herramienta en el programa donde sí funciona.
2. Comparar el tipo de cliente, inicio de sesión, códigos HTTP de verificación de sesión, `origen-tras-descifrado`, `productos-descifrados` y el clic.
3. Si la cuenta autorizada obtiene campos donde KAIZEN PC no, corregir exclusivamente una incompatibilidad documentada del cliente con el contrato de servidor.
4. Si el servidor devuelve `isLock:true` y no incluye credenciales en los objetos o en un mecanismo autorizado, no es posible reconstruirlas ni obtener permisos nuevos desde el cliente. Se mantiene la restricción.

**Nunca se alteran permisos, se fuerza `isLock:false`, se reutilizan credenciales de otras cuentas ni se evitan controles de acceso.**

## Uso del diagnóstico

Abrir el perfil Principal y el catálogo. Pulsar **Diagnóstico → Borrar eventos**, recargar el catálogo, seleccionar una tarjeta autorizada o de prueba, y pulsar **Copiar informe**. El formato exportado ahora indica `version:6`. Los eventos `origen-tras-descifrado` y `productos-descifrados` deben poder compararse por número de lote.

## Alcance y compatibilidad

Mismos endpoints y mismo servidor. Sin cambios a EX1/EX2, background, permisos, cookies, `contentScript.js` ni autocompletado. Solo se añade un observador booleano en el punto posterior a JSON.parse en las interfaces Principal, Google y Custom. Mantiene toda la instrumentación de comunicación de 1.5.35. La instalación en Windows y los cinco paquetes reales deben superar las comprobaciones de GitHub Actions antes de anunciar un nuevo instalador.
