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

## Probar con el ejecutable ya descargado

1. Descomprime el artefacto de GitHub Actions (conservando todos los archivos, incluido `KAIZEN_CHROMIUM`).
2. Copia la carpeta `KAIZEN_EXTENSIONS` completa junto al `KAIZEN-PC-v1.5.24.exe`, **o** coloca el ZIP `KAIZEN_EXTENSIONS_Originales.zip` en la misma ubicación.
3. Reinicia KAIZEN PC, abre «Perfiles Chromium» y confirma que Principal, Google y Streaming / Custom estén disponibles.
4. Comprueba la apertura, el inicio de sesión y el catálogo con tu cuenta autorizada. Las comprobaciones automáticas de manifiestos no sustituyen esta prueba real en Windows.

El artefacto existente de la ejecución 41340089853 no se modifica retroactivamente.

## Crear una nueva compilación completa en Actions

El workflow empaqueta y valida las extensiones junto al EXE solo si hay una fuente válida:

- Carpeta `runtime-resources/KAIZEN_EXTENSIONS`, o
- Archivo `runtime-resources/KAIZEN_EXTENSIONS_Originales.zip`, o
- En una ejecución manual `workflow_dispatch`, un enlace **HTTPS** temporal configurado como secreto del repositorio con el nombre `KAIZEN_EXTENSIONS_BUNDLE_URL`, que apunte a un ZIP autorizado con la estructura anterior. Este mecanismo evita tener que guardar el paquete original en el repositorio público.

En un Pull Request no se descargan enlaces secretos. Si falta el paquete o su estructura es inválida, el workflow falla expresamente y **no sube** el artefacto de Windows. El paso de compilación sigue realizando las pruebas unitarias sin credenciales ni conexiones de inicio de sesión.

## Publicación en Releases

**No crear ni publicar todavía `v1.5.24`** hasta que el ZIP de origen autorizado esté disponible y se hayan verificado los tres perfiles en un equipo Windows real. El workflow actual solo sube un artefacto de prueba; publicar un Release y/o un instalador `KAIZEN-Setup-1.5.24.exe` requiere una etapa adicional de distribución aprobada.


## ex1 y ex2 — incorporadas como archivos, NO activadas

Los dos paquetes de seguridad ya existen en el repositorio bajo:
- `runtime-resources/extensionForSecurity/ex1` (manifest v1.2)
- `runtime-resources/extensionForSecurity/ex2` (manifest v1.1)

El workflow copia estos archivos al directorio portable `resources/extensionForSecurity/ex1` y `resources/extensionForSecurity/ex2` y el diagnóstico los busca ahí. **Ninguna se instala ni se ejecuta automáticamente**; el selector de perfiles únicamente abre MAIN, GOOGLE y CUSTOM. No las añadas a `--load-extension` sin revisar los riesgos y obtener autorización informada de quienes usen el navegador.

Revisión del código existente:
- **ex1:** tiene permiso de lectura del historial y envía ciertas URLs al servidor externo de la extensión. Además, sus scripts restringen opciones de inspección y navegación.
- **ex2:** bloquea rutas y también restringe herramientas de inspección.
- **Bloqueador adicional:** `ex1/manifest.json` declara `inject.js` en `web_accessible_resources`, pero ese recurso no está presente entre los archivos visibles de `runtime-resources/extensionForSecurity/ex1`. Debe aportarse y comprobarse una versión original completa, no crear un archivo vacío de reemplazo.

`app/scripts/verify-security-extensions.js` verifica versiones y los archivos locales declarados, incluido `inject.js`. Si falta cualquier recurso, el workflow falla y no publica artefacto nuevo, aunque las otras tres extensiones estén disponibles. Las pruebas no activan ni se conectan a ninguna de estas extensiones.

**Antes de activarlas:** revisar su código no ofuscado o auditado, destinatarios y retención de los datos transmitidos, permisos, comportamiento al desinstalar y consentimiento explícito. La incorporación inactiva no garantiza su seguridad ni su correcto funcionamiento en Windows.
