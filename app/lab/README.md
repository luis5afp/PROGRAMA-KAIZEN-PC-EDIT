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
