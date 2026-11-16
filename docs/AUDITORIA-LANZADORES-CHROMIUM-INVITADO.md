# Revisión de lanzamiento de navegador — Perfiles Chromium e Invitado

## Contexto
En la captura de KAIZEN 1.5.38 el botón **Abrir perfil con EX1 y EX2**
puede abrir Chrome for Testing. La versión 1.5.39 ya cambió ese lanzador
a Chromium oficial sin marca. Sin embargo, el botón **Invitado** abre
perfiles locales mediante el núcleo heredado `app/main.min.js`, que
conservaba una tabla `BROWSER_PATHS` independiente con ubicaciones
anteriores del navegador.

## Corrección propuesta
- `app/kaizen-chromium-path.js` define una sola ubicación:
  `<carpeta de KAIZEN.exe>/KAIZEN_CHROMIUM/chrome-win/chrome.exe`.
- El selector Principal/Google/Custom consulta esa función.
- La apertura heredada y el modo Invitado también consultan la misma
  ruta para sus dos modos históricos (`nstchrome` y `chrome`).
- No se recurre a las carpetas de Chrome for Testing si Chromium no
  está presente; se informa que falta el instalador completo.
- El modo heredado continúa distinguiendo sus opciones de perfil
  aunque la ubicación del ejecutable sea común, y solicita cargar
  sus extensiones también cuando abre Chromium oficial.

## Lo que NO se cambia
- Las carpetas de perfiles, cookies, sesiones y proxies del usuario.
- La separación entre Invitado (catálogo y perfiles locales heredados)
  y Principal/Google/Custom (tres perfiles con extensiones originales).
- Las extensiones EX1/EX2, sus hashes y su verificación.
- El inicio de sesión y los permisos decididos por el servidor.
- Las actualizaciones automáticas desactivadas.

## Validación
La regresión de Windows comprueba la ruta compartida, que Invitado
continúe usando su flujo local, y el lanzamiento de los tres perfiles
originales con EX1/EX2 mediante una simulación de proceso.

Es necesario generar **un nuevo Setup completo** y realizar una prueba
gráfica de apertura en Windows para confirmar su funcionamiento real.

### Prueba manual recomendada
1. Cerrar KAIZEN y todas las ventanas de perfiles Chromium. Hacer
   copia de seguridad de los datos locales antes de reinstalar.
2. Instalar el Setup completo generado desde la rama de corrección.
   No copiar solo el .exe ni mezclar archivos de las versiones 1.5.38/1.5.39.
3. Abrir cada perfil Principal/Google/Custom y comprobar en
   `chrome://version` que el ejecutable usado es
   `KAIZEN_CHROMIUM/chrome-win/chrome.exe`.
4. Revisar en `chrome://extensions` que aparecen las extensiones
   que corresponden y que EX1/EX2 se cargan cuando está previsto.
5. Abrir Invitado con un perfil local **propio** y verificar la misma
   ruta del ejecutable, sin confundir las dos bibliotecas de perfiles.
6. Comprobar proxy, sesiones y navegación con perfiles de prueba,
   sin copiar ni divulgar tokens, cookies o credenciales.

El nombre `chrome.exe` puede seguir apareciendo en el Administrador
de tareas; lo que distingue Chrome for Testing de Chromium oficial
es la **ruta/compilación**, no el nombre del proceso.
