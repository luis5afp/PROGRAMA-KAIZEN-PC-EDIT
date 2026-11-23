# KAIZEN PC — Prueba explícita con el servidor principal y tarjetas de prueba existentes

Este procedimiento utiliza **las tarjetas y credenciales de prueba que ya administra el servidor principal**. No crea usuarios/productos ficticios y no modifica permisos, `isLock`, `e/k`, el 2FA ni los scripts de autocompletado. El analizador es **pasivo**: procesa solo los informes v8 saneados que emiten las extensiones. No pide ni registra contraseñas, códigos 2FA, cookies, tokens o respuestas cifradas.

## Condiciones para la prueba en vivo

- KAIZEN PC con las tres extensiones y el diagnóstico v8 instalado.
- Inicio de sesión legítimo en una cuenta de prueba **autorizada** dentro de KAIZEN; completar 2FA por los canales oficiales cuando el servidor lo exija.
- Al menos una tarjeta de prueba autorizada para ese usuario; si no existe, el diagnóstico señalará bloqueo pero no lo cambiará.
- Windows/Chromium en el equipo en que se ejecuta KAIZEN. La inspección del repositorio o los tests unitarios no sustituyen la prueba de esa sesión.

## Comprobación previa de la aplicación Electron

En **KAIZEN PC → Diagnóstico integral**, ejecutar las comprobaciones remotas **desde la sesión legítima de prueba**. El panel ya prueba `/api/verify-token`, `/api/browser/get`, `/api/browser/group/get`, `/api/browser/variant-profiles` y `/api/products/getmostusedtool` y devuelve solo estados HTTP y conteos. Registrar si `/api/verify-token` reconoce la sesión; una respuesta HTTP 200 en productos **no autoriza individualmente** cada tarjeta. Si aparece `2fa-required` o un 401/403, completar el flujo oficial en lugar de alterar el cliente.

## Ejecutar la prueba sin exponer credenciales

Para cada variante que corresponda (MAIN, GOOGLE y CUSTOM):

1. Abrir la extensión e iniciar sesión normalmente con la cuenta de prueba autorizada. Nunca copiar tokens ni credenciales al informe.
2. En el panel **Diagnóstico**, usar **Borrar eventos**, recargar la vista del catálogo y volver a abrir el panel.
3. Confirmar que el resumen dice `Productos (servidor): HTTP 200 · bloque cifrado sí` y que aparece `Inmediatamente tras descifrar`.
4. Comparar `Acceso en objetos descifrados` con el permiso previsto para las tarjetas de prueba; mirar `cambioBloqueo`, `perdidaEAutorizada` y `perdidaKAutorizada`.
5. Pulsar **una tarjeta que el servidor haya autorizado**. Observar `sesion-temporal-preparada`, `script-formulario-activo` y `formulario-observado`, sin fotografiar ni copiar los valores del formulario.
6. En el panel, usar **Copiar informe** y pegar **solo el JSON saneado** en un archivo local UTF-8 (por ejemplo `informe-main.json`). No exportar HAR, cookies, localStorage completo ni trazas con encabezados.
7. Repetir con las otras variantes autorizadas, guardando un JSON por variante.

En la carpeta del repositorio ejecutar:

```powershell
node app/scripts/check-live-catalog-report.js .\informe-main.json .\informe-google.json .\informe-custom.json
```

O pasar solo los informes disponibles. El programa muestra únicamente categorías, contadores y veredictos, sin copiar los eventos originales.

## Cómo leer el resultado

- `OBSERVADO` + `SIN_PERDIDA_OBSERVADA`: hubo respuesta de catálogo cifrada, lote descifrado y no se observó pérdida de e/k en productos clasificados como autorizados. **No demuestra que las contraseñas sean válidas ni que el backend haya concedido permisos correctamente**.
- `RESTRINGIDA`: la tarjeta pulsada fue clasificada como bloqueada; el cliente no debe iniciar autocompletado. Verificar permisos con administración del backend.
- `REVISAR_CLIENTE`: se perdió un campo autorizado, cambió el bloqueo entre etapas, o se observó ausencia de sesión temporal.
- `FORMULARIO_OBSERVADO`: se alcanzó un formulario; **no prueba inicio de sesión**. El resultado real se confirma manualmente en la cuenta de prueba y en los registros autorizados del servidor.
- `SIN_EVIDENCIA` / `INCOMPLETO`: el informe no cubre esa etapa, no es una autorización implícita.

HTTP 200 tampoco demuestra que todas las tarjetas estén autorizadas. Si el servidor responde `isLock=true` a una tarjeta que debería estar habilitada, corregir la causa en el panel/backend autorizado, no forzar la bandera en la extensión.

## Validar el analizador (sin cuentas reales)

```powershell
node app/tests/check-live-catalog-report-scenarios.js
```

Las pruebas automatizadas comprueban la interpretación de **metadatos**, con casos de éxito, bloqueo, pérdida, ausencia de etapa y privacidad. **No se han ejecutado peticiones de autenticación o apertura contra el servidor real desde esta prueba de código.**
