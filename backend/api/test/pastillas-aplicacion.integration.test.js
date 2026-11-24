const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { MongoClient, ObjectId } = require("mongoose").mongo;
const { crearInformeVerificable } = require("../src/migrations/pastillas-informe");
const { crearPlan, crearPlanFusion, ejecutarEnReplicaAislada, hashArchivo } = require("../src/migrations/pastillas-aplicacion");

const uri = process.env.PASTILLAS_TEST_MONGODB_URI;
const catalogo = { version: "v1", fichas: [{ code: "A", brand: "LITTON", substitutes: [
  { code: "FRASLE", value: "PD/528" }, { code: "LPR", value: "05P1379" },
] }] };

async function conBaseDePrueba(run) {
  const parsed = new URL(uri);
  if (parsed.protocol !== "mongodb:" || parsed.hostname !== "127.0.0.1" ||
      !parsed.port || parsed.searchParams.get("directConnection") !== "true") {
    throw new Error("Las pruebas de integración solo admiten una conexión local directa.");
  }
  const client = new MongoClient(uri);
  const db = client.db(`test_pastillas_${randomUUID().replace(/-/g, "")}`);
  try {
    await client.connect();
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName || !hello.isWritablePrimary) throw new Error("Se requiere un replica set primario.");
    await run({ client, db });
  } finally {
    try {
      await db.dropDatabase();
    } finally {
      await client.close();
    }
  }
}

async function preparar({ client, db }, { rechazarCambio = false } = {}) {
  if (rechazarCambio) {
    await db.createCollection("productos", {
      validator: { $jsonSchema: { properties: { codigo: { enum: ["PD/528"] } } } },
    });
  }
  await db.collection("productos").insertOne({
    _id: new ObjectId(), codigo: "PD/528", CODIGO: "PD/528", marca: "LPR",
    stock: 5, ubicacion: "NEGOCIO", camposExtra: { nota: "preservar" },
  });
  await db.collection("catalogo_prueba").insertOne({ _id: "activo", catalogo });
  const productos = await db.collection("productos").find().sort({ _id: 1 }).toArray();
  const informe = crearInformeVerificable(productos, catalogo);
  const bytesInforme = Buffer.from(JSON.stringify(informe));
  const hashAprobado = hashArchivo(bytesInforme);
  const bytesPlan = Buffer.from(JSON.stringify(crearPlan(informe, productos, hashAprobado)));
  return {
    session: client.startSession(), db, soloPruebas: true, bytesInforme, hashAprobado,
    bytesPlan, hashPlan: hashArchivo(bytesPlan), fecha: new Date("2026-01-01T00:00:00Z"),
    leerCatalogo: async (base, session) =>
      (await base.collection("catalogo_prueba").findOne({ _id: "activo" }, { session })).catalogo,
    verificarAislamiento: async () => true,
  };
}

test("replica set: aplicación puntual, auditoría e idempotencia", { skip: !uri }, async () => {
  await conBaseDePrueba(async (context) => {
    const opciones = await preparar(context);
    try {
      assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "aplicado", seleccionados: 1 });
      const producto = await context.db.collection("productos").findOne();
      assert.equal(producto.codigo, "05P1379");
      assert.equal(producto.CODIGO, "05P1379");
      assert.equal(producto.stock, 5);
      assert.equal(producto.ubicacion, "NEGOCIO");
      assert.deepEqual(producto.camposExtra, { nota: "preservar" });
      assert.deepEqual(producto.codigosAnteriores, ["PD/528"]);
      const audit = await context.db.collection("pastillas_aplicacion_auditoria").findOne();
      assert.equal(audit.respaldos[0].codigo, "PD/528");
      assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "ya_aplicado", seleccionados: 1 });
      assert.equal(await context.db.collection("pastillas_aplicacion_auditoria").countDocuments(), 1);
      await context.db.collection("productos").updateOne({ _id: producto._id }, { $inc: { stock: 1 } });
      await assert.rejects(ejecutarEnReplicaAislada(opciones));
    } finally {
      await opciones.session.endSession();
    }
  });
});

test("replica set: fallo de escritura revierte cambio y auditoría", { skip: !uri }, async () => {
  await conBaseDePrueba(async (context) => {
    const opciones = await preparar(context, { rechazarCambio: true });
    try {
      await assert.rejects(ejecutarEnReplicaAislada(opciones));
      const producto = await context.db.collection("productos").findOne();
      assert.equal(producto.codigo, "PD/528");
      assert.equal(producto.stock, 5);
      assert.equal(await context.db.collection("pastillas_aplicacion_auditoria").countDocuments(), 0);
    } finally {
      await opciones.session.endSession();
    }
  });
});

test("replica set: cambios posteriores al informe impiden la aplicación", { skip: !uri }, async () => {
  await conBaseDePrueba(async (context) => {
    const opciones = await preparar(context);
    try {
      await context.db.collection("productos").updateOne({}, { $set: { stock: 6 } });
      await assert.rejects(ejecutarEnReplicaAislada(opciones), /actuales/);
      const producto = await context.db.collection("productos").findOne();
      assert.equal(producto.codigo, "PD/528");
      assert.equal(producto.stock, 6);
      assert.equal(await context.db.collection("pastillas_aplicacion_auditoria").countDocuments(), 0);
    } finally {
      await opciones.session.endSession();
    }
  });
});

async function prepararFusion({ client, db }, { rechazarMovimiento = false } = {}) {
  const [origenId, destinoId, otroId, movimientoId] = Array.from({ length: 4 }, () => new ObjectId());
  const comun = { marca: "LPR", stockMinimo: 2, camposExtra: { nota: "preservar" },
    equivalentesVinculados: [otroId] };
  await db.collection("productos").insertMany([
    { ...comun, _id: origenId, codigo: "PD/528", CODIGO: "PD/528", stock: 5, ubicacion: "NEGOCIO" },
    { ...comun, _id: destinoId, codigo: "05P1379", CODIGO: "05P1379", stock: 7, ubicacion: "DEPOSITO_GALPON" },
    { _id: otroId, codigo: "AJENO", marca: "OTRA", stock: 1, ubicacion: "NEGOCIO",
      equivalentesVinculados: [origenId] },
  ]);
  if (rechazarMovimiento) {
    await db.createCollection("movimientos", {
      validator: { $jsonSchema: { properties: { referenciaPastillasOriginal: { bsonType: "null" } } } },
    });
  }
  await db.collection("movimientos").insertOne({
    _id: movimientoId, productoId: origenId, codigo: "PD/528", marca: "LPR", cantidad: 2, nota: "histórico",
  });
  await db.collection("catalogo_prueba").insertOne({ _id: "activo", catalogo });
  const productos = await db.collection("productos").find().sort({ _id: 1 }).toArray();
  const movimientos = await db.collection("movimientos").find().sort({ _id: 1 }).toArray();
  const informe = crearInformeVerificable(productos, catalogo);
  const bytesInforme = Buffer.from(JSON.stringify(informe));
  const hashAprobado = hashArchivo(bytesInforme);
  const plan = crearPlanFusion(informe, productos, movimientos, hashAprobado, {
    ids: [String(origenId), String(destinoId)], destino: String(destinoId),
    evidencia: "Identidad confirmada para datos sintéticos",
  });
  assert.ok(plan.fusion, JSON.stringify(plan));
  const bytesPlan = Buffer.from(JSON.stringify(plan));
  return {
    ids: { origenId, destinoId, otroId, movimientoId }, antes: { productos, movimientos },
    opciones: {
      session: client.startSession(), db, soloPruebas: true, bytesInforme, hashAprobado,
      bytesPlan, hashPlan: hashArchivo(bytesPlan), fecha: new Date("2026-01-01T00:00:00Z"),
      leerCatalogo: async (base, session) =>
        (await base.collection("catalogo_prueba").findOne({ _id: "activo" }, { session })).catalogo,
      verificarAislamiento: async () => true, verificarCobertura: async () => true,
    },
  };
}

test("replica set: fusión, referencias, ubicaciones y repetición", { skip: !uri }, async () => {
  await conBaseDePrueba(async (context) => {
    const { ids, opciones } = await prepararFusion(context);
    try {
      assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "aplicado", seleccionados: 1 });
      const { db } = context;
      const origen = await db.collection("productos").findOne({ _id: ids.origenId });
      const destino = await db.collection("productos").findOne({ _id: ids.destinoId });
      const otro = await db.collection("productos").findOne({ _id: ids.otroId });
      const movimiento = await db.collection("movimientos").findOne({ _id: ids.movimientoId });
      assert.equal(origen.archivado, true);
      assert.deepEqual(origen.migracionPastillas.reemplazadoPor, ids.destinoId);
      assert.deepEqual(destino.variantes.map(({ ubicacion, cantidad }) => ({ ubicacion, cantidad })), [
        { ubicacion: "NEGOCIO", cantidad: 5 }, { ubicacion: "DEPOSITO_GALPON", cantidad: 7 },
      ]);
      assert.equal(destino.stock, 12);
      assert.deepEqual(destino.codigosAnteriores, ["PD/528"]);
      assert.deepEqual(otro.equivalentesVinculados, [ids.destinoId]);
      assert.deepEqual(movimiento.productoId, ids.destinoId);
      assert.deepEqual(movimiento.referenciaPastillasOriginal.productoId, ids.origenId);
      assert.equal(movimiento.codigo, "PD/528");
      const audit = await db.collection("pastillas_aplicacion_auditoria").findOne();
      assert.equal(audit.respaldos.length, 3);
      assert.equal(audit.respaldosMovimientos.length, 1);
      assert.deepEqual(await ejecutarEnReplicaAislada(opciones), { estado: "ya_aplicado", seleccionados: 1 });
    } finally {
      await opciones.session.endSession();
    }
  });
});

test("replica set: error al actualizar movimiento revierte toda la fusión", { skip: !uri }, async () => {
  await conBaseDePrueba(async (context) => {
    const { antes, opciones } = await prepararFusion(context, { rechazarMovimiento: true });
    try {
      await assert.rejects(ejecutarEnReplicaAislada(opciones));
      assert.deepEqual(await context.db.collection("productos").find().sort({ _id: 1 }).toArray(), antes.productos);
      assert.deepEqual(await context.db.collection("movimientos").find().sort({ _id: 1 }).toArray(), antes.movimientos);
      assert.equal(await context.db.collection("pastillas_aplicacion_auditoria").countDocuments(), 0);
    } finally {
      await opciones.session.endSession();
    }
  });
});
