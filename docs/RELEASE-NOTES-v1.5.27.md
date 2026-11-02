# KAIZEN PC 1.5.27 — Gestor de contraseñas por perfil

Esta versión integra los tres paquetes completos de extensiones ya subidos al repositorio:
- KAIZZEN-MAIN 2.5.10
- KAIZZEN-GOOGLE 1.0.7
- KAIZZEN-CUSTOM 1.0.10

Cada perfil incluye el botón **Mis contraseñas** y una guía local para registrar las
credenciales propias en el gestor de contraseñas de Chromium. Las tarjetas siguen
abriendo sus enlaces. El gestor puede sugerir o rellenar las cuentas previamente
guardadas en el mismo perfil, según las reglas de cada sitio.

**No se modifica el servidor, no se eluden restricciones `isLock` y no se recuperan
cookies, contraseñas ni sesiones Premium que el servidor no autoriza.**
El autocompletado requiere credenciales guardadas previamente por el usuario.
La guía no almacena contraseñas en la extensión.

La instalación conserva EX1 (1.2) y EX2 (1.1) originales. Antes de instalar,
ten en cuenta que EX1 puede acceder al historial de navegación y EX2 puede
restringir funciones del navegador.

El instalador Windows x64 incluye el navegador Chromium y las cinco extensiones.
El proceso CI verifica empaquetado, integridad, instalación silenciosa y SHA-256.
El inicio de sesión real en sitios externos no se prueba automáticamente.
