const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { crearInformeVerificable } = require("../src/migrations/pastillas-informe");
const { huella } = require("../src/migrations/pastillas-informe");
const { ErrorSeguro, conLimpieza, diagnosticos } = require("../src/migrations/pastillas-errores");
const { hashArchivo, verificarInforme, seleccionarCambios, construirActualizacion,
  inspeccionarEnTransaccion, crearPlan, crearPlanFusion, crearPlanFusiones, ejecutarEnReplicaAislada,
  ejecutarCodigosConVentana, ejecutarFusionesConVentana, aplicar } = require("../src/migrations/pastillas-aplicacion");

const catalogo = { version: "v1", fichas: [{ code: "A", brand: "LITTON", substitutes: [
  { code: "FRASLE", value: "PD/528" }, { code: "LPR", value: "05P1379" },
] }] };
const producto = { _id: "1", codigo: "PD/528", CODIGO: "PD/528", marca: "LPR",
  stock: 5, ubicacion: "NEGOCIO", camposExtra: { nota: "preservar" } };
const archivo = productos => Buffer.from(JSON.stringify(crearInformeVerificable(productos, catalogo)));

test("recalcula informe íntegro y exige aprobación del archivo exacto", () => {
  const bytes = archivo([producto]);
  const hash = hashArchivo(bytes);
  assert.equal(verificarInforme(bytes, hash, [producto], catalogo).propuestas.length, 1);
  assert.throws(() => verificarInforme(bytes, "0".repeat(64), [producto], catalogo), /aprobación/);
  assert.throws(() => verificarInforme(bytes, hash, [{ ...producto, stock: 6 }], catalogo), /actuales/);
  assert.throws(() => verificarInforme(bytes, hash, [producto], { ...catalogo, version: "v2" }), /actuales/);
  const editado = JSON.parse(bytes);
  editado.propuestas[0].requiereRevision = [];
  editado.propuestas[0].codigoOficial = "OTRO";
  const alterado = Buffer.from(JSON.stringify(editado));
  assert.throws(() => verificarInforme(alterado, hashArchivo(alterado), [producto], catalogo), /actuales/);
});

test("excluye prefijo LPR revisable, fusiones y posibles duplicados por alias", () => {
  const destino = { _id: "2", codigo: "LPR05P1379", marca: "LPR", stock: 7, ubicacion: "DEPOSITO_GALPON" };
  let productos = [producto, destino];
  let informe = crearInformeVerificable(productos, catalogo);
  assert.ok(informe.propuestas[0].requiereRevision.length);
  assert.equal(seleccionarCambios(informe, productos).seleccionados.length, 0);
  productos = [producto, { ...destino, codigo: "05P1379" }];
  informe = crearInformeVerificable(productos, catalogo);
  assert.equal(seleccionarCambios(informe, productos).seleccionados.length, 0);
  productos = [producto, { ...destino, codigo: "OTRO", codigosAnteriores: ["05P1379"] }];
  informe = crearInformeVerificable(productos, catalogo);
  assert.equal(seleccionarCambios(informe, productos).seleccionados.length, 0);
});

test("prepara solo actualización puntual y conserva ambos códigos antiguos", () => {
  const actual = { ...producto, CODIGO: "PD 528", codigosAnteriores: ["VIEJO"] };
  const informe = crearInformeVerificable([actual], catalogo);
  const [cambio] = seleccionarCambios(informe, [actual]).seleccionados;
  const update = construirActualizacion(actual, cambio, "a".repeat(64), new Date("2026-01-01"));
  assert.deepEqual(update.$addToSet.codigosAnteriores.$each, ["PD/528", "PD 528"]);
  assert.deepEqual(Object.keys(update.$set).sort(), ["CODIGO", "codigo", "migracionPastillas"]);
  assert.equal(update.$set.codigo, "05P1379");
  assert.equal(update.$set.marca, undefined);
  assert.equal(update.$set.MARCA, undefined);
  assert.deepEqual(actual.camposExtra, { nota: "preservar" });
  assert.throws(() => construirActualizacion({ ...actual, migracionPastillas: {} }, cambio, "a".repeat(64), new Date()), /inválidos/);
  assert.throws(aplicar, /bloqueada/);
});

test("la inspección cancela la transacción y no escribe ante conflicto ni éxito", async () => {
  const bytesInforme = archivo([producto]);
  let abortos = 0, escrituras = 0;
  const session = { startTransaction: () => {}, abortTransaction: async () => { abortos++; },
    commitTransaction: async () => { escrituras++; } };
  const opciones = { session, bytesInforme, hashAprobado: hashArchivo(bytesInforme),
    leerProductos: async () => [producto], leerCatalogo: async () => catalogo };
  assert.equal((await inspeccionarEnTransaccion(opciones)).seleccionados.length, 1);
  await assert.rejects(inspeccionarEnTransaccion({ ...opciones,
    leerProductos: async () => [{ ...producto, stock: 6 }] }), /actuales/);
  await assert.rejects(inspeccionarEnTransaccion({ ...opciones,
    leerCatalogo: async () => { throw new Error("WriteConflict"); } }), /WriteConflict/);
  assert.equal(abortos, 3);
  assert.equal(escrituras, 0);
});

test("si el clúster no admite transacciones la inspección falla sin escribir", async () => {
  let lecturas = 0;
  await assert.rejects(inspeccionarEnTransaccion({
    session: { startTransaction() { throw new Error("No transactions"); } },
    leerProductos: () => { lecturas++; },
  }), /No transactions/);
  assert.equal(lecturas, 0);
});

test("una repetición con datos cambiados no acepta el informe anterior", () => {
  const bytes = archivo([producto]);
  const actualizado = { ...producto, codigo: "05P1379", CODIGO: "05P1379", codigosAnteriores: ["PD/528"] };
  assert.throws(() => verificarInforme(bytes, hashArchivo(bytes), [actualizado], catalogo), /actuales/);
});

test("conserva los códigos PD sin cambio cuando el catálogo no identifica un código oficial", () => {
  const sinEquivalencia = { _id: "2", codigo: "PD/528", marca: "SHUNKO", stock: 7,
    ubicacion: "DEPOSITO_GALPON" };
  const productos = [producto, sinEquivalencia];
  const informe = crearInformeVerificable(productos, catalogo);
  assert.equal(informe.pendientes[0].accion, "conservar_sin_cambios");
  assert.equal(informe.pendientes[0].producto.codigo, "PD/528");
  const cambios = seleccionarCambios(informe, productos).seleccionados;
  assert.deepEqual(cambios.map((cambio) => cambio.id), ["1"]);
  assert.deepEqual(sinEquivalencia, { _id: "2", codigo: "PD/528", marca: "SHUNKO",
    stock: 7, ubicacion: "DEPOSITO_GALPON" });
});

test("mantiene la causa original y cada fallo de limpieza sin mostrar credenciales", async () => {
  const conflicto = Object.assign(new Error("mongodb://user:secret@example.invalid"), { code: 112 });
  const falloRed = Object.assign(new Error("password=secret"), { name: "MongoNetworkError" });
  let capturado;
  try {
    await conLimpieza(() => conLimpieza(() => conLimpieza(
      async () => { throw conflicto; },
      async () => { throw falloRed; }, "abortar"),
    async () => { throw falloRed; }, "sesion"),
    async () => { throw falloRed; }, "conexion");
  } catch (error) {
    capturado = error;
  }
  const salida = diagnosticos(capturado).join("\n");
  assert.match(salida, /conflicto/);
  assert.match(salida, /cancelar la transacción/);
  assert.match(salida, /cerrar la sesión/);
  assert.match(salida, /cerrar la conexión/);
  assert.doesNotMatch(salida, /secret|user|example\.invalid/);
});

test("explica errores conocidos y oculta texto arbitrario del controlador", () => {
  assert.deepEqual(diagnosticos(new ErrorSeguro("La huella aprobada no coincide.")),
    ["La huella aprobada no coincide."]);
  assert.match(diagnosticos(Object.assign(new Error("credentials"), { code: 20 }))[0], /no admite/);
  assert.doesNotMatch(diagnosticos(new Error("password=micontraseña")).join(), /micontraseña/);
});

test("si falla la lectura y abortar también falla, se conservan ambos errores", async () => {
  const session = { startTransaction() {}, async abortTransaction() { throw new Error("abort falló"); } };
  await assert.rejects(inspeccionarEnTransaccion({
    session, leerProductos: async () => { throw new ErrorSeguro("Lectura fallida."); },
  }), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0].message, "Lectura fallida.");
    assert.equal(error.errors[1].cause.message, "abort falló");
    return true;
  });
});

test("el ejecutable informa uso y bloqueo sin conectarse ni filtrar URI", () => {
  const ejecutable = path.join(__dirname, "..", "scripts", "aplicar-pastillas.js");
  const options = { encoding: "utf8", env: { ...process.env,
    PASTILLAS_MONGODB_URI: "mongodb://usuario:secreto@invalid.example/base" } };
  const uso = spawnSync(process.execPath, [ejecutable, "--incorrecto"], options);
  assert.notEqual(uso.status, 0);
  assert.match(uso.stderr, /Uso:/);
  assert.doesNotMatch(uso.stderr, /usuario|secreto|invalid\.example/);
  const bloqueado = spawnSync(process.execPath, [ejecutable, "--aplicar"], options);
  assert.notEqual(bloqueado.status, 0);
  assert.match(bloqueado.stderr, /Aplicación bloqueada/);
  assert.doesNotMatch(bloqueado.stderr, /usuario|secreto|invalid\.example/);
});

function replicaDePrueba(iniciales, catalogoInicial = catalogo, movimientosIniciales = []) {
  let estado = { productos: structuredClone(iniciales), catalogo: structuredClone(catalogoInicial),
    movimientos: structuredClone(movimientosIniciales), auditorias: [] };
  let transaccion;
  const fallos = {};
  const session = {
    startTransaction() { transaccion = structuredClone(estado); },
    async abortTransaction() { transaccion = null; },
    async commitTransaction() {
      if (fallos.commit) throw new Error("commit falló");
      estado = transaccion;
      transaccion = null;
    },
  };
  const comprobarSesion = opciones => assert.equal(opciones.session, session);
  const cliente = { options: { directConnection: true, hosts: [{ host: "127.0.0.1" }] } };
  session.client = cliente;
  const db = { client: cliente, databaseName: `test_pastillas_${"a".repeat(32)}`, collection(nombre) {
    if (nombre === "productos" || nombre === "movimientos") return {
      find(filtro, opciones) {
        comprobarSesion(opciones);
        return { sort() { return { toArray: async () => structuredClone(transaccion[nombre]) }; } };
      },
      async replaceOne(filtro, documento, opciones) {
        comprobarSesion(opciones);
        if (fallos.reemplazo || (nombre === "movimientos" && fallos.movimiento)) return { matchedCount: 0 };
        const indice = transaccion[nombre].findIndex(p => p._id === filtro._id);
        if (indice < 0) return { matchedCount: 0 };
        transaccion[nombre][indice] = structuredClone(documento);
        return { matchedCount: 1 };
      },
    };
    assert.equal(nombre, "pastillas_aplicacion_auditoria");
    return {
      async findOne(filtro, opciones) {
        comprobarSesion(opciones);
        return structuredClone(transaccion.auditorias.find(a => a._id === filtro._id) || null);
      },
      async insertOne(documento, opciones) {
        comprobarSesion(opciones);
        if (fallos.auditoria) throw new Error("auditoría falló");
        if (transaccion.auditorias.some(a => a._id === documento._id)) throw new Error("duplicado");
        transaccion.auditorias.push(structuredClone(documento));
      },
    };
  } };
  return {
    db, session, fallos,
    leerCatalogo: async (_, s) => { assert.equal(s, session); return structuredClone(transaccion.catalogo); },
    verificarAislamiento: async (_, s) => { assert.equal(s, session); return true; },
    verificarCobertura: async (_, s) => { assert.equal(s, session); return true; },
    estado: () => structuredClone(estado),
    alterar: fn => fn(estado),
  };
}

function opcionesReplica(replica, productos = [producto]) {
  const bytesInforme = archivo(productos);
  const hashAprobado = hashArchivo(bytesInforme);
  const bytesPlan = Buffer.from(JSON.stringify(crearPlan(
    crearInformeVerificable(productos, catalogo), productos, hashAprobado)));
  return { ...replica, soloPruebas: true, bytesInforme, hashAprobado, bytesPlan,
    hashPlan: hashArchivo(bytesPlan), fecha: new Date("2026-01-01T00:00:00Z") };
}

test("aplicación de códigos exige respaldo, destino y garantías explícitas", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const ruta = fs.mkdtempSync(path.join(os.tmpdir(), "pastillas-respaldo-"));
  const respaldo = path.join(ruta, "respaldo.gz");
  fs.writeFileSync(respaldo, "respaldo de prueba");
  const replica = replicaDePrueba([producto]);
  replica.db.admin = () => ({ command: async () => ({ isWritablePrimary: true, setName: "rs-test" }) });
  const opciones = { ...opcionesReplica(replica), baseAprobada: replica.db.databaseName,
    replicaAprobada: "rs-test", archivoRespaldo: respaldo,
    hashRespaldoAprobado: hashArchivo(fs.readFileSync(respaldo)),
    hashInventarioRespaldo: huella([producto]),
    restauracionComprobada: true, ventanaSinEscritoresConfirmada: true, referenciasExternasRevisadas: true };
  try {
    for (const cambio of [
      { restauracionComprobada: false },
      { ventanaSinEscritoresConfirmada: false },
      { referenciasExternasRevisadas: false },
      { baseAprobada: "otra" },
      { replicaAprobada: "otra" },
      { hashRespaldoAprobado: "0".repeat(64) },
      { hashInventarioRespaldo: "0".repeat(64) },
      { bytesPlan: Buffer.from(JSON.stringify({ version: 2 })) },
    ]) {
      await assert.rejects(ejecutarCodigosConVentana({ ...opciones, ...cambio }));
      assert.equal(replica.estado().auditorias.length, 0);
      assert.equal(replica.estado().productos[0].codigo, "PD/528");
    }
    assert.deepEqual(await ejecutarCodigosConVentana(opciones), { estado: "aplicado", seleccionados: 1 });
    const estado = replica.estado();
    assert.equal(estado.productos[0].codigo, "05P1379");
    assert.equal(estado.productos[0].stock, 5);
    assert.equal(estado.productos[0].ubicacion, "NEGOCIO");
    assert.equal(estado.auditorias[0].respaldoSha256, opciones.hashRespaldoAprobado);
    assert.equal(estado.auditorias[0].base, opciones.baseAprobada);
    assert.equal(estado.auditorias[0].replica, opciones.replicaAprobada);
    assert.deepEqual(await ejecutarCodigosConVentana(opciones), { estado: "ya_aplicado", seleccionados: 1 });
    assert.deepEqual(replica.estado(), estado);
    replica.alterar(e => { e.auditorias[0].respaldoSha256 = "0".repeat(64); });
    await assert.rejects(ejecutarCodigosConVentana(opciones), /auditoría existente/);
  } finally {
    fs.rmSync(respaldo);
    fs.rmdirSync(ruta);
  }
});

test("un fallo del commit comunica resultado incierto en lugar de afirmar reversión", async () => {
  const replica = replicaDePrueba([producto]);
  replica.fallos.commit = true;
  await assert.rejects(ejecutarEnReplicaAislada(opcionesReplica(replica)), /No se pudo confirmar el commit/);
});

test("una respuesta perdida tras el commit se reconoce al reintentar mediante la auditoría", async () => {
  const replica = replicaDePrueba([producto]);
  const opciones = opcionesReplica(replica);
  const commit = replica.session.commitTransaction;
  replica.session.commitTransaction = async () => {
    await commit();
    throw new Error("respuesta perdida");
  };
  await assert.rejects(ejecutarEnReplicaAislada(opciones), /No se pudo confirmar el commit/);
  assert.equal(replica.estado().productos[0].codigo, "05P1379");
  assert.equal(replica.estado().auditorias.length, 1);
  assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "ya_aplicado", seleccionados: 1 });
});

test("motor aislado registra respaldo integral y conserva datos; repetición comprobada es idempotente", async () => {
  const original = { ...producto, equivalentesVinculados: ["otra"], datosNoEsquematizados: { a: 9 } };
  const replica = replicaDePrueba([original]);
  const opciones = opcionesReplica(replica, [original]);
  assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "aplicado", seleccionados: 1 });
  const estado = replica.estado();
  assert.deepEqual(estado.auditorias[0].respaldos, [original]);
  assert.equal(estado.productos[0].codigo, "05P1379");
  assert.equal(estado.productos[0].stock, 5);
  assert.equal(estado.productos[0].ubicacion, "NEGOCIO");
  assert.deepEqual(estado.productos[0].equivalentesVinculados, ["otra"]);
  assert.deepEqual(estado.productos[0].datosNoEsquematizados, { a: 9 });
  assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "ya_aplicado", seleccionados: 1 });
  assert.deepEqual(replica.estado(), estado);
  replica.alterar(e => { e.productos[0].stock++; });
  await assert.rejects(ejecutarEnReplicaAislada(opciones), /no se pueden verificar/);
});

test("rechaza alteraciones de plan, informe, catálogo o inventario antes de escribir", async () => {
  for (const cambiar of [
    ({ opciones }) => { opciones.hashPlan = "0".repeat(64); },
    ({ opciones }) => { opciones.hashAprobado = "0".repeat(64); },
    ({ replica }) => replica.alterar(e => { e.productos[0].camposExtra.nota = "cambio"; }),
    ({ replica }) => replica.alterar(e => { e.catalogo.version = "v2"; }),
    ({ opciones }) => {
      const plan = JSON.parse(opciones.bytesPlan);
      plan.seleccionados[0].codigoOficial = "OTRO";
      opciones.bytesPlan = Buffer.from(JSON.stringify(plan));
      opciones.hashPlan = hashArchivo(opciones.bytesPlan);
    },
  ]) {
    const replica = replicaDePrueba([producto]);
    const opciones = opcionesReplica(replica);
    cambiar({ replica, opciones });
    const antes = replica.estado();
    await assert.rejects(ejecutarEnReplicaAislada(opciones));
    assert.deepEqual(replica.estado(), antes);
  }
});

test("fallos de auditoría y reemplazo no dejan cambios visibles en el adaptador de prueba", async () => {
  for (const fallo of ["auditoria", "reemplazo"]) {
    const replica = replicaDePrueba([producto]);
    const antes = replica.estado();
    replica.fallos[fallo] = true;
    await assert.rejects(ejecutarEnReplicaAislada(opcionesReplica(replica)));
    assert.deepEqual(replica.estado(), antes);
  }
});

test("no actúa sin aislamiento explícito y excluye fusiones y códigos prefijados", async () => {
  const replica = replicaDePrueba([producto]);
  const opciones = opcionesReplica(replica);
  await assert.rejects(ejecutarEnReplicaAislada({ ...opciones, soloPruebas: false }), /pruebas aislado/);
  await assert.rejects(ejecutarEnReplicaAislada({ ...opciones,
    db: { ...replica.db, databaseName: "rectifren" } }), /pruebas aislado/);
  const remoto = { options: { directConnection: true, hosts: [{ host: "atlas.example" }] } };
  await assert.rejects(ejecutarEnReplicaAislada({ ...opciones,
    db: { ...replica.db, client: remoto }, session: { ...replica.session, client: remoto } }), /pruebas aislado/);
  await assert.rejects(ejecutarEnReplicaAislada({ ...opciones, session: { ...replica.session, client: {} } }),
    /pruebas aislado/);
  await assert.rejects(ejecutarEnReplicaAislada({ ...opciones, verificarAislamiento: async () => false }), /aislamiento/);
  assert.equal(replica.estado().auditorias.length, 0);
  const destino = { _id: "2", codigo: "05P1379", marca: "LPR", stock: 7, ubicacion: "DEPOSITO_GALPON" };
  for (const codigo of ["05P1379", "LPR05P1379"]) {
    const productos = [producto, { ...destino, codigo }];
    const r = replicaDePrueba(productos);
    assert.deepEqual(await ejecutarEnReplicaAislada(opcionesReplica(r, productos)),
      { estado: "sin_cambios", seleccionados: 0 });
    assert.deepEqual(r.estado().productos, productos);
    assert.equal(r.estado().auditorias.length, 0);
  }
});

test("excluye posible duplicado oculto en variantes o con prefijo", () => {
  const otro = { _id: "2", codigo: "OTRO", marca: "OTRA", stock: 1, ubicacion: "NEGOCIO",
    schemaVersion: 2, variantes: [{ codigo: "MARCA05P1379", marca: "OTRA", ubicacion: "NEGOCIO", cantidad: 1 }] };
  const productos = [producto, otro];
  assert.equal(seleccionarCambios(crearInformeVerificable(productos, catalogo), productos).seleccionados.length, 0);
});

test("no acepta una auditoría adulterada aun si su hash de inventario se recalcula", async () => {
  const replica = replicaDePrueba([producto]);
  const opciones = opcionesReplica(replica);
  await ejecutarEnReplicaAislada(opciones);
  replica.alterar(e => {
    e.productos[0].camposExtra.nota = "alterado";
    e.auditorias[0].inventarioDespues = huella(e.productos);
  });
  await assert.rejects(ejecutarEnReplicaAislada(opciones), /cambios aprobados/);
});

test("excluye grupos con metadatos incompatibles sin alterar variantes ni stock", async () => {
  const destino = { ...producto, _id: "2", codigo: "05P1379", CODIGO: "05P1379",
    stock: 7, ubicacion: "DEPOSITO_GALPON", precio: 99 };
  const productos = [{ ...producto, precio: 10 }, destino,
    { _id: "3", codigo: "OTRO", marca: "OTRA", schemaVersion: 2,
      variantes: [{ marca: "OTRA", ubicacion: "NEGOCIO", cantidad: 11, stockMinimo: 3 }] }];
  const replica = replicaDePrueba(productos);
  const informe = crearInformeVerificable(productos, catalogo);
  assert.ok(informe.propuestas[0].requiereRevision.some(m => m.includes("precio")));
  assert.deepEqual(await ejecutarEnReplicaAislada(opcionesReplica(replica, productos)),
    { estado: "sin_cambios", seleccionados: 0 });
  assert.deepEqual(replica.estado().productos, productos);
});

function datosFusion() {
  const origen = { ...producto, stockMinimo: 2, equivalentesVinculados: ["3"] };
  const destino = { ...origen, _id: "2", codigo: "05P1379", CODIGO: "05P1379",
    stock: 7, ubicacion: "DEPOSITO_GALPON" };
  const vinculado = { _id: "3", codigo: "AJENO", marca: "OTRA", stock: 1, ubicacion: "NEGOCIO",
    equivalentesVinculados: ["1"] };
  const movimientos = [
    { _id: "m1", productoId: "1", codigo: "PD/528", marca: "LPR", cantidad: 2, nota: "histórico" },
    { _id: "m2", productoId: "2", codigo: "05P1379", marca: "LPR", cantidad: 3 },
  ];
  return { productos: [origen, destino, vinculado], movimientos,
    confirmacion: { ids: ["1", "2"], destino: "2", evidencia: "Identidad física comprobada en prueba" } };
}

function opcionesFusion(replica, datos, catalogoActual = catalogo) {
  const informe = crearInformeVerificable(datos.productos, catalogoActual);
  const bytesInforme = Buffer.from(JSON.stringify(informe));
  const hashAprobado = hashArchivo(bytesInforme);
  const plan = crearPlanFusion(informe, datos.productos, datos.movimientos, hashAprobado, datos.confirmacion);
  const bytesPlan = Buffer.from(JSON.stringify(plan));
  return { ...replica, soloPruebas: true, bytesInforme, hashAprobado, bytesPlan,
    hashPlan: hashArchivo(bytesPlan), fecha: new Date("2026-01-01T00:00:00Z"), plan };
}

test("valida stock mínimo por ubicación y bloquea diferencias dentro de la misma", () => {
  const datos = datosFusion();
  datos.productos[1].stockMinimo = 3;
  assert.ok(opcionesFusion(replicaDePrueba(datos.productos), datos).plan.fusion);
  datos.productos[1].ubicacion = "NEGOCIO";
  assert.equal(opcionesFusion(replicaDePrueba(datos.productos), datos).plan.fusion, null);
});

test("lote de fusiones es atómico, preserva ubicaciones y verifica auditoría al repetir", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pastillas-lote-"));
  const respaldo = path.join(dir, "respaldo.gz");
  fs.writeFileSync(respaldo, "respaldo de prueba");
  const datos = datosFusion();
  const lprOrigen = datos.productos[0];
  const lprDestino = datos.productos[1];
  Object.assign(lprOrigen, {
    archivado: false, camposExtra: {}, descripcion: "", equivalenciasCatalogo: [],
    equivalentesVinculados: [], foto: "", imagenLitton: "", precio: 0,
    schemaVersion: 1, stockMinimo: 2, titulo: "",
  });
  for (const campo of ["archivado", "camposExtra", "descripcion", "equivalenciasCatalogo",
    "equivalentesVinculados", "foto", "imagenLitton", "precio", "schemaVersion", "stockMinimo", "titulo"]) {
    delete lprDestino[campo];
  }
  datos.productos.push(
    { _id: "4", codigo: "PD/60", marca: "TRW", stock: 5, ubicacion: "NEGOCIO" },
    { _id: "5", codigo: "TRW02130", marca: "TRW", stock: 6, ubicacion: "DEPOSITO_GALPON" });
  datos.movimientos.push({ _id: "m3", productoId: "4", codigo: "PD/60", marca: "TRW", cantidad: 1 });
  const catalogoLote = { ...catalogo, fichas: [...catalogo.fichas, { code: "B", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/60" }, { code: "TRW", value: "RCPT02130" },
  ] }] };
  const confirmaciones = [datos.confirmacion,
    { ids: ["4", "5"], destino: "5", evidencia: "Identidad confirmada" }];
  const informe = crearInformeVerificable(datos.productos, catalogoLote);
  const bytesInforme = Buffer.from(JSON.stringify(informe));
  const hashAprobado = hashArchivo(bytesInforme);
  const plan = crearPlanFusiones(informe, datos.productos, datos.movimientos, catalogoLote, hashAprobado, confirmaciones);
  const bytesPlan = Buffer.from(JSON.stringify(plan));
  const replica = replicaDePrueba(datos.productos, catalogoLote, datos.movimientos);
  replica.db.admin = () => ({ command: async () => ({ isWritablePrimary: true, setName: "rs-test" }) });
  const opciones = { ...replica, bytesInforme, hashAprobado, bytesPlan, hashPlan: hashArchivo(bytesPlan),
    fecha: new Date("2026-01-01"), baseAprobada: replica.db.databaseName, replicaAprobada: "rs-test",
    archivoRespaldo: respaldo, hashRespaldoAprobado: hashArchivo(fs.readFileSync(respaldo)),
    hashInventarioRespaldo: huella(datos.productos), restauracionComprobada: true,
    ventanaSinEscritoresConfirmada: true, referenciasExternasRevisadas: true };
  try {
    assert.equal(plan.fusiones.length, 2);
    for (const cambio of [
      { ventanaSinEscritoresConfirmada: false },
      { referenciasExternasRevisadas: false },
      { baseAprobada: "otra" },
      { replicaAprobada: "otra" },
      { hashInventarioRespaldo: "0".repeat(64) },
      { hashRespaldoAprobado: "0".repeat(64) },
      { hashPlan: "0".repeat(64) },
    ]) await assert.rejects(ejecutarFusionesConVentana({ ...opciones, ...cambio }));
    assert.throws(() => crearPlanFusiones(informe, datos.productos, datos.movimientos, catalogoLote,
      hashAprobado, [datos.confirmacion, datos.confirmacion]), /repetidos/);
    const antes = replica.estado();
    replica.fallos.movimiento = true;
    await assert.rejects(ejecutarFusionesConVentana(opciones), /movimiento/);
    assert.deepEqual(replica.estado(), antes);
    replica.fallos.movimiento = false;
    const commit = replica.session.commitTransaction;
    replica.session.commitTransaction = async () => { await commit(); throw new Error("respuesta perdida"); };
    await assert.rejects(ejecutarFusionesConVentana(opciones), /No se pudo confirmar el commit/);
    replica.session.commitTransaction = commit;
    const estado = replica.estado();
    assert.equal(estado.productos[0].archivado, true);
    assert.equal(estado.productos[3].archivado, true);
    assert.deepEqual(estado.productos[1].variantes.map(v => [v.ubicacion, v.cantidad]),
      [["NEGOCIO", 5], ["DEPOSITO_GALPON", 7]]);
    assert.deepEqual(estado.productos[1].variantes.map(v => [v.ubicacion, v.stockMinimo ?? null]),
      [["NEGOCIO", 2], ["DEPOSITO_GALPON", null]]);
    assert.deepEqual(estado.productos[1].camposExtra, {});
    assert.equal(estado.productos[1].descripcion, "");
    assert.equal(estado.productos[1].precio, 0);
    assert.deepEqual(estado.productos[4].variantes.map(v => [v.ubicacion, v.cantidad]),
      [["NEGOCIO", 5], ["DEPOSITO_GALPON", 6]]);
    assert.equal(estado.movimientos[0].productoId, "2");
    assert.equal(estado.movimientos[2].productoId, "5");
    assert.deepEqual(await ejecutarFusionesConVentana(opciones), { estado: "ya_aplicado", fusiones: 2 });
    replica.alterar(e => { e.movimientos[0].cantidad++; });
    await assert.rejects(ejecutarFusionesConVentana(opciones), /estado actual/);
  } finally {
    fs.rmSync(respaldo);
    fs.rmdirSync(dir);
  }
});

test("fusión aislada conserva ubicaciones, archiva, redirige vínculos y movimientos y es idempotente", async () => {
  const datos = datosFusion();
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  assert.ok(opciones.plan.fusion, JSON.stringify(opciones.plan));
  assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "aplicado", seleccionados: 1 });
  const estado = replica.estado();
  const [origen, destino, vinculado] = estado.productos;
  assert.equal(origen.archivado, true);
  assert.equal(origen.migracionPastillas.reemplazadoPor, "2");
  assert.equal(origen.stock, 5);
  assert.deepEqual(destino.variantes.map(({ marca, ubicacion, cantidad, stockMinimo }) =>
    ({ marca, ubicacion, cantidad, stockMinimo })), [
    { marca: "LPR", ubicacion: "NEGOCIO", cantidad: 5, stockMinimo: 2 },
    { marca: "LPR", ubicacion: "DEPOSITO_GALPON", cantidad: 7, stockMinimo: 2 },
  ]);
  assert.equal(destino.stock, 12);
  assert.deepEqual(destino.codigosAnteriores, ["PD/528"]);
  assert.deepEqual(destino.camposExtra, datos.productos[0].camposExtra);
  assert.deepEqual(destino.equivalentesVinculados, ["3"]);
  assert.deepEqual(vinculado.equivalentesVinculados, ["2"]);
  assert.equal(estado.movimientos[0].productoId, "2");
  assert.equal(estado.movimientos[0].referenciaPastillasOriginal.productoId, "1");
  assert.equal(estado.movimientos[0].codigo, "PD/528");
  assert.equal(estado.movimientos[0].nota, "histórico");
  assert.deepEqual(estado.movimientos[1], datos.movimientos[1]);
  assert.deepEqual(estado.auditorias[0].respaldos, datos.productos);
  assert.deepEqual(estado.auditorias[0].respaldosMovimientos, [datos.movimientos[0]]);
  assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "ya_aplicado", seleccionados: 1 });
  assert.deepEqual(replica.estado(), estado);
});

test("falla la fusión completa si fallan referencias, auditoría o commit", async () => {
  for (const fallo of ["auditoria", "reemplazo", "movimiento", "commit"]) {
    const datos = datosFusion();
    const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
    const opciones = opcionesFusion(replica, datos);
    assert.ok(opciones.plan.fusion, JSON.stringify(opciones.plan));
    const antes = replica.estado();
    replica.fallos[fallo] = true;
    await assert.rejects(ejecutarEnReplicaAislada(opciones));
    assert.deepEqual(replica.estado(), antes);
  }
});

test("excluye fusiones ambiguas y referencias no demostrables", async () => {
  for (const alterar of [
    d => { d.confirmacion.evidencia = ""; },
    d => { d.productos[1].codigo = d.productos[1].CODIGO = "LPRX05P1379"; },
    d => { d.productos[1].marca = "lpr"; },
    d => { d.productos[1].camposExtra = { nota: "conflicto" }; },
    d => { d.productos[2].referenciaDesconocida = { producto: "1" }; },
    d => { d.productos[2].referenciaDesconocida = { codigo: "PD 528" }; },
    d => { delete d.movimientos[0].productoId; },
    d => { d.movimientos[0].codigo = "PD 528"; delete d.movimientos[0].productoId; },
    d => { d.movimientos[0].referenciaPastillasOriginal = { existente: true }; },
    d => { d.productos[2].equivalentesVinculados = ["1", "2"]; },
    d => { d.productos[0].ubicacion = "DESCONOCIDA"; },
  ]) {
    const datos = datosFusion();
    alterar(datos);
    const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
    const opciones = opcionesFusion(replica, datos);
    assert.equal(opciones.plan.fusion, null, JSON.stringify(opciones.plan));
    assert.ok(opciones.plan.excluidos.length);
    const antes = replica.estado();
    assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "sin_cambios", seleccionados: 0 });
    assert.deepEqual(replica.estado(), antes);
  }
});

test("admite prefijo de marca confirmado y conserva ambos códigos anteriores", async () => {
  const datos = datosFusion();
  datos.productos[1].codigo = datos.productos[1].CODIGO = "LPR05P1379";
  datos.movimientos[1].codigo = "LPR05P1379";
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  assert.ok(opciones.plan.fusion, JSON.stringify(opciones.plan));
  await ejecutarEnReplicaAislada(opciones);
  const destino = replica.estado().productos[1];
  assert.equal(destino.codigo, "05P1379");
  assert.deepEqual(destino.codigosAnteriores, ["PD/528", "LPR05P1379"]);
  assert.deepEqual(destino.variantes.map(v => [v.ubicacion, v.cantidad]),
    [["NEGOCIO", 5], ["DEPOSITO_GALPON", 7]]);
});

test("compara metadatos sin depender del orden de sus campos", async () => {
  const datos = datosFusion();
  datos.productos[0].camposExtra = { primero: 1, segundo: { a: 2, b: 3 } };
  datos.productos[1].camposExtra = { primero: 1, segundo: { a: 2, b: 3 } };
  datos.productos[1] = Object.fromEntries(Object.entries(datos.productos[1]).reverse());
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  assert.ok(opciones.plan.fusion, JSON.stringify(opciones.plan));
  await ejecutarEnReplicaAislada(opciones);
  assert.deepEqual(replica.estado().productos[1].camposExtra, datos.productos[1].camposExtra);
});

test("excluye referencias en campos desconocidos al código prefijado", () => {
  const datos = datosFusion();
  datos.productos[1].codigo = datos.productos[1].CODIGO = "LPR05P1379";
  datos.movimientos[1].codigo = "LPR05P1379";
  datos.movimientos[1].nota = "LPR05P1379";
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  assert.equal(opciones.plan.fusion, null);
  assert.ok(opciones.plan.excluidos.includes("Hay referencias de movimiento en campos no reconocidos."));
});

test("distingue códigos históricos propios de referencias de migración a otros productos", () => {
  const datos = datosFusion();
  datos.productos[2].migracionPastillas = { codigoAnterior: "PD/528",
    informeSha256: "a".repeat(64), fecha: new Date("2026-01-01") };
  let replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  assert.ok(opcionesFusion(replica, datos).plan.fusion);
  datos.productos[2].migracionPastillas.fusionados = ["1"];
  replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  assert.equal(opcionesFusion(replica, datos).plan.fusion, null);
});

test("fusiona duplicados del mismo código sin mezclar movimientos de otra marca", async () => {
  const datos = datosFusion();
  datos.productos = [
    { _id: "1", codigo: "PD/528", marca: "FRASLE", stock: 9, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "PD/528", marca: "FRASLE", stock: 2, ubicacion: "NEGOCIO" },
    { _id: "3", codigo: "PD/528", marca: "LPR", stock: 4, ubicacion: "DEPOSITO_GALPON" },
  ];
  datos.movimientos = [{ _id: "m1", productoId: "3", codigo: "PD/528", marca: "LPR" }];
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  assert.ok(opciones.plan.fusion, JSON.stringify(opciones.plan));
  await ejecutarEnReplicaAislada(opciones);
  const estado = replica.estado();
  assert.deepEqual(estado.productos[1].variantes.map(v => [v.ubicacion, v.cantidad]), [["NEGOCIO", 11]]);
  assert.deepEqual(estado.movimientos, datos.movimientos);
  assert.equal(estado.productos[2].stock, 4);
});

test("admite código TRW abreviado solo con correspondencia exacta y confirmación", async () => {
  const fichas = { version: "v1", fichas: [{ code: "A", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/60" }, { code: "TRW", value: "RCPT02130" },
  ] }] };
  const datos = datosFusion();
  datos.productos = [
    { _id: "1", codigo: "PD/60", marca: "TRW", stock: 5, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "TRW02130", marca: "TRW", stock: 6, ubicacion: "DEPOSITO_GALPON" },
  ];
  datos.movimientos = [];
  const replica = replicaDePrueba(datos.productos, fichas, datos.movimientos);
  const opciones = opcionesFusion(replica, datos, fichas);
  assert.ok(opciones.plan.fusion, JSON.stringify(opciones.plan));
  await ejecutarEnReplicaAislada(opciones);
  assert.equal(replica.estado().productos[1].codigo, "RCPT02130");
  assert.deepEqual(replica.estado().productos[1].codigosAnteriores, ["PD/60", "TRW02130"]);
});

test("comprueba cobertura y cambios concurrentes de movimientos antes de fusionar", async () => {
  const datos = datosFusion();
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  await assert.rejects(ejecutarEnReplicaAislada({ ...opciones, verificarCobertura: async () => false }), /cobertura/);
  replica.alterar(e => { e.movimientos[0].nota = "cambio concurrente"; });
  const antes = replica.estado();
  await assert.rejects(ejecutarEnReplicaAislada(opciones), /plan aprobado/);
  assert.deepEqual(replica.estado(), antes);
});

test("verifica también movimientos y vínculos al repetir una fusión", async () => {
  const datos = datosFusion();
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  await ejecutarEnReplicaAislada(opciones);
  replica.alterar(e => { e.movimientos[0].nota = "alterado"; });
  await assert.rejects(ejecutarEnReplicaAislada(opciones), /estado actual/);
});

test("acumula solo stock de la misma ubicación y no modifica otros movimientos", async () => {
  const datos = datosFusion();
  datos.productos[1].ubicacion = "NEGOCIO";
  datos.movimientos.push({ _id: "m3", productoId: "3", codigo: "AJENO", marca: "OTRA", cantidad: 4 });
  const replica = replicaDePrueba(datos.productos, catalogo, datos.movimientos);
  const opciones = opcionesFusion(replica, datos);
  assert.ok(opciones.plan.fusion, JSON.stringify(opciones.plan));
  await ejecutarEnReplicaAislada(opciones);
  const estado = replica.estado();
  assert.deepEqual(estado.productos[1].variantes.map(v => [v.ubicacion, v.cantidad]), [["NEGOCIO", 12]]);
  assert.deepEqual(estado.movimientos[2], datos.movimientos[2]);
});

test("admite referencias ObjectId BSON sin reducirlas a códigos", () => {
  const { ObjectId } = require("mongoose").Types;
  const datos = datosFusion();
  const ids = ["1", "2", "3"].map(n => new ObjectId(n.padStart(24, "0")));
  datos.productos.forEach((p, i) => { p._id = ids[i]; });
  datos.productos[0].equivalentesVinculados = [ids[2]];
  datos.productos[1].equivalentesVinculados = [ids[2]];
  datos.productos[2].equivalentesVinculados = [ids[0]];
  datos.movimientos[0].productoId = ids[0];
  datos.movimientos[1].productoId = ids[1];
  datos.confirmacion = { ids: [String(ids[0]), String(ids[1])], destino: String(ids[1]),
    evidencia: "Identidad física comprobada en prueba" };
  const bytesInforme = archivo(datos.productos);
  const plan = crearPlanFusion(crearInformeVerificable(datos.productos, catalogo),
    datos.productos, datos.movimientos, hashArchivo(bytesInforme), datos.confirmacion);
  assert.ok(plan.fusion, JSON.stringify(plan));
});
