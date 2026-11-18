# KAIZEN PC 1.5.43 — Integración compatible con 1.5.42

## Por qué se prepara 1.5.43

El instalador publicado `v1.5.42-preview.2` contiene el Laboratorio
de 233 tarjetas ficticias y la herramienta de diagnóstico de API,
pero usa `catalog-diagnostic.js` v7.

El PR #56 agregó el diagnóstico de integridad v8 a `main`,
que estaba etiquetado como versión 1.5.41. Instalar 1.5.41 sobre
1.5.42 implicaría una regresión de versión y podría omitir las
funciones del Laboratorio existentes en la release 1.5.42.

## Contenido combinado

- Se recuperan del tag `v1.5.42-preview.2` los módulos originales
  del Laboratorio 233, integración de API, menú de apertura
  y sus tests, manteniendo el código del Laboratorio solo de prueba.
- Se mantienen las tres extensiones con el diagnóstico v8 ya
  añadido en el PR #56, **sin alterar** `isLock`, autenticación,
  cifrado, solicitudes, cookies, acceso ni autocompletado.
- El comparador del Laboratorio conserva los informes v7 y acepta
  el resumen sanitario v8. Muestra los contadores agregados
  `restringidas sin par e/k`, `pérdida de e` y `pérdida de k`
  de productos autorizados, sin registrar valores de credenciales.
- `app/package.json` se incrementa a `1.5.43`.
- Se incluyen las validaciones del Laboratorio y los escenarios v8
  en la regresión de Windows.

## Límites

Esta integración no obtiene credenciales que el servidor no
haya autorizado. Los valores observables son contadores y estados
sanitizados; la simulación de 233 tarjetas es totalmente ficticia.

## Distribución

El PR es **código fuente pendiente de validación**, no una
publicación ni un instalador disponible en Releases.

Para publicar posteriormente una versión 1.5.43 debe pasar
regresión de Windows, verificación de instalación NSIS,
comprobación de las extensiones y revisión de firma/actualización.
No reemplazar manualmente instalaciones de 1.5.42 por 1.5.41.
