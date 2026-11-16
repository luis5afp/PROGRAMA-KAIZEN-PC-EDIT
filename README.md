# PROGRAMA-KAIZEN-PC-EDIT

Repositorio de trabajo para la versión editable de KAIZEN PC.

## Política de actualizaciones (desde 1.5.40)

KAIZEN PC para Windows comprueba **una vez al iniciarse** si existe una versión
estable posterior en los Releases públicos de
`luis5afp/PROGRAMA-KAIZEN-PC-EDIT`.

- Si no existe una versión nueva, abre KAIZEN normalmente.
- Si hay una versión nueva, espera su descarga verificada, cierra el proceso,
  instala el NSIS **sin solicitar confirmación** (en instalaciones por usuario)
  y reinicia KAIZEN con la nueva versión.
- Si no hay internet, faltan metadatos o falla la descarga, inicia la versión
  actual. No modifica sesiones ni perfiles; vuelve a comprobar al próximo inicio.
- Las compilaciones de prueba, los borradores y las versiones previas no se
  utilizan como canal de actualización.
- No hay comprobaciones periódicas durante una sesión: únicamente en el
  próximo inicio para no interrumpir tareas y perfiles abiertos.

**Migración inicial:** las versiones hasta 1.5.39 tenían el actualizador
desactivado y se publicaron sin `latest.yml`; no pueden actualizarse por
sí mismas. Instala **una vez** el Setup completo de la primera versión nueva.
Las versiones siguientes podrán instalarse automáticamente si se publican
correctamente.

El paquete NSIS incluye `resources/app-update.yml`; cada Release nuevo debe
adjuntar el **mismo Setup** que se validó junto con `latest.yml`, su suma
SHA512 y opcionalmente `.blockmap`. Un instalador sin firmar no puede ser
publicado por el flujo de versiones automáticas.

El workflow `.github/workflows/kaizen-auto-update-release.yml` publica cada
tag `vX.Y.Z` que coincida con `app/package.json` y supere las pruebas.
Antes debes guardar un certificado Authenticode y su contraseña en los secretos
de Actions `KAIZEN_CSC_LINK` y `KAIZEN_CSC_PASSWORD`.

El ejecutable y la identidad de instalación se mantienen estables como
`KAIZEN-PC` aunque el archivo Setup incorpore un número de versión. La
primera migración desde instalaciones antiguas puede requerir revisar accesos
directos, ya que los instaladores anteriores utilizaban nombres versionados.

> La firma, el instalador por usuario y las comprobaciones de integridad
> minimizan los avisos, pero Windows o las políticas de seguridad del equipo
> pueden seguir solicitando elevación o impedir una instalación silenciosa.
> Esta función no cambia autenticación, APIs ni permisos del servidor.

## Navegador de los perfiles (1.5.39)

Los tres perfiles del catálogo abren **Chromium oficial sin marca**, empaquetado junto al programa en `KAIZEN_CHROMIUM/chrome-win/chrome.exe`. El instalador descarga el ZIP desde los snapshots oficiales de Chromium, guarda los metadatos de la revisión y no utiliza Chrome for Testing. La ruta antigua `chrome-win64` no se acepta como alternativa.

Para compilar con las extensiones integradas:

```powershell
pwsh -File scripts/build-windows-integrated.ps1 -ExtensionsSource "runtime-resources/KAIZEN_EXTENSIONS"
```

Los perfiles se conservan bajo los datos de usuario de KAIZEN y cada uno sigue cargando su extensión principal, EX1 y EX2. No hay cambios en autenticación ni permisos del servidor.

**Importante:** los snapshots oficiales no se actualizan automáticamente y normalmente no incluyen Widevine/DRM, por lo que Netflix y otros servicios con vídeo protegido pueden no reproducirse. Véanse las [notas 1.5.39](docs/RELEASE-NOTES-v1.5.39.md).
