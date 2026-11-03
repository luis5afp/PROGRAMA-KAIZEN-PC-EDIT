# KAIZEN PC 1.5.34 — Diagnóstico seguro de autorización y campos disponibles

## Alcance

El programa no cambia el servidor, no modifica `isLock` ni elimina las restricciones de acceso. Amplía el diagnóstico del catálogo existente para localizar por qué los productos devueltos a una cuenta aparecen restringidos y no tienen valores disponibles en `e` y `k`.

## Nuevas comprobaciones

- `diagnostico-cliente`: identifica el perfil de la extensión y su tipo declarado para comparar la configuración con otros programas (Principal = `extension`, Google = `extension_google`, Custom = `extension_custom`). No registra token, correo ni datos de inicio de sesión.
- `productos-descifrados`: añade `habilitadas`, `bloqueoExplicito`, `bloqueoPremium` y `sinParAcceso` a los totales existentes de URL, correo, contraseña y proxy.
- El resumen distingue si el bloqueo deriva del valor explícito `isLock` o de la regla de productos premium; identifica las tarjetas autorizadas que requieren comprobación del flujo de autocompletado.
- Se mantiene la separación entre CÓDIGOS y tarjetas, así como la correlación por ventana/pestaña de Chromium.

## Cómo usarlo

1. Iniciar sesión en Principal, Google o Custom con la misma cuenta autorizada que se usa en otro programa.
2. Abrir Diagnóstico y recargar el catálogo. Comparar `diagnostico-cliente` y los conteos `bloqueoExplicito`/`bloqueoPremium`.
3. Pulsar una tarjeta autorizada y seguir `tarjeta-campos-al-clic` → `sesion-temporal-preparada` → `pestana-vinculada` → eventos del formulario.
4. Si el otro programa sí obtiene autorización para esa misma cuenta y el mismo producto, comparar su tipo de cliente y su versión contra el valor reportado.

`sinParAcceso` es solo el número de productos fuera del modo cookie donde no aparecen simultáneamente `e` y `k`; no prueba un error del servidor. Los indicadores `e/k=false` no distinguen propiedades ausentes de propiedades vacías. Una tarjeta restringida no se vuelve autorizada por abrir públicamente su URL.

## Seguridad y pruebas

Ningún valor sensible se copia a eventos, informes o archivos. Las restricciones del backend, la gestión de cookies y los archivos originales de autofill no se alteran. Las pruebas automatizadas incluyen la verificación de conteos de restricción explícita/premium y sincronización de los tres perfiles. El instalador definitivo requiere validación de compilación e instalación en Windows.
