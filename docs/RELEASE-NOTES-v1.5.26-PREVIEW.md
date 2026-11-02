# KAIZEN PC 1.5.26 — Vista de diagnóstico del catálogo Premium (PREVIEW)

Esta compilación de prueba conserva íntegros los mecanismos de autorización para Principal 2.5.6, Google 1.0.3 y Streaming/Custom 1.0.6.

**Nueva interacción:** al pulsar una tarjeta marcada como `is_premium` o `isLock`, la interfaz explica por qué está bloqueada. Antes, el componente eliminaba el controlador de clic y no ofrecía respuesta.

**No desbloquea herramientas Premium** ni ejecuta la apertura de recursos o sesiones protegidos. Se mantienen la comprobación `Only premium user`, la respuesta del endpoint `/api/shops/extension` y los permisos del servidor.

Los scripts modificados para la prueba son:
- `KAIZZEN_MAIN/assets/index-B-06emjA.js`
- `KAIZZEN_GOOGLE/assets/index-DhjpRuHp.js`
- `KAIZZEN_CUSTOM/assets/index-DtDn-2PW.js`

EX1/EX2 siguen siendo obligatorias en cada perfil Chromium y se verifican sus seis archivos originales por SHA-256. Sus scripts no se modificaron.

## Qué verificar en Windows

1. Instalar el Setup **PREVIEW**, cerrar previamente Chrome for Testing.
2. Abrir Principal, Google y Custom.
3. Entrar a cada catálogo, pulsar una tarjeta `Solo Premium` y comprobar que aparezca un aviso que indique el motivo.
4. Confirmar que no se abre una sesión ni recurso protegido y que las tarjetas gratuitas continúan funcionando.
5. Comprobar las tres extensiones por perfil en Chrome.

Si el objetivo comercial es habilitar las herramientas Premium para determinadas cuentas, se deben actualizar las autorizaciones de esas cuentas y la respuesta del backend; cambiar banderas locales no concede permisos reales. No publicar la prueba como versión estable hasta validar esos permisos.
