# Aplicación de códigos de pastillas

El ejecutable puede aplicar únicamente cambios individuales inequívocos. No
fusiona ni archiva productos y excluye posibles duplicados, variantes y casos
que requieren revisión. Los productos sin código oficial confirmado conservan
su código anterior. La aplicación conserva stock y ubicaciones, y registra los
documentos originales y el resultado en `pastillas_aplicacion_auditoria` dentro
de la transacción.

**No ejecutar mientras haya escritores activos.** La ventana debe estar
garantizada por el operador: detener productos, stock, movimientos,
sincronizaciones y escrituras administrativas. Una transacción snapshot no
impide inserciones concurrentes en documentos que solo se leyeron; las
confirmaciones de la CLI son declaraciones humanas, no barreras técnicas.

Antes de ejecutar, revisar el informe y el plan exactos, el destino, la
compatibilidad de referencias externas y el despliegue de la API con búsqueda
por códigos anteriores y catálogo local. Las referencias externas por código
no se actualizan automáticamente. Una aprobación de fusiones no se infiere de
la selección de cambios individuales.

## Preparación

Crear un respaldo íntegro y consistente fuera de MongoDB con las herramientas
oficiales, restaurarlo en una réplica aislada y verificar sus documentos,
índices, stock y ubicaciones. Comparar la huella de los productos restaurados
con la instantánea usada para el informe. La CLI verifica los hashes
proporcionados, pero no comprueba por sí sola que la restauración ocurrió ni que
la instantánea provenga de ese archivo. Un respaldo anterior no protege cambios
posteriores; generar y verificar uno actualizado.

La instantánea EJSON debe tener un campo `productos` con todos los documentos,
incluidos archivados, ordenados por `_id`. Desde `backend\api`, ejecutar:

```powershell
node scripts\aplicar-pastillas.js --informe-local --inventario instantanea.ejson --salida informe.json
node scripts\aplicar-pastillas.js --planificar --informe informe.json --sha256 <hash-informe> --inventario instantanea.ejson --salida plan.json
```

Los hashes se muestran en minúsculas. Revisar **todos** los elementos del plan:
`seleccionados` identifica los renombres y `excluidos` los casos sin aplicar.
Los archivos de salida no sobrescriben archivos existentes. El informe y plan
se generan usando `litton-pastillas.json` local validado, no un catálogo
publicado en Atlas.

## Verificación y ejecución

Con la cuenta y destino autorizados en la variable de entorno
`PASTILLAS_MONGODB_URI`, sin imprimir credenciales ni guardarlas en el
repositorio, la siguiente inspección vuelve a leer todos los productos dentro
de una transacción y compara el informe completo con el catálogo local:

```powershell
node scripts\aplicar-pastillas.js --verificar --informe informe.json --sha256 <hash-informe>
```

La inspección es de solo lectura y no autoriza escrituras posteriores. Una vez
garantizada la ventana y revisados informe, plan, respaldo, destino y
referencias, la ejecución individual requiere todas estas opciones:

```powershell
node scripts\aplicar-pastillas.js --aplicar --informe informe.json --sha256 <hash-informe> --plan plan.json --sha256-plan <hash-plan> --respaldo respaldo.archive.gz --sha256-respaldo <hash-respaldo> --sha256-inventario-respaldo <hash-productos-restaurados> --base <base> --replica <replica-set> --confirmar-restauracion --confirmar-ventana --confirmar-referencias
```

El hash de productos restaurados debe ser el `inventario.sha256` calculado a
partir de los documentos restaurados, no simplemente copiado sin comparación.
El aplicador compara informe, plan, catálogo e inventario actuales, así como el
hash del archivo de respaldo, el nombre de la base y el replica set. Si cambió
el inventario o algún hash, se cancela antes de escribir.
`--aplicar` sin las opciones y confirmaciones obligatorias permanece bloqueado.

Si el commit devuelve un resultado incierto, **no asumir ni éxito ni
reversión**: mantener la ventana, verificar la auditoría y los productos en el
destino y consultar el estado antes de reintentar. Una repetición con el mismo
plan solo devuelve `ya_aplicado` si la auditoría y el estado coinciden.
Comprobar siempre cantidades, ubicaciones, búsqueda y referencias antes de
reanudar las escrituras. La recuperación completa de un respaldo puede perder
cambios posteriores y requiere autorización separada.

## Fusiones y pruebas

El motor de fusión solo está disponible para pruebas aisladas. Requiere
identidad confirmada, metadatos compatibles y cobertura explícita de
referencias; no está conectado a la CLI de producción. No asumir identidad
física por similitud de códigos o pertenencia a una familia. Los conflictos
de metadatos requieren resolución antes de fusionar.

Las pruebas de integración solo se ejecutan si `PASTILLAS_TEST_MONGODB_URI`
apunta a una réplica local autenticada y aislada con conexión directa a
`127.0.0.1`. Crean y eliminan exclusivamente bases temporales de prueba:

```powershell
node --test test\pastillas-aplicacion.test.js test\pastillas-aplicacion.integration.test.js
```
