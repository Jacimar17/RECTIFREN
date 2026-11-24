# Catálogo persistente de pastillas

Estas herramientas no modifican productos, movimientos, vínculos manuales ni stock. No se ha configurado ni ejecutado ningún trabajo en Render o base de datos. La búsqueda de familias de la API carga y valida `litton-pastillas.json` del repositorio, sin publicar en MongoDB; el CSV es solo una referencia. La copia local queda en memoria hasta reiniciar el proceso, por lo que cambiar el archivo requiere reiniciar o desplegar de nuevo. La configuración web de Render usa la raíz del repositorio para incluirlo. La sincronización MongoDB descrita aquí es independiente y no actualiza automáticamente el archivo local usado por la API.

## Contrato de lectura

Para la búsqueda, `obtenerCatalogoLocal()` devuelve `{ version, fichas }`, con `version` igual a `local-` más el SHA-256 del catálogo normalizado. Una lectura inválida falla y puede reintentarse; no se usa un catálogo alternativo silenciosamente. Para las herramientas de MongoDB, con Mongoose conectado, `obtenerCatalogoActivo()` sigue devolviendo `{ version, fichas }` con un UUID v4 de la versión publicada. `fichas` es un array de objetos `{ code, name, brand, category, supplierCode, substitutes }`; cada equivalente contiene `{ code, value }` y opcionalmente `_id` string de Litton. Se recortan espacios exteriores y se omiten los sustitutos cuyo `value` sea `-` o quede vacío al recortar: indican ausencia de código, no una equivalencia indexable. Las fichas se ordenan por `code.trim().toUpperCase()` comparado por orden binario. El orden de equivalencias es el recibido. No se devuelven fechas, `_id` internos ni otros metadatos variables.

Se conservan versiones inmutables en `catalogo_pastillas_versiones` y fichas en `catalogo_pastillas_fichas`; `catalogo_pastillas_estado` apunta a la versión activa y a la anterior. La publicación inserta las fichas y metadatos, vuelve a leerlas y verificar cantidad y SHA-256, y cambia el puntero con una operación atómica condicionada a la versión previa. La versión anterior verificada permanece como respaldo en MongoDB, junto con las demás versiones; no es un respaldo externo contra pérdida del clúster. Cada manifiesto incluye procedencia, fecha y listas de altas, cambios y bajas de códigos. Los documentos incompletos de ejecuciones fallidas pueden quedar huérfanos y no son visibles. No hay limpieza automática.

La validación rechaza catálogos vacíos, fichas con errores o campos desconocidos, categorías incorrectas, campos obligatorios vacíos, valores de equivalencia que no sean cadenas, códigos de ficha duplicados y pares marca/código de equivalencia duplicados. Para detectar colisiones de códigos de ficha se usa la misma normalización que el buscador: mayúsculas y únicamente caracteres `A-Z` y `0-9`; un código sin caracteres alfanuméricos también se rechaza. Los códigos originales se conservan. Las cadenas de equivalencia vacías y `-` se consideran ausencia, no error, y se eliminan de las fichas normalizadas. Se crean validadores MongoDB estrictos para las colecciones nuevas y siempre se valida también en aplicación; si ya existen, no se alteran sus validadores. No se interpretan ni dividen códigos compuestos de Litton. La huella del catálogo se calcula sobre las fichas normalizadas y ordenadas; no es la huella del archivo original.

## Importación inicial

Desde la raíz del repositorio en Windows, sin conexión ni escrituras:

```text
node backend\api\scripts\catalogo-pastillas.js --inicial litton-pastillas.json
```

También se puede ejecutar desde `backend\api` con `node scripts\catalogo-pastillas.js --inicial ..\..\litton-pastillas.json`. La ruta del JSON se interpreta relativa al directorio desde donde se ejecuta el comando; el archivo debe estar disponible en la máquina local.

El modo predeterminado es dry-run: valida y muestra cantidad y SHA-256, sin consultar MongoDB. En el archivo histórico, los guiones sin código y el retorno de carro de ECOPADS en la ficha `46970ULT` se omiten como marcadores de ausencia; las fichas se conservan. El JSON histórico no contiene prueba de paginación completa: el operador debe comprobar su procedencia y completitud antes de confirmarlo. El dry-run solo valida contenido, no puede probar que el archivo represente todas las páginas.

Únicamente tras revisión y autorización para la base elegida, configurar la variable `CATALOGO_MONGODB_URI` fuera del repositorio y ejecutar con la huella resultante del dry-run:

Desde la raíz del repositorio en Windows:

```text
node backend\api\scripts\catalogo-pastillas.js --inicial ARCHIVO_REVISADO.json --apply --confirmar-inicial-completa --sha256 HASH_REVISADO
```

El hash se comprueba de nuevo después de adquirir el bloqueo. Se rechaza la importación inicial si ya hay una versión activa. No se utiliza automáticamente `MONGODB_URI`, `.env` ni la conexión del servidor web. Las credenciales y la selección de base son responsabilidad del operador; no colocar URI en argumentos, archivos o logs.

## Sincronización

`node scripts/catalogo-pastillas.js --sync` realiza extracción y validación de prueba sin conectarse a MongoDB ni publicar. Con `--sync --apply` requiere la variable anterior, una versión inicial activa y autorización para esa base. El bloqueo se adquiere **antes** de extraer. Se requieren todas las páginas y fichas, total y tamaño de página consistentes, cantidad esperada por página, códigos únicos y detalle de cada código coincidente. Una respuesta inválida, error de red, cambio de paginación o ficha incompleta impide publicar. Si la cantidad total cae más del 10 % o las bajas superan el 10 % del catálogo anterior, se cancela incluso si se agregaron fichas. Ninguna regla detecta todos los posibles cambios simultáneos de origen que mantengan las mismas cantidades; Litton no ofrece aquí una instantánea transaccional.

`export-litton-pastillas.js` conserva el uso normal y `--retry-errors`; ambos validan el resultado completo antes de escribir JSON/CSV. La sincronización no escribe esos archivos. La exportación de archivos no es atómica entre JSON y CSV ante una falla de disco y ninguno debe usarse como prueba automática de completitud histórica.

Los errores posteriores a adquirir el bloqueo se registran en `catalogo_pastillas_ejecuciones` y también terminan el proceso con código no cero; errores de conexión, creación de colecciones o adquisición de bloqueo aparecen en los logs del proceso. Si falla el registro de auditoría o no puede confirmarse la liberación del bloqueo, se emite una alerta explícita en stderr sin detalles de conexión y se conserva el error principal. Si solo falla la liberación, el proceso falla y la publicación podría ya haberse completado. Las URI MongoDB se omiten de los mensajes guardados y de los errores impresos por el comando. Hay reintentos HTTP acotados, no reintentos automáticos de publicación. Configurar alertas externas para ejecución fallida y revisar logs y registros; no se envían avisos por correo automáticamente.

## Bloqueo y recuperación

`catalogo_pastillas_bloqueos` contiene un único documento `publicacion` con token aleatorio y fecha. No vence automáticamente: así un proceso lento nunca pierde exclusividad. Ante un corte abrupto o cancelación puede quedar bloqueado. Verificar primero que **ningún** proceso siga ejecutándose, revisar puntero, versiones y logs, y solo entonces eliminar manualmente ese documento filtrando por `_id` y token exactos. Nunca borrar un bloqueo de un proceso activo. Si hay un error de red al terminar, comprobar la versión activa antes de volver a ejecutar: la publicación podría haberse completado. Las versiones anteriores se conservan; para restaurar, con todos los publicadores detenidos y bloqueo adquirido, verificar cantidad/hash de la versión elegida y cambiar el puntero mediante una comparación atómica contra la versión activa actual. Tomar respaldo externo y ensayar el procedimiento en una base aislada antes de usarlo.

## Render: propuesta no habilitada

Después de probar en una base aislada y con autorización expresa, crear un **Cron Job** independiente del servicio web, con root directory `backend/api`, build command `npm ci`, comando `node scripts/catalogo-pastillas.js --sync --apply` y la variable secreta específica configurada en Render. `render.yaml` solo configura el servicio web, no este cron. Con ese root directory Render no incluye el JSON de la raíz del repositorio: **la sincronización no lo necesita**, porque extrae directamente de Litton y guarda solo en MongoDB. Esta sincronización no cambia el archivo local usado por la API. La carga inicial con archivo se ejecuta localmente como se indicó arriba, no en el cron. Tampoco ejecutar allí el exportador independiente o `--retry-errors`, que usan archivos de la raíz.

Expresión `0 9 * * 0`: domingos a las 09:00 UTC, actualmente 06:00 en Buenos Aires (revisar si cambia el huso horario). Render programa en UTC, permite una ejecución activa por cron job, limita cada ejecución a 12 horas y no proporciona disco persistente al cron. Cobra por segundo activo con mínimo mensual de USD 1 por cron; consultar [documentación y precio vigente](https://render.com/docs/cronjobs) y [monorepos](https://render.com/docs/monorepo-support) antes de contratar. Una cancelación manual o límite de tiempo puede dejar el bloqueo persistente. Configurar alertas y monitorear tanto fallos como bloqueos huérfanos. Este documento no crea, habilita ni despliega el cron.
