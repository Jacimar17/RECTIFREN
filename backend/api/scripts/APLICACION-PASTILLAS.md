# Aplicación de pastillas: bloqueada

Este ejecutable **no aplica cambios**. El plan admite una ventana de
mantenimiento garantizada por el operador: durante ella deben permanecer
detenidos todos los escritores, incluidos movimientos, productos, catálogo,
sincronizaciones y escrituras administrativas. Una transacción de lectura por
sí sola no impide inserciones ni cambios posteriores al catálogo.

Existe un prototipo de fusión, archivado y preservación de referencias para
pruebas aisladas, pero aún no se ha habilitado ni validado para producción. Por
eso `--aplicar` se bloquea incondicionalmente, también en clústeres con
transacciones.

No ejecutar contra producción sin autorización separada y expresa. La aprobación
de un informe no autoriza por sí sola el uso de una base concreta.

## Comprobación de solo lectura

Tras generar y revisar el informe verificable con `preview-pastillas.js --atlas`,
calculá el SHA-256 del archivo exacto, por ejemplo en PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 informe.json
```

Desde `backend\api`, configurá `PASTILLAS_MONGODB_URI` en el entorno mediante un
gestor de secretos, sin incluirla en argumentos ni archivos del repositorio. La
cuenta debe ser de solo lectura y tener acceso al inventario y catálogo de la
base autorizada. Después:

```powershell
node scripts\aplicar-pastillas.js --verificar --informe informe.json --sha256 <hash-en-minusculas>
node scripts\aplicar-pastillas.js --aplicar
```

La primera operación lee todos los productos, incluso archivados, ordenados por
`_id`, y el catálogo en una misma transacción de instantánea. Recalcula el
informe completo, comprueba los hashes del inventario y catálogo y el hash del
archivo aprobado. Si el servidor no permite transacciones o existe cualquier
diferencia, falla. La salida solo identifica candidatos preliminares y excluidos;
no autoriza una aplicación posterior. La segunda operación siempre falla sin
conectarse ni escribir.
Los errores previstos y códigos habituales de MongoDB se informan sin imprimir
mensajes arbitrarios del controlador, que podrían contener credenciales. Si
fallan tanto la operación como su limpieza, se informan ambos problemas.

Solo se preparan cambios para un documento heredado inequívoco, sin revisión y
sin los posibles duplicados o alias que detecta esta comprobación preliminar.
Esa comprobación no demuestra la inexistencia de todos los duplicados. La
inspección no fusiona grupos, archiva registros ni altera referencias. El
ejemplo LPR con prefijo requiere
revisión y queda excluido. No se asignan ubicaciones ni se modifica stock.
El ejecutable no realiza ninguna actualización.

## Prototipo de pruebas

El motor aislado solo admite conexiones directas a `127.0.0.1` y bases
temporales `test_pastillas_<uuid>`; no está conectado al ejecutable de
producción. Para una fusión exige identidad confirmada por separado, código
oficial y marca exactos, metadatos compatibles y cobertura explícita de
referencias. Admite prefijos de marca y abreviaturas TRW exactas solo con
confirmación independiente de identidad; los demás motivos de revisión quedan
excluidos. Conserva el stock por ubicación, archiva los reemplazados y respalda
en la misma transacción los productos y movimientos que modifica.
Una cadena de evidencia en una simulación no constituye una aprobación humana.

Las pruebas de integración solo se ejecutan si se configura
`PASTILLAS_TEST_MONGODB_URI` para un replica set local autenticado y aislado,
usando un gestor de secretos. Crean y eliminan exclusivamente bases temporales
de prueba; nunca deben apuntar a producción. Sin esa variable se omiten:

```powershell
node --test test\pastillas-aplicacion.integration.test.js
```

La comprobación de cobertura del prototipo es una declaración del entorno de
prueba, no una prueba automática de que no existan referencias externas.

## Respaldo y restauración

El informe no es un respaldo. Antes de habilitar una futura aplicación habrá
que generar fuera de MongoDB un respaldo íntegro, consistente y verificable de
la base (incluidas colecciones, índices y opciones), más los documentos
afectados completos en BSON/EJSON sin pérdida; comprobar sus hashes y ensayar
una restauración en una base aislada. Una copia puntual no protege cambios
posteriores, y ningún archivo de informe satisface este requisito. El proyecto
no automatiza todavía la comprobación del respaldo para una aplicación.

Para recuperar datos, detener y aislar **todos** los escritores, restaurar la
copia completa con las herramientas oficiales de MongoDB en una base aislada y
comprobar documentos, índices y totales antes de autorizar una restauración en
el destino. Una restauración completa puede sobrescribir cambios posteriores:
requiere decisión y autorización explícitas, no debe hacerse automáticamente.
No se proporciona un comando de restauración automático ni reversión parcial:
no se han implementado ni probado.

Para habilitar escrituras faltan, como mínimo, la ventana sin escritores bajo
responsabilidad del operador, verificación del respaldo asociado a la ejecución
y cobertura de referencias, revisión de casos ambiguos y validación de la
aplicación en condiciones de producción. La fusión debe conservar stock por ubicación y tanto las
referencias históricas de movimientos como los vínculos entrantes y salientes.
Los productos permiten campos adicionales y no hay un inventario completo de
referencias externas: cualquier caso cuya preservación no pueda comprobarse
debe excluirse.

La ventana es una garantía operacional, no una barrera técnica: si se incumple,
una transacción de instantánea no detecta necesariamente inserciones
concurrentes o cambios en documentos que solo leyó. Los cambios de datos entre
respaldo y restauración también pueden perderse al restaurar la base completa.
