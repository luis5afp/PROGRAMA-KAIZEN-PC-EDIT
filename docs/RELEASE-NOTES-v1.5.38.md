# KAIZEN PC 1.5.38 — Diagnóstico final de procedencia de e/k (solo lectura)

## Cambios
- Agrega contadores de **presencia**, nunca de valores, de campos alternativos de correo y contraseña en la salida de `JSON.parse` del catálogo cifrado: `eAlias`, `kAlias`, `ekPresente`.
- Compara `origen-tras-descifrado`, `productos-descifrados`, `tarjeta-campos-al-clic`, preparación de `product` y observación del formulario.
- Agrega el resumen **Veredicto de origen**, con una distinción explícita entre hechos sobre los objetos descifrados e hipótesis sobre decisiones del backend.
- Conserva `isLock`, premium, identidad de cliente y permisos. No intenta desbloquear tarjetas ni descargar credenciales omitidas.
- Mantiene los cinco paquetes de Chromium y las rutas originales de autocompletado y cookie; las tres extensiones de catálogo comparten el mismo trazador.
- Amplía las pruebas runtime y estáticas de diagnóstico para verificar contadores agregados y no exposición de valores.

## Cómo verificar

1. Abre un perfil Chromium, inicia sesión con una cuenta propia y entra al catálogo.
2. Abre **Diagnóstico → Borrar eventos** y recarga el catálogo; copia el informe nuevo de `version:7`.
3. Revisa las líneas **Inmediatamente tras descifrar**, **Comparación descifrado → catálogo** y **Veredicto de origen**.
4. Si existe una tarjeta **autorizada** de prueba, pulsa esa tarjeta (no el botón CÓDIGOS) y revisa los eventos de `product` y `formulario`.
5. Para confirmar el motivo de restricciones impuesto por el backend, se requiere código/logs del servidor o una comparación de la misma herramienta usando una segunda cuenta con permisos legítimos comprobados.

Ver [AUDITORIA-ORIGEN-CREDENCIALES-v1.5.38.md](AUDITORIA-ORIGEN-CREDENCIALES-v1.5.38.md) para el análisis completo, limitaciones de certeza y matriz de interpretación.
