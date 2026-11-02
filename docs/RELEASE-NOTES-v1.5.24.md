# KAIZEN PC 1.5.24 — Perfiles Chromium integrados

Esta versión incorpora los cambios aprobados de KAIZEN PC v1.5.24 para Windows x64.

## Novedades

- Perfiles Chromium **Principal (KAIZZEN-MAIN 2.5.6)**, **Google (KAIZZEN-GOOGLE 1.0.3)** y **Streaming / Custom (KAIZZEN-CUSTOM 1.0.6)** preparados automáticamente desde archivos integrados en la instalación. No hace falta seleccionar ni extraer archivos ZIP.
- Botones para abrir Chromium con una extensión y un directorio de datos aislado por perfil.
- **Chromium incluido** en la instalación para compatibilidad con extensiones locales.
- Ventana **Diagnóstico integral**, accesible desde el menú o con `Ctrl+Shift+D`, con estados de paquetes, aperturas y comprobaciones limitadas de sesión/catálogos sin exportar cookies ni tokens.
- Compatibilidad con los archivos originales de seguridad **EX1 1.2** y **EX2 1.1**, conservando su verificación de integridad. La referencia ausente a `inject.js` de EX1 se muestra como advertencia, no como bloqueo del empaquetado.
- Conservación de los controles de autorización del servidor: el inicio de sesión, permisos y verificación en dos pasos no se omiten ni se modifican.

## Instalación

Descargar y ejecutar **KAIZEN-PC-v1.5.24-Setup-x64.exe** en Windows x64. El instalador contiene los recursos de Chromium y los tres paquetes originales de los perfiles. No se requiere una importación manual.

## Privacidad y precauciones

Las extensiones de navegador tienen permisos amplios sobre cookies, proxy y navegación. **EX1 puede transmitir determinadas URLs del historial y EX2 puede restringir navegación o inspección**. Antes de usar el programa con cuentas personales, revisar los permisos, la procedencia de las extensiones y los secretos de API incorporados. Estas extensiones de seguridad no se activan desde el nuevo selector; algunos flujos legados podrían cargarlas.

El programa requiere autenticación y permisos válidos para acceder al catálogo remoto. La instalación de los paquetes no concede acceso adicional al servidor.

## Verificación de publicación

La compilación debe realizarse con el ZIP original autorizado suministrado por el mantenedor. El instalador de publicación debe superar las pruebas y comprobaciones de integridad en Windows, contener los tres perfiles reales y acompañarse de un archivo `.sha256`. **Revisar y probar el borrador del Release antes de pulsar «Publish release».**
