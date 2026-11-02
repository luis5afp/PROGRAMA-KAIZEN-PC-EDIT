# KAIZEN PC 1.5.25 — Hotfix Chromium: EX1 y EX2 obligatorias

Esta actualización corrige la apertura de los tres perfiles Chromium del instalador 1.5.24. En la versión anterior los botones de perfil cargaban solamente KAIZZEN-MAIN / GOOGLE / CUSTOM, por lo que EX1 y EX2 no aparecían en `chrome://extensions`.

## Corrección

Al pulsar el botón de apertura, KAIZEN solicita cargar **tres extensiones en el mismo perfil**:

- **Principal:** KAIZZEN-MAIN 2.5.6 + EX1 1.2 + EX2 1.1.
- **Google:** KAIZZEN-GOOGLE 1.0.3 + EX1 1.2 + EX2 1.1.
- **Streaming/Custom:** KAIZZEN-CUSTOM 1.0.6 + EX1 1.2 + EX2 1.1.

Los argumentos `--load-extension` y `--disable-extensions-except` incluyen los tres directorios en el arranque de Chromium. Si EX1 o EX2 no están presentes, tienen el manifiesto incorrecto o alguno de sus seis SHA-256 originales no coincide, **KAIZEN no abre el perfil incompleto**. El instalador mantiene Chromium y los paquetes completos dentro de la aplicación.

**Es importante cerrar todas las ventanas de Chromium abiertas previamente antes de iniciar un perfil tras actualizar.** Chromium puede reutilizar un proceso de perfil todavía abierto y no aplicar nuevas extensiones. Puedes confirmar los tres paquetes en `chrome://extensions`.

## Aviso sobre permisos y privacidad

**EX1 y EX2 son obligatorias al abrir cualquiera de los tres perfiles desde el selector KAIZEN**. La interfaz lo indica antes del botón de apertura. EX1 puede acceder al historial y transmitir URLs de navegación; EX2 puede limitar páginas y herramientas de inspección. Estas funciones pueden afectar la privacidad y las posibilidades de depuración. Abre los perfiles únicamente si aceptas esas condiciones y revisa su política de uso. El instalador no modifica scripts, claves, ni hashes originales.

## Pruebas y limitaciones

Las pruebas automáticas verifican la construcción de los comandos Chromium, la presencia de las tres rutas, el cierre de perfiles duplicados, la negativa a abrir cuando fallan los SHA-256 originales y la integridad de los archivos después de instalar el Setup en Windows. El inicio de sesión y la visualización efectiva de las tres tarjetas en `chrome://extensions` deben comprobarse también en una ejecución interactiva de Windows.

Los permisos del catálogo remoto y cualquier verificación en dos pasos siguen administrados por el servidor; esta actualización no los altera ni omite.

## Instalación

Descarga **KAIZEN-PC-v1.5.25-Setup-x64.exe** y ejecútalo para actualizar el programa. No copies el EXE suelto ni importes archivos ZIP. La compilación automatizada debe generar también `.sha256` y comprobar la instalación en Windows antes de publicar.
