# KAIZEN PC — diagnóstico de métodos de verificación 2FA (solo lectura)

## Objetivo

Mostrar qué métodos anuncia realmente el servidor durante el inicio de sesión normal de una cuenta propia, sin suplantar roles, modificar tokens, deshabilitar 2FA ni realizar peticiones extra. La implementación se integra en el selector de verificación de la interfaz Electron empaquetada.

## Ubicación

- `app/app_view/dist/assets/index-DAX2BPbP.js`: función pura `kzTwofaDiagnostic` y sección de resultados del selector.
- `app/tests/twofa-methods-diagnostic-scenarios.js`: comprobación offline con cinco escenarios ficticios.

## Datos visualizados (exclusivamente metadatos)

- `reportedMethods`: valores reconocidos (`app` / `email`) que aparecen expresamente en `methods` de la respuesta. Si la respuesta no contiene `methods`, se indica que **no fueron informados**.
- `effectiveMethods`: métodos que presenta el cliente. En el flujo original puede existir un *fallback* `app` cuando `requires2fa` es verdadero y `methods` no fue suministrado. Esto **no significa** que el backend acepte el método.
- `canSetupApp`: indicador booleano derivado de los campos originales `canSetupApp` y `requires2faSetup`. No verifica de forma independiente la disponibilidad del endpoint de configuración.
- `requires2fa` y `requires2faSetup`: indicadores booleanos de la respuesta.

No se muestran ni exportan valores de `tempToken`, correo, contraseña, códigos de seis dígitos, cookies o cabeceras. El diagnóstico permanece en memoria mientras está abierto el selector y no realiza solicitudes HTTP adicionales.

## Uso con una cuenta propia

1. Iniciar KAIZEN PC compilado **con los cambios de esta rama** y entrar por la pantalla habitual de correo y contraseña.
2. Si el servidor solicita 2FA, la página **«Verificación en dos pasos»** mostrará la sección **«Diagnóstico 2FA (solo lectura)»** debajo de las opciones disponibles.
3. Revisar las dos líneas de métodos anunciados y métodos ofrecidos, además del indicador «Servidor indica que permite configurar app».
4. Si solo hay `email`, **no** se habilita automáticamente `app`: hay que revisar la configuración autorizada de la cuenta en el backend o el flujo oficial de recuperación/activación.
5. Si `canSetupApp` es verdadero y el botón «Configurar app autenticadora» está disponible, puede utilizarse el procedimiento normal de configuración, con su verificación exigida por el servidor.

## Interpretación

- **Servidor anuncia aplicación:** la respuesta incluye `app`; el cliente presenta «Usar app autenticadora».
- **Servidor anuncia solo correo:** la respuesta incluye `email` pero no `app`.
- **Métodos no informados:** el servidor no proporcionó el arreglo `methods`; el cliente podría utilizar el fallback heredado. No debe interpretarse como autorización.
- **Configurar app = sí:** el servidor *indica* que se puede iniciar la configuración, pero no se confirma hasta completar legítimamente el proceso.
- **Inicio de sesión directo con token:** el selector no aparece y, por tanto, tampoco esta sección. No se puede inferir una política de roles o 2FA solo con esa observación.

## Validaciones y límites

Ejecutar sin internet: `node app/tests/twofa-methods-diagnostic-scenarios.js`.

Estas pruebas solo examinan la función de interpretación y la presencia de controles existentes. No comprueban que el servidor acepte códigos 2FA ni sustituyen una prueba manual en Windows. No se realizan pruebas invasivas ni acceso a otros usuarios.

**Importante:** la instalación que se mostró en una captura previa era KAIZEN 1.5.22; el repositorio actual declara 1.5.41. El cambio de código en una rama de GitHub no modifica automáticamente la instalación. Para verlo, hay que revisar, compilar y probar un Setup compatible; conservar copia de seguridad de perfiles.

## Nota de mantenimiento

La interfaz está distribuida como bundle compilado. Para una versión futura conviene recuperar el proyecto fuente del frontend y migrar esta funcionalidad allí en vez de mantener parches directamente sobre el archivo minificado.
