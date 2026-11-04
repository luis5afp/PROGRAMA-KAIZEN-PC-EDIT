# KAIZEN PC 1.5.39 — Chromium sin el aviso de Chrome for Testing

## Cambio aplicado

- El instalador deja de descargar Chrome for Testing y obtiene el ZIP de **Chromium oficial sin marca** desde los snapshots de Chromium en Google Storage (plataforma `Win_x64`).
- Se mantiene el ejecutable separado en `KAIZEN_CHROMIUM/chrome-win/chrome.exe`, fuera de las carpetas de perfiles y de extensiones.
- El lanzador **no vuelve a usar** una instalación antigua en `chrome-win64` si falta el navegador nuevo.
- La compilación registra revisión, URL de origen y SHA-256 del archivo ZIP en `KAIZEN_CHROMIUM/CHROMIUM_BUILD.txt`.
- Se conserva el almacenamiento de perfiles en `app.getPath('userData')/chromium-extension-profiles/{main,google,custom}`; no se borran ni se transfieren sesiones.
- Cada perfil mantiene sus tres extensiones: KAIZZEN-MAIN / GOOGLE / CUSTOM, según corresponda, junto a EX1 y EX2 validadas mediante hash.
- El diagnóstico del instalador comprueba el navegador nuevo y rechaza un ejecutable antiguo de Chrome for Testing.

## Instrucciones

La compilación de Windows sigue usando `scripts/build-windows-integrated.ps1` con `-ExtensionsSource`. Si se necesita una revisión reproducible, usar también `-ChromiumRevision <revision>`; por defecto consulta el último snapshot `Win_x64/LAST_CHANGE`.

Instalar el **Setup completo**, no copiar únicamente `app.asar` o el EXE; el navegador se entrega en su propia carpeta. Cerrar antes todas las ventanas de perfiles y realizar una copia de respaldo de los perfiles locales antes de actualizar.

## Limitaciones y comprobaciones pendientes

- Los snapshots oficiales de Chromium son compilaciones continuas, no una versión estable con actualizaciones automáticas. Recompilar y distribuir nuevas versiones con frecuencia para incorporar parches de seguridad.
- **Widevine/DRM:** Chromium oficial no incluye necesariamente los componentes propietarios requeridos por Netflix, Disney+, Prime Video y otros servicios. El catálogo puede abrir, pero la reproducción protegida puede fallar. Si la reproducción es requisito, usar un navegador compatible y gestionar las extensiones mediante su sistema de instalación soportado; no se puede garantizar el funcionamiento con flags de carga automática.
- No se promete un icono idéntico al de Microsoft Edge: la elección conserva el soporte de extensiones locales en Chromium, pero cambia la identidad del navegador.
- La prueba automatizada valida rutas, empaquetado y argumentos. La apertura gráfica y reproducción en Windows requieren una comprobación manual.
- No se modifica el servidor, el inicio de sesión, los permisos, ni la autenticación multifactor.
