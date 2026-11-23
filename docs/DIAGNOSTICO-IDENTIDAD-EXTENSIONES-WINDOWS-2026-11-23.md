# Diagnóstico de identidad por extensión — KAIZEN PC (solo Windows)

## Objetivo y límites
Comprobar si las ventanas independientes **KAIZZEN-MAIN**, **KAIZZEN-GOOGLE** y **KAIZZEN-CUSTOM** utilizan la misma identidad autenticada, sin modificar backend, cuentas, planes, permisos ni tarjetas. Una consulta manual de **GET /api/verify-token** por perfil compara el token ya guardado por esa extensión con el servidor original. Los datos de inicio de sesión no se publican.

El informe no contiene correo, ID real, contraseña, cookies, valor del token, contenido de chrome.storage, ni respuesta HTTP completa. La frase de comparación tampoco se guarda o transmite: se usa como clave HMAC-SHA256 sobre el identificador obtenido de la respuesta verificada. Solo se exportan 12 bytes de su huella criptográfica (24 caracteres hexadecimales), un rol permitido, estado HTTP y metadatos mínimos.

**Advertencia:** el JWT descifrado localmente no equivale a una identidad validada. Solo se puede afirmar que una identidad está verificada cuando `verification` es `servidor-verificado`. Si falla la consulta, `jwt-sin-verificar` puede permitir un indicio local, pero NO confirmar la identidad ni los permisos.

## Uso en KAIZEN PC
1. Instala el **build de pruebas verificado**, una vez que la CI genere el instalador de esta rama. No uses una versión antigua que no contenga los archivos nuevos.
2. Abre MAIN e inicia sesión normalmente con tu cuenta de prueba; haz lo mismo en GOOGLE y CUSTOM si procede. Los tres perfiles de Chromium son independientes: KAIZEN no copia credenciales de uno a otro.
3. Dentro de cada página de la extensión pulsa **Diagnóstico de sesión** (abajo a la derecha). Elige una frase **privada, de al menos 12 caracteres**, y escribe *exactamente la misma* en los tres perfiles. No envíes la frase junto con los informes.
4. Pulsa **Comprobar sesión**. Esta acción realiza como máximo una petición GET a la ruta oficial `/api/verify-token`, sin alterar perfiles ni cambiar de cuenta.
5. Si aparece `servidor-verificado` y una huella de 24 caracteres, pulsa **Descargar informe seguro**. Repite en los otros dos perfiles.
6. Ejecuta en la copia local del repositorio:
   ```powershell
   node app/scripts/compare-extension-session-reports.js "MAIN.json" "GOOGLE.json" "CUSTOM.json"
   ```
   El orden de los archivos no importa; cada uno lleva el nombre de perfil.
7. Adjunta **solo esos tres JSON sanitizados** si necesitas ayuda para interpretar el resultado.

## Interpretar el resultado
- **COINCIDEN**: los tres perfiles tienen la misma identidad *verificada* y utilizaron la misma frase. No implica que alguna tarjeta esté autorizada.
- **DIFIEREN**: al menos dos identidades *verificadas* distintas. Revisa el inicio de sesión de cada perfil, sin sustituir sesiones por tokens de otro usuario.
- **INCONCLUSO**: algún perfil no tiene sesión verificable, no tiene identidad estable disponible o falta una huella; el diagnóstico no intenta suplantar la respuesta.
- Si la fecha `expiresAt` del JWT está presente, se muestra solo como ayuda; la verificación real sigue dependiendo del HTTP y la respuesta oficial.
- La respuesta `/api/verify-token` puede no traer un identificador estable, o puede utilizar campos distintos entre clientes. En ese caso el sistema no deduce que sean cuentas diferentes.

## Sobre el bloqueo de 223 tarjetas
El informe v8 de MAIN mostró 223/223 tarjetas con `isLock=true` y sin `e/k` inmediatamente tras descifrar el catálogo. La presente herramienta **no cambia `isLock`**, **no recupera `e/k`** y **no exporta almacenamiento completo**. Ayuda a separar una confusión de perfiles/sesiones de un bloqueo aplicado por el servidor.

## Seguridad y pruebas
- No usar la antigua función `extension-sessions-export`: el entrypoint 1.5.24 la deshabilita por privacidad.
- La frase privada es la misma en los tres perfiles; si cambias la frase, las huellas **no** serán comparables.
- Las huellas se derivan de un identificador de cuenta: mantenlas dentro de la investigación aunque no sean un token.
- No se abre sesión con tokens ajenos, no se escriben cookies y no se envían contraseñas.
- Prueba automatizada: `node app/tests/extension-session-identity-diagnostic-scenarios.js`.
- Comparación local: `node app/scripts/compare-extension-session-reports.js ...`.

**Estado de entrega:** estos cambios son de una rama de pruebas hasta que la CI los valide y se descargue e instale el build; no constituyen una ejecución real sobre el PC del usuario ni prueban acceso a tarjetas restringidas.
