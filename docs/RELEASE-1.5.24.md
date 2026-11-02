# KAIZEN PC 1.5.24 — requisitos para publicar Windows

El flujo `.github/workflows/kaizen-member-test.yml` crea un **portable**, no un instalador Setup. El directorio `KAIZEN_EXTENSIONS` tiene que estar al mismo nivel que `KAIZEN-PC-v1.5.24.exe`, NO dentro de `resources/`.

## Paquetes originales necesarios

Esta rama **no incluye** los paquetes de extensión originales. No es válido afirmar que vienen incorporados hasta suministrar y verificar los paquetes con permiso de redistribución.

Estructura esperada del ZIP `KAIZEN_EXTENSIONS_Originales.zip`:

```text
KAIZEN_EXTENSIONS/
  KAIZZEN_MAIN/
    manifest.json
    index.html
    backgroundScript.js
    ... otros archivos originales
  KAIZZEN_GOOGLE/
    manifest.json
    index.html
    backgroundScript.js
    ...
  KAIZZEN_CUSTOM/
    manifest.json
    index.html
    backgroundScript.js
    ...
```

Los nombres de los scripts de fondo pueden variar si así lo indica el campo `background.service_worker` en cada manifiesto. La validación exige:

- KAIZZEN-MAIN v2.5.6, KAIZZEN-GOOGLE v1.0.3 y KAIZZEN-CUSTOM v1.0.6.
- `manifest_version = 3`, `action.default_title = KAIZEN`, un `index.html` y el archivo real del service worker.
- Archivos regulares en sus carpetas previstas. **No** valida la identidad criptográfica del proveedor; comprobar la procedencia de los ZIP es responsabilidad del distribuidor.

Nunca se deben añadir credenciales, tokens, cookies, sesiones ni perfiles de usuarios al paquete. Solo se deben utilizar extensiones cuya distribución esté autorizada.


## Instalador con tres extensiones integradas (implementación vigente)

**El usuario final no importa archivos ZIP.** Una compilación autorizada instala:

- \`resources/KAIZEN_EXTENSIONS/KAIZZEN_MAIN\` v2.5.6
- \`resources/KAIZEN_EXTENSIONS/KAIZZEN_GOOGLE\` v1.0.3
- \`resources/KAIZEN_EXTENSIONS/KAIZZEN_CUSTOM\` v1.0.6
- \`KAIZEN_CHROMIUM/chrome-win64/chrome.exe\`
- \`resources/extensionForSecurity/ex1\` y \`ex2\` sin alterar sus seis hashes originales

\`app/kaizen-original-extensions-host.js\` da prioridad a las carpetas **internas de la instalación** sobre cualquier importación antigua, prepara tres directorios de datos locales y solo inicia Chromium cuando se pulsa «Abrir perfil Chromium». Las tres tarjetas se habilitan cuando están los archivos originales y el Chromium incluido. En esa condición, la interfaz oculta la fila de importación opcional. No se copia ningún token o contraseña al navegador.

### Compilación privada de un único Setup EXE en Windows

1. Instalar Node.js 22+, PowerShell 7+ y disponer de acceso a internet para descargar Chromium y herramientas de construcción.
2. Obtener de forma autorizada la carpeta \`KAIZEN_EXTENSIONS\` con los tres paquetes originales o el ZIP \`KAIZEN_EXTENSIONS_Originales.zip\` **solo en la máquina de compilación**, nunca en el repositorio público.
3. Ejecutar desde la raíz del código:
   \`pwsh -File scripts/build-windows-integrated.ps1 -ExtensionsSource "C:\ruta-privada\KAIZEN_EXTENSIONS_Originales.zip"\`
4. El script verifica los manifiestos, prepara los recursos internos, incluye Chromium, preserva los archivos de seguridad originales, y genera un Setup NSIS en \`dist/installer/\`.
5. Una vez instalado el Setup, **no hay que copiar carpetas ni seleccionar ZIP**.

El workflow \`.github/workflows/kaizen-member-test.yml\` sigue disponible para **ejecución manual en un repositorio privado**, con un ZIP HTTPS autorizado mediante el secreto \`KAIZEN_EXTENSIONS_BUNDLE_URL\`. No publica un artefacto completo desde este repositorio público. Esto es deliberado: los paquetes originales contienen permisos de cookies/proxy/navegación y potenciales secretos integrados. Revisar/rotar secretos antes de redistribuir; todo código incluido en un instalador puede ser extraído por el receptor.

### Comprobación automatizada y límites

\`app/tests/embedded-extension-integration-scenarios.js\` comprueba que los tres perfiles se detecten dentro de \`resources\`, se preparen sin importación ni red, estén aislados y creen comandos correctos para abrir Chromium al pulsar. Estas comprobaciones utilizan un proceso Chromium simulado: **no reemplazan una prueba interactiva de la instalación, de autenticación ni del catálogo**. El instalador final todavía necesita una ejecución privada real y aceptación en Windows. La versión PREVIEW pública continúa sin los tres paquetes originales.


## Probar con el ejecutable ya descargado (procedimiento de PREVIEW antigua)

1. Descomprime el artefacto de GitHub Actions (conservando todos los archivos, incluido `KAIZEN_CHROMIUM`).
2. Copia la carpeta `KAIZEN_EXTENSIONS` completa junto al `KAIZEN-PC-v1.5.24.exe`, **o** coloca el ZIP `KAIZEN_EXTENSIONS_Originales.zip` en la misma ubicación.
3. Reinicia KAIZEN PC, abre «Perfiles Chromium» y confirma que Principal, Google y Streaming / Custom estén disponibles.
4. Comprueba la apertura, el inicio de sesión y el catálogo con tu cuenta autorizada. Las comprobaciones automáticas de manifiestos no sustituyen esta prueba real en Windows.

El artefacto existente de la ejecución 41340089853 no se modifica retroactivamente.

## Crear una nueva compilación completa en Actions (solo repositorio privado)

El workflow manual empaqueta y valida las extensiones dentro de `resources/` solo si hay una fuente válida:

- Carpeta `runtime-resources/KAIZEN_EXTENSIONS`, o
- Archivo `runtime-resources/KAIZEN_EXTENSIONS_Originales.zip`, o
- En una ejecución manual `workflow_dispatch`, un enlace **HTTPS** temporal configurado como secreto del repositorio con el nombre `KAIZEN_EXTENSIONS_BUNDLE_URL`, que apunte a un ZIP autorizado con la estructura anterior. Este mecanismo evita tener que guardar el paquete original en el repositorio público.

En este repositorio público el workflow de instalación está **deshabilitado deliberadamente** (se omite), para evitar exponer el código y posibles secretos en artefactos públicos. En un repositorio privado con ejecución manual, si falta el paquete o su estructura es inválida, falla y **no sube** el artefacto de Windows. El paso de compilación sigue realizando las pruebas unitarias sin credenciales ni conexiones de inicio de sesión.

## Publicación en Releases

**No crear ni publicar todavía `v1.5.24`** hasta que el ZIP de origen autorizado esté disponible y se hayan verificado los tres perfiles en un equipo Windows real. El workflow actual solo sube un artefacto de prueba; publicar un Release y/o un instalador `KAIZEN-Setup-1.5.24.exe` requiere una etapa adicional de distribución aprobada.


## ex1 y ex2 — archivos presentes; el selector no las activa

Los dos paquetes de seguridad ya existen en el repositorio bajo:
- `runtime-resources/extensionForSecurity/ex1` (manifest v1.2)
- `runtime-resources/extensionForSecurity/ex2` (manifest v1.1)

El workflow copia estos archivos al directorio portable `resources/extensionForSecurity/ex1` y `resources/extensionForSecurity/ex2` y el diagnóstico los busca ahí. **El selector de perfiles no instala ni inicia ex1/ex2 por sí mismo**; el cliente legado aún puede cargarlas en algunos flujos de perfiles, por lo que la activación real debe verificarse en Chromium. No las añadas a `--load-extension` sin revisar los riesgos y obtener autorización informada de quienes usen el navegador.

Revisión del código existente:
- **ex1:** tiene permiso de lectura del historial y envía ciertas URLs al servidor externo de la extensión. Además, sus scripts restringen opciones de inspección y navegación.
- **ex2:** bloquea rutas y también restringe herramientas de inspección.
- **Advertencia no bloqueante de EX1:** `ex1/manifest.json` declara `inject.js` en `web_accessible_resources`, pero los RAR/ZIP originales no incluyen ese recurso. El usuario instaló EX1 en su navegador y confirmó que funciona con sus cuatro archivos; por tanto, el empaquetado permite específicamente esa referencia ausente. No se crea `inject.js` ni se modifica el manifiesto original o su SHA-256. La verificación de funciones específicas en KAIZEN sigue pendiente.

`app/scripts/verify-security-extensions.js` verifica versiones y todos los archivos esenciales (manifiesto, background service worker, content scripts, iconos). La excepción precisa de `ex1/inject.js` figura como advertencia, no como fallo. Los demás faltantes siguen bloqueando la compilación. Las pruebas no ejecutan ni se conectan a estas extensiones.

**Antes de activarlas:** revisar su código no ofuscado o auditado, destinatarios y retención de los datos transmitidos, permisos, comportamiento al desinstalar y consentimiento explícito. La incorporación inactiva no garantiza su seguridad ni su correcto funcionamiento en Windows.


## Importación manual opcional de respaldo (no necesaria en el instalador integrado)

En la nueva compilación aparece el botón **«Importar extensiones originales (.zip)»** en **Perfiles Chromium**. Permite seleccionar un ZIP local provisto por el distribuidor autorizado, sin pedir permisos para escribir en Program Files y sin tener que copiarlo junto al ejecutable.

1. Abrir KAIZEN PC y pulsar «Perfiles Chromium».
2. Pulsar «Importar extensiones originales (.zip)», seleccionar un ZIP con la carpeta raíz `KAIZEN_EXTENSIONS/` y sus tres extensiones completas. Si hay perfiles Chromium abiertos, cerrarlos antes de reemplazar los paquetes.
3. KAIZEN valida los nombres, versiones, manifiestos y archivos referenciados; rechaza rutas fuera de la carpeta, duplicados, tamaños excesivos y ZIP parciales.
4. Si todo está correcto, instala en el almacenamiento de usuario de Windows `<userData>/kaizen-original-extensions/KAIZEN_EXTENSIONS/` y actualiza los tres botones para abrir cada perfil. Las sesiones y perfiles Chromium existentes NO se borran.
5. Una importación rechazada no reemplaza los paquetes ya validados; el proceso usa un directorio temporal y sustitución por renombrado, con restauración del anterior si el renombrado del nuevo falla.

**No es un generador de las extensiones originales**: estas funcionalidades necesitan el código real, autorizado y compatible de Principal v2.5.6, Google v1.0.3 y Streaming / Custom v1.0.6. Las pruebas automáticas usan archivos simulados para verificar la mecánica de instalación; no comprueban el funcionamiento del login, el catálogo o la compatibilidad con todos los navegadores. Se requiere una prueba funcional en Windows con los ZIP reales antes de publicar el Release.

El flujo de Release sigue requiriendo los tres paquetes originales MAIN/GOOGLE/CUSTOM. `ex1` y `ex2` permanecen separadas; el selector y la importación de originales no las activan, pero el cliente legado podría hacerlo en sus propios flujos.

## Preparación automática incluida en el portable (sin importación manual)

Al iniciar KAIZEN, `kaizen-original-extensions-host.js` intenta detectar un archivo **original autorizado y completo** `KAIZEN_EXTENSIONS_Originales.zip` en la carpeta del EXE o en `resources/`. Si existe y faltan perfiles, utiliza el mismo importador validado que la interfaz y lo almacena bajo `userData/kaizen-original-extensions/KAIZEN_EXTENSIONS`, sin escribir en Program Files. También detecta carpetas `KAIZEN_EXTENSIONS` entregadas en la raíz o en `resources/`.

**El flujo de arranque listo al primer clic requiere que el distribuidor incluya el ZIP autorizado con MAIN, GOOGLE y CUSTOM.** Este repositorio no contiene esas tres extensiones, y la versión PREVIEW pública no puede presentarlas como instaladas. El usuario tampoco tiene que importar manualmente un ZIP si el paquete se distribuye correctamente desde el principio. La apertura sigue siendo por perfil aislado con Chromium (botón «Abrir perfil Chromium»).

### Auditoría de los paquetes de seguridad

Inspección real del contenido de `ex1.zip` y `ex2.zip` mediante el workflow `.github/workflows/kaizen-security-archive-audit.yml`:

- `ex1.zip`: `backgroundScript.js`, `contentScript.js`, `icon.png`, `manifest.json`; **no incluye `inject.js`**, aunque el manifiesto lo declara.
- `ex2.zip`: los mismos cuatro archivos sin referencias a `inject.js`.

EX1 se marca **«archivos principales listos · aviso»**: el usuario confirmó que funciona en un navegador aun sin `inject.js`, pero no hay prueba funcional completa en KAIZEN. **No activar silenciosamente ex1 o ex2**: su código restringe la inspección y ex1 puede transmitir URLs del historial a un servidor. Para habilitarlas de forma deliberada hace falta revisión de privacidad y consentimiento. Las verificaciones SHA-256 de `main.min.js` permanecen activas.
