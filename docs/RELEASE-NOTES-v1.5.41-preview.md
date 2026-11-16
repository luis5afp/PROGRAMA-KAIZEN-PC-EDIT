# KAIZEN PC 1.5.41 — VERSIÓN PRELIMINAR DE LABORATORIO

**No es un desbloqueo de las 233 tarjetas reales.** Esta versión permite evaluar
en el programa Windows un laboratorio local con 233 tarjetas y datos ficticios,
sin conectar con el backend para pedir credenciales.

## Cambios visibles
- Menú de KAIZEN → **Laboratorio 233 tarjetas · SOLO PRUEBAS**.
- Acceso rápido: `Ctrl + Shift + L`.
- Ventana aislada: sin Node, sin preload de credenciales, sin permisos de
  navegador y con sesión temporal independiente.
- Escenario 1: 233 autorizadas **simuladas**, 233 credenciales ficticias,
  233 autocompletados de un formulario de dos campos.
- Escenario 2: 233 bloqueadas **simuladas**: 0 autocompletados.
- Escenario 3: 233 autorizadas **simuladas** sin credenciales:
  0 autocompletados.

## Conservado sin cambios
- Chromium oficial y perfiles Principal, Google y Custom.
- Extensiones de seguridad EX1 y EX2.
- APIs, contraseñas de usuarios, permisos y catálogo real administrados por el
  servidor existente.
- `isLock` y `e/k` originales: el laboratorio no los altera.

## Instalación de prueba
1. Hacer copia de seguridad de perfiles y cerrar KAIZEN.
2. Descargar el `KAIZEN-PC-v1.5.41-Setup-x64.exe` de la publicación
   **preliminar sin firma**, cuando las pruebas CI hayan terminado.
3. Instalar manualmente. Si Windows advierte por un editor desconocido,
   el certificado de firma todavía no está configurado.
4. Abrir KAIZEN y seleccionar el laboratorio desde el menú.
5. Comparar el resultado ficticio con el **Diagnóstico** del catálogo real,
   sin exportar credenciales, cookies, tokens ni solicitudes crudas.

## Limitaciones verificables
- El laboratorio usa únicamente dominios `.invalid` y correos
  `@kaizen.invalid`, no sitios reales.
- Las pruebas de navegador verifican 233 autocompletados ficticios en Chromium,
  no la obtención de 233 credenciales desde el servidor.
- El informe real proporcionado anteriormente indicó 233 tarjetas bloqueadas
  y `e/k=null`; no hay evidencia de que cambiar el cliente desbloquee dichos
  recursos.
- **No se habilitan actualizaciones silenciosas** en un build sin firma
  reconocida mediante `publisherName`.
- El backend no se modificó.

La versión estable con actualización automática requiere firma Authenticode
y una prueba de actualización real entre versiones firmadas.
