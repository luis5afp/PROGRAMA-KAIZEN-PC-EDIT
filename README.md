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

El punto de entrada actual es `app/main.kaizen-1.5.24.js`, que carga la variante `app/main.member-test.js` antes del núcleo original `app/main.min.js`. Las actualizaciones automáticas quedan desactivadas allí.

`runtime-resources/app-update.yml` también fue desligado del repositorio upstream para evitar que una futura reactivación accidental consulte o instale builds externos.

> Nota: los cambios del repositorio no modifican retroactivamente el instalador original `KAIZEN-Setup-1.5.2.exe`. Debe generarse un nuevo build para distribuir esta política dentro del programa instalado.

## Navegador de los perfiles (1.5.39)

Los tres perfiles del catálogo abren **Chromium oficial sin marca**, empaquetado junto al programa en `KAIZEN_CHROMIUM/chrome-win/chrome.exe`. El instalador descarga el ZIP desde los snapshots oficiales de Chromium, guarda los metadatos de la revisión y no utiliza Chrome for Testing. La ruta antigua `chrome-win64` no se acepta como alternativa.

Para compilar con las extensiones integradas:

```powershell
pwsh -File scripts/build-windows-integrated.ps1 -ExtensionsSource "runtime-resources/KAIZEN_EXTENSIONS"
```

Los perfiles se conservan bajo los datos de usuario de KAIZEN y cada uno sigue cargando su extensión principal, EX1 y EX2. No hay cambios en autenticación ni permisos del servidor.

**Importante:** los snapshots oficiales no se actualizan automáticamente y normalmente no incluyen Widevine/DRM, por lo que Netflix y otros servicios con vídeo protegido pueden no reproducirse. Véanse las [notas 1.5.39](docs/RELEASE-NOTES-v1.5.39.md).
