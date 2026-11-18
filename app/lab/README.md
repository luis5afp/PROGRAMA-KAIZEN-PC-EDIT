# KAIZEN PC — Laboratorio experimental de 233 tarjetas (candidata 1.5.41)

Este laboratorio comprueba **si sería viable** incorporar un catálogo sin
restricciones *en un entorno de prueba*, sin modificar backend, sesiones ni
permisos de cuentas reales.

## Abrir la prueba
1. Descargar el contenido de la rama de GitHub como ZIP y extraerla.
2. Abrir `app/lab/index.html` con un navegador moderno.
3. Seleccionar **233 autorizadas y 233 pares ficticios**.
4. Pulsar **Probar todas las tarjetas**. Se esperan **233 autocompletados
   simulados, 0 omitidos, 0 fallos técnicos**.
5. Seleccionar una tarjeta y pulsar **Probar autocompletado** para observar
   cómo se rellenan los campos de un formulario ficticio en esa misma página.

También comparar:
- **233 bloqueadas, ninguna credencial:** 0 autocompletados; se espera el
  rechazo por bloqueo.
- **233 autorizadas, credenciales ausentes:** 0 autocompletados; se espera
  rechazo por ausencia de datos, aunque el indicador de autorización sea 233.

### Pruebas automatizadas
Desde la raíz del repositorio:

```bash
node app/tests/lab-233-cards-scenarios.js
```

Verifican los 233 registros, IDs únicos, coincidencia de dominio, caducidad,
llenado de los dos campos de cada formulario simulado y las protecciones que
mantienen las extensiones de producción Principal, Google y Custom.

## Seguridad y alcance real

- Las direcciones terminan en `.invalid` y los correos en
  `@kaizen.invalid`: no corresponden a sitios reales.
- El HTML tiene una política CSP que **prohíbe conexiones de red** y el envío
  de formularios; no lee cookies, archivos de usuario ni perfiles.
- Las credenciales ficticias se crean en memoria, no en
  `chrome.storage` ni en discos.
- El campo `isLock=false` existe **solo** en los registros sintéticos que
  genera `makeCatalog('authorized')`. Ningún archivo de las extensiones de
  producción modifica la autorización recibida del backend.
- Esta prueba no verifica ni cambia las 233 tarjetas del servidor real.
  El último informe real mostró 233 productos, 0 autorizados y 0 credenciales.
- Los autocompletados simulados solo prueban la lógica básica para formularios
  de dos campos. No prueban cookies, SSO, OAuth, formularios de terceros,
  captchas ni la integración end-to-end con el servidor.

## Criterios para considerar una versión de producción

Una versión nueva solo podrá usar un modo de acceso personal si la
**autorización real** y los datos de acceso provienen de fuentes controladas
por el propietario: sesión autorizada del servidor o almacén local cifrado de
credenciales propias. Deben probarse en una instalación Windows con los tres
perfiles aislados y, antes de liberar, con al menos una cuenta y una herramienta
de prueba de extremo a extremo.

No distribuir ni interpretar esta simulación como un desbloqueo real del
servidor. No hay ninguna operación de suplantación de rol, omisión de permisos
ni extracción de contraseñas.


## KAIZEN 1.5.42 — prueba de integración con API real y extensiones

La versión 1.5.42 mantiene intacta la simulación de 233 tarjetas, e introduce
una segunda sección, **Diagnóstico de integración real**, debajo del catálogo.

### 1. Consulta API del escritorio (voluntaria)
1. Iniciar sesión en la **ventana principal de KAIZEN PC**.
2. Abrir **🧪 Laboratorio 233** desde el botón visible.
3. Desplazarse hasta **Conexión API del servidor · Solo lectura**.
4. Pulsar **Comprobar APIs del escritorio**. Esta operación consulta cinco
   rutas existentes: `/api/verify-token`, `/api/browser/get`,
   `/api/browser/group/get`, `/api/browser/variant-profiles` y
   `/api/products/getmostusedtool`, usando la sesión existente de KAIZEN PC.
5. Interpretar HTTP 200 como conectividad; no supone autorización para
   autocompletar tarjetas de las extensiones.

Solo se devuelven estados HTTP, conteos de colecciones y roles del conjunto
permitido, sin texto de productos, cookies, claves ni token. La consulta es
manual y tiene un límite de frecuencia; no se realiza en segundo plano.

### 2. Diagnósticos de Principal, Google y Custom (reales)
1. Abrir cada extensión original usando los perfiles de KAIZEN.
2. En la extensión pulsar **Diagnóstico → Copiar informe** (informe sanitizado).
3. Regresar al Laboratorio, seleccionar el perfil correspondiente y pegar el
   informe de ese perfil. No pegar respuestas API, cookies ni credenciales.
4. Pulsar **Analizar informe**. Repetir para los otros dos perfiles.
5. Comparar HTTP, tarjetas descifradas, autorizadas/restringidas,
   presencia de campos `e/k` y etapas ventana/pestaña/sesión/formulario.

El analizador acepta únicamente el **resumen** de los informes originales;
elimina el texto pegado inmediatamente después de analizarlo. Los campos
concretos nunca se muestran ni se guardan. Si detecta que el informe pertenece
a otro perfil, lo rechaza.

**Limitación:** los resultados proceden de los informes reales aportados por
el usuario, no de un acceso silencioso a la sesión de cada extensión. KAIZEN
no puede conocer automáticamente los permisos de las tres extensiones a
través de la sesión del escritorio, pues las identidades podrían diferir.

### 3. Autocompletado end-to-end controlado
El simulador permite volver a comprobar formularios con dominios
`.invalid` y credenciales `@kaizen.invalid`. No inicia sesión en servicios,
ni envía formularios, ni otorga privilegios que el backend no autorizó.

**Pruebas:**
```bash
node app/tests/lab-1542-integration-scenarios.js
node app/tests/lab-233-cards-scenarios.js
```

La prueba de Chromium real también verifica la interfaz del comparador.
El instalador preliminar no se firma y se instala manualmente; no habilita
actualizaciones automáticas.
