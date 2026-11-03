# KAIZEN PC 1.5.37 — Compatibilidad de correo/contraseña para autocompletado autorizado

## Problema

El diagnóstico anterior muestra que el botón **CÓDIGOS** prepara una sesión con `ek` cifrada, pero sin `e` o `k`, y la página observada no contiene campos de correo/clave; **CÓDIGOS no es una tarjeta de herramientas**.

En el catálogo de herramientas, las respuestas observadas con la cuenta actual entregaron `isLock=true` en las 236 tarjetas, sin valores `e` y `k`. Un token aceptado para consultar el catálogo no demuestra autorización para recibir las credenciales de cada herramienta.

## Corrección funcional

Se añade `authorized-field-aliases.js` en Principal, Google y Custom, cargado **antes del módulo de catálogo**. Después de descifrar `products` y antes de representar cada tarjeta, si el producto está **autorizado** según la misma regla original de `isLock`/premium, el adaptador puede reconocer:

| Campo original requerido | Nombres alternativos aceptados |
| --- | --- |
| `e` (correo) | `email`, `correo`, `loginEmail`, `login_email`, `user_email` |
| `k` (contraseña) | `password`, `clave`, `contrasena`, `contraseña`, `pass`, `pwd` |

- Se prefieren siempre los valores **existentes** de `e`/`k`.
- Solo se aceptan valores de texto no vacíos; se conserva exactamente la contraseña, incluyendo espacios significativos.
- Si `isLock` está activo o la herramienta premium no está explícitamente habilitada, el adaptador no devuelve ningún valor.
- El modo `cookie` queda separado e intacto.
- No se alteran `isLock`, el token, la petición al servidor, la lógica de apertura, ni el mecanismo existente de `chrome.storage.local.product` y `contentScript.js`.
- No se escriben credenciales a archivos, diagnósticos, reportes ni al almacenamiento adicional: el adaptador solo completa propiedades en memoria para las tarjetas ya habilitadas.

## Resultados posibles

1. **Cuenta autorizada y backend devuelve `email/password` (o `correo/clave`)**: la tarjeta utiliza `e/k` correctamente y se envían al flujo original de apertura/autocompletado.
2. **Cuenta autorizada y backend ya devuelve `e/k`**: el adaptador no cambia nada; se conserva el camino original.
3. **Cuenta restringida con `isLock=true`**: no hay sustitución ni aumento de acceso. Se sigue abriendo la URL pública sin autocompletado gestionado.
4. **Credenciales ausentes en todos los nombres admitidos**: no pueden generarse desde el cliente. Revisar `origen-tras-descifrado` del diagnóstico 1.5.36 y la autorización de la cuenta.
5. **Sitio con formulario distinto (iframe, JavaScript, SSO)**: requiere prueba separada en una tarjeta autorizada para ajustar selectores o tiempos del content script sin exponer contraseñas.

## Cómo comprobar el resultado

1. Abrir una cuenta propia que ya tenga autorización sobre al menos una herramienta de ejemplo.
2. Recargar el catálogo y observar `Productos (tras descifrar)`, `Tarjeta pulsada` y `Sesión product`.
3. Pulsar **esa tarjeta autorizada** (no CÓDIGOS), verificar que existe el correo y la clave, y que el formulario aparece en la URL correcta.
4. Si la cuenta sigue mostrando `236 bloqueos explícitos`, el problema de permisos continúa; ningún adaptador de nombres ni token de consulta del catálogo desbloquea las credenciales.

## Pruebas

`app/tests/authorized-field-aliases-scenarios.js` valida variantes de nombres, prioridad de campos originales, ausencia de mutación, no acceso a productos restringidos/premium, exclusión del modo cookie, preservación de contraseñas y carga de los adaptadores en las tres extensiones.

El instalador Windows con los cinco paquetes reales requiere pasar las pruebas GitHub Actions.
