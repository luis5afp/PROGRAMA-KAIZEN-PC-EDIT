# PROGRAMA-KAIZEN-PC-EDIT

Repositorio de trabajo para la versión editable de KAIZEN PC.

## Política de actualizaciones

Las actualizaciones automáticas están desactivadas en esta variante.

- KAIZEN puede iniciar y funcionar aunque exista una versión más nueva.
- No se consulta GitHub para buscar actualizaciones al iniciar.
- No se realizan comprobaciones periódicas de nuevas versiones.
- No se descargan actualizaciones automáticamente.
- No se instala una actualización al cerrar la aplicación.
- Las solicitudes manuales de actualización del cliente actual se ignoran.

El punto de entrada es `app/main.no-updates.js`, que aplica esta política antes de cargar el núcleo original `app/main.min.js`.

`runtime-resources/app-update.yml` también fue desligado del repositorio upstream para evitar que una futura reactivación accidental consulte o instale builds externos.

> Nota: los cambios del repositorio no modifican retroactivamente el instalador original `KAIZEN-Setup-1.5.2.exe`. Debe generarse un nuevo build para distribuir esta política dentro del programa instalado.

## Verificación exclusivamente con aplicación 2FA (cliente)

Esta variante del cliente inicia sesión con correo y contraseña y, si el servidor exige un segundo factor, ofrece **solo la aplicación autenticadora** (código de seis dígitos). El método por correo deja de aparecer y no se llama a sus endpoints desde el inicio de sesión. Si el servidor declara el método `app`, se abre directamente la pantalla del código; si permite configurar una aplicación, se muestra esa opción.

**Importante:** si el servidor solamente anuncia el método `email` y no permite configurar la aplicación, el programa mostrará **directamente el formulario para introducir el código de seis dígitos**, con una advertencia de que el método no está habilitado según el servidor. Esto permite probar una app autenticadora que ya estuviera configurada. La petición irá al endpoint legítimo `/api/users/2fa/verify`. Si el servidor rechaza el código o no admite ese método, no será posible iniciar sesión sin habilitarlo en el servidor. Este cliente no genera tokens de sesión ni elude el control del backend.

