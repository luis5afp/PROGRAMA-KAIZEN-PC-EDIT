# KAIZEN PC 1.5.28 — Diagnóstico de catálogos y autocompletado

Nueva interfaz de **Diagnóstico** integrada en las tres extensiones oficiales:
- KAIZZEN-MAIN 2.5.11
- KAIZZEN-GOOGLE 1.0.8
- KAIZZEN-CUSTOM 1.0.11

El botón «Diagnóstico» aparece dentro del catálogo. No necesita abrir
chrome-extension://ID ni herramientas DevTools, bloqueadas por EX1 y EX2.

El panel registra únicamente indicadores técnicos: HTTP del catálogo,
cantidades de tarjetas, presencia de los campos d/e/k/proxy, número de tarjetas
restringidas, clic, sesión temporal creada/eliminada, carga de content scripts
y detección de campos de correo/contraseña. Permite copiar un informe de
eventos **sin las credenciales ni respuestas originales**.

No se modifican EX1 y EX2. No se cambian permisos del servidor ni se
desbloquean tarjetas restringidas. Las credenciales solamente se utilizan
en el flujo existente cuando el servidor autoriza el acceso.

Se elimina la guía anterior del gestor de contraseñas de Chromium por no
corresponder al autocompletado de KAIZZEN gestionado desde su catálogo.

## Cómo probar
1. Actualiza a KAIZEN PC 1.5.28 y reinicia las ventanas de Chromium.
2. Abre un perfil desde KAIZEN PC, ingresa al catálogo normalmente.
3. Pulsa «Diagnóstico», confirma «diagnostico-catalogo-iniciado».
4. Abre una tarjeta **autorizada** con la que antes no se completaba el login.
5. Vuelve al catálogo, pulsa «Copiar informe» y comparte solo ese JSON.
6. Comprueba si se registran «catalogo-respuesta»,
   «sesion-temporal-preparada», «script-formulario-activo»
   y «formulario-observado».

**Importante**: que correoConContenido o claveConContenido sea true no
demuestra por sí solo que KAIZZEN haya efectuado el relleno; solo que el
campo tenía un valor. Para determinar la causa final hay que contrastar
los eventos con una prueba real en Windows.

No publiques volcados de red, cookies, tokens o contraseñas.
