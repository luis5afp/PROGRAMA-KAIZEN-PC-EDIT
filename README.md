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

## Entrada directa a perfiles locales

En esta variante, al llegar a la pantalla de inicio de sesión se abre automáticamente el administrador de perfiles **locales** de KAIZEN. Se pueden abrir e importar perfiles guardados en el equipo sin iniciar sesión ni introducir códigos de verificación por correo. También se puede cerrar el panel para volver al inicio de sesión del servidor.

Este cambio **no desactiva la verificación de dos pasos del servidor** ni permite acceder a perfiles remotos sin una sesión autorizada. El cliente ya admite una respuesta de inicio de sesión con `token` directo; para eliminar la verificación de perfiles remotos, el administrador debe configurar el backend para que ese inicio de sesión esté autorizado sin 2FA.

