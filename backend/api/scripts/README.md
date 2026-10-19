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

