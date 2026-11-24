# Exportación de pastillas Litton

`node scripts/export-litton-pastillas.js` consulta el catálogo y genera en la raíz del repositorio `litton-pastillas.json` y `litton-pastillas.csv`. Para reintentar únicamente las fichas que fallaron en la exportación existente, ejecutar `node scripts/export-litton-pastillas.js --retry-errors`. Si la extracción o validación falla, se detiene antes de reemplazar los archivos. Ninguna de estas opciones modifica MongoDB.

La importación versionada y la sincronización independiente se describen en [Catálogo persistente de pastillas](./CATALOGO-PASTILLAS.md).

# Simulación de códigos de pastillas PD/

Para analizar una exportación JSON de la colección `productos`, ejecutar desde `backend/api`:

```powershell
node scripts/preview-pastillas.js --inventario C:\ruta\productos.json
```

La exportación debe ser una lista JSON/EJSON de documentos que incluya identificador, códigos, marca, stock, ubicación y demás datos del producto. También se admite una instantánea EJSON agrupada con `cantidad` y `documentos`, comprobando el conteo y que los identificadores sean válidos y únicos. Esta opción lee el catálogo JSON local y no se conecta a MongoDB ni modifica archivos de inventario. Redirigí la salida a un archivo privado si necesitás revisarla con detalle; puede contener información comercial.

Una instantánea obtenida desde la interfaz de Atlas es solo una fuente para el análisis: no incluye necesariamente todas las colecciones, índices ni tipos BSON originales y no sustituye un respaldo restaurable. El informe local no es el informe verificable de `--atlas` y no autoriza la aplicación de cambios.

Para consultar directamente el inventario de Atlas y el catálogo persistido activo:

```powershell
node scripts/preview-pastillas.js --atlas --salida C:\ruta\privada\informe-pastillas.json
```

La conexión usa `MONGODB_URI` desde el entorno y debe apuntar a la misma base que el catálogo importado mediante `CATALOGO_MONGODB_URI`. Esta opción solo lee la base y crea un archivo nuevo sin sobrescribir otro existente. Incluye la versión y huella del catálogo, una huella del inventario completo leído, evidencia de equivalencias y distribución de stock propuesta. No es un respaldo de los documentos ni garantiza que no haya cambios concurrentes; cualquier aplicación deberá volver a comprobar los datos y contar con un respaldo externo.

El informe propone códigos de marca cuando el catálogo los identifica sin ambigüedad, muestra candidatos por código normalizado exacto o por código precedido de la misma marca, y cantidades por ubicación. Los códigos con prefijo de marca quedan señalados para revisión. Para casos pendientes también muestra posibles coincidencias especiales, sin sumarlas ni darlas por confirmadas. Si aparece `stockIncompleto`, los totales anteriores incluyen únicamente las ubicaciones comprobadas y no deben considerarse el stock completo; los totales propuestos son `null`. El informe también señala documentos presentes en varias propuestas y diferencias de metadatos. La coincidencia no autoriza una fusión: verificá pieza, marca, atributos e historial antes de cualquier cambio. SHUNKO y otras marcas sin un código verificable quedan pendientes con su código original.

Para productos registrados como TRW se consideran las denominaciones `TRW - BRASIL` y `TRW - EXPO` del catálogo. Si aparecen códigos distintos para esas denominaciones, se informan como alternativas y no se elige uno automáticamente.

Para Liton/Litton se elige la variante `NA`; para Ultraliton/Ultralitton, la variante `ULT`. Se acepta una variante solo cuando figura en el catálogo y los códigos encontrados comparten la misma base; si falta el sufijo correspondiente o hay bases distintas, el producto queda pendiente. Las dos marcas se mantienen separadas.

Los registros pendientes se informan con `accion: "conservar_sin_cambios"`: se mantiene el código `PD/` existente, sin cambiar marca, stock ni ubicación. Mantener ese código no confirma que la pieza sea de marca FRASLE ni resuelve conflictos de datos; estos siguen visibles en el informe y no se fusionan automáticamente.

Esta herramienta solo genera un informe y no modifica productos. El informe no aprueba ni ejecuta cambios: cualquier fusión requiere revisión y autorización explícita, además de las salvaguardas del plan.

La comprobación posterior y el estado de las salvaguardas de aplicación se explican en [Aplicación de pastillas](./APLICACION-PASTILLAS.md).

# Migración de inventario RF a variantes Litton

`migrate-litton-variants.js` transforma grupos de productos `RF-*` en un documento por código principal Litton. La ficha, descripción, familia, especificaciones, imagen y equivalencias provienen del catálogo de Litton; las cantidades quedan agrupadas por marca y ubicación. Los documentos RF originales se conservan con `archivado: true` para mantener las referencias de movimientos históricos.

La migración no modifica movimientos ni debe ejecutarse contra una base real sin revisar primero la simulación y contar con una copia de seguridad externa.

## Mapeos

Cada código interno RF necesita una asignación explícita al código principal Litton. Creá un JSON local (no lo agregues al repositorio) con las correspondencias confirmadas:

```json
{
  "RF-528": "CODIGO_LITTON_CONFIRMADO"
}
```

Reemplazá `CODIGO_LITTON_CONFIRMADO` por el código correcto antes de ejecutar. Los códigos RF se normalizan para buscar el mapeo, por lo que también se acepta `"RF528"` como clave. No se intenta adivinar automáticamente entre códigos Litton similares.

## Ejecutar

Desde `backend/api`, primero simulá la migración:

```powershell
$env:MONGODB_URI = "..."
node scripts/migrate-litton-variants.js --mapping C:\ruta\mapeos-rf-litton.json
```

La simulación es el modo predeterminado y no escribe datos. Revisá que cada grupo esté mapeado, que el código Litton sea el correcto y que el total de stock y la distribución por ubicación coincidan con el inventario esperado.

Solo después de verificar la simulación, `--apply` respalda los documentos que va a modificar en una colección `productos_backup_litton_<id>` y aplica los cambios dentro de una transacción:

```powershell
node scripts/migrate-litton-variants.js --mapping C:\ruta\mapeos-rf-litton.json --apply
```

La instancia MongoDB debe admitir transacciones. Si falla la transacción, los documentos de inventario no se actualizan. El respaldo creado se conserva para recuperación.

# Migración de categorías

`migrate-categorias.js` completa el campo `categoria` de los productos que todavía no tienen una, usando reglas estrictas sobre la descripción, el título, las equivalencias, la ficha de Litton y el propio código:

- texto con "pastilla" (o "brake pad") → `Pastillas de freno`
- texto con "cable" o "comando" → `Cables comando`
- si coincide con las dos reglas, o con ninguna, el producto **no** se clasifica y se lista al final para revisarlo a mano. No adivina.

También asegura que existan las cinco categorías base del inventario.

## Ejecutar

Desde `backend/api`, primero simulá (modo por defecto, no escribe nada):

```powershell
$env:MONGODB_URI = "..."
node scripts/migrate-categorias.js
```

Revisá el informe: cuántos productos se asignarían a cada categoría y la lista de los que quedaron sin clasificar.

Antes de aplicar, hacé una copia de seguridad de la colección `productos` (por ejemplo con `mongodump` o exportando a JSON). Después:

```powershell
node scripts/migrate-categorias.js --apply
```

La migración es idempotente: solo completa categorías vacías y nunca pisa una categoría ya asignada, así que se puede correr más de una vez sin duplicar ni perder información.

