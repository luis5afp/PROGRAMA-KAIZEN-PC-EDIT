# KAIZEN PC 1.5.26 — Integración de extensiones R3

## Incluidas
- KAIZZEN-MAIN 2.5.9
- KAIZZEN-GOOGLE 1.0.6
- KAIZZEN-CUSTOM 1.0.9
- EX1 1.2 y EX2 1.1 (sin modificar su contenido original)

Los archivos R3 ya se incorporaron al repositorio por el usuario. La compilación toma los recursos dentro de
`runtime-resources/KAIZEN_EXTENSIONS/KAIZEN_EXTENSIONS` y los normaliza en
`resources/KAIZEN_EXTENSIONS` dentro del instalador.

## Tarjetas y permisos
Las tarjetas reciben clic y navegación por teclado. Una herramienta con `isLock:false` conserva el
flujo de apertura gestionado. Si `isLock:true`, se intenta abrir solo la página web pública
sin instalar cookies, credenciales, proxy o sesión gestionada y se informa que requiere autorización.
Esto **no concede acceso Premium ni evita la autorización real del servidor**.

## Integración Windows
Se sincronizaron las versiones de manifiestos, validadores, importador y pruebas del programa
y se actualizó la versión del instalador a 1.5.26. La comprobación del programa instalado
verifica la versión de cada perfil además de la existencia de archivos y SHA-256 de EX1/EX2.

## Riesgos y validación
EX1 puede consultar y transmitir URLs del historial; EX2 limita navegación e inspección.
Estas capacidades deben revisarse y comunicarse antes de instalar el programa.
Los paquetes EX1/EX2 originales de minúsculas se preservan sin modificaciones.
Las carpetas duplicadas `EX1` y `EX2` se retiran para evitar colisiones en Windows.

GitHub Actions: la solicitud de cambios ejecuta validaciones y construcción en Windows; el paso de
publicación se ejecuta solo cuando la rama llegue a `main`. Un resultado de CI exitoso
no sustituye una prueba manual de apertura y acceso real al catálogo en Windows.

## Actualización
Esta distribución sigue usando instalador manual. Copiar extensiones en otra ruta
no actualiza la aplicación empaquetada. No se recomienda sobrescribir perfiles de usuario.
