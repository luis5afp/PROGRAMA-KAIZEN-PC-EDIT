# KAIZEN PC 1.5.40 — Actualizaciones automáticas silenciosas

## Nuevo comportamiento
Al abrir la aplicación instalada en Windows, KAIZEN comprueba una sola vez
los Releases **estables y públicos** del repositorio GitHub del proyecto.
Si hay una versión nueva, descarga el instalador NSIS usando electron-updater,
lo verifica contra los metadatos de ese release, inicia una instalación
silenciosa y solicita que la aplicación vuelva a abrirse al terminar.
No pregunta al usuario si desea actualizar.

Si el equipo está sin conexión o falla la comprobación o descarga, permite
abrir la versión instalada. No hay consultas periódicas ni actualizaciones
durante la navegación.

## Protección de datos y compatibilidad
Se mantienen:
- perfiles aislados Principal, Google, Custom y modo Invitado;
- carpetas de datos persistentes, sesiones y extensiones EX1/EX2;
- login, 2FA, permisos del servidor y servicios externos;
- Chromium oficial del instalador completo, no Chrome for Testing.

No se copiaron credenciales al sistema de actualizaciones.

## Instalador y publicación
- Identidad constante: `KAIZEN-PC` y NSIS por usuario.
- Binario versionado: `KAIZEN-PC-v1.5.40-Setup-x64.exe`.
- Feed: GitHub público `luis5afp/PROGRAMA-KAIZEN-PC-EDIT`.
- Release: `latest.yml` con versión, nombre, tamaño y SHA512 del mismo
  instalador que se probó, y `.blockmap` si se generó.
- Publicación desde etiquetas `vX.Y.Z` mediante GitHub Actions.
- El flujo exige firma Authenticode válida antes de hacer público el release.
- El cambio de versión `1.5.40` requiere una instalación manual inicial:
  las versiones 1.5.39 y anteriores tenían desactivado el auto-updater.

## Verificaciones pendientes antes de publicar
1. Configurar en GitHub Actions los secretos de firma `KAIZEN_CSC_LINK` y
   `KAIZEN_CSC_PASSWORD`.
2. Compilar en Windows el instalador completo, instalarlo y comprobar firma,
   EX1/EX2, perfiles, `resources/app-update.yml` y `latest.yml`.
3. Hacer ensayo controlado de dos releases sucesivos (por ejemplo,
   1.5.40 → versión siguiente) y confirmar que se descarga, instala y
   abre la segunda versión sin preguntar.
4. Comprobar recuperación sin internet y preservación de perfiles locales.
5. No distribuir como actualización automática una build parcial o no firmada.

El comportamiento está preparado en el código, pero la instalación real
desatendida solo puede darse por validada tras la prueba anterior en Windows.
