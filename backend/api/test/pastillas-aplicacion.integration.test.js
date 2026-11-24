const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MongoClient, ObjectId } = require("mongoose").mongo;
const { EJSON } = require("mongoose").mongo.BSON;
const { crearInformeVerificable, huella } = require("../src/migrations/pastillas-informe");
const { obtenerCatalogoLocal } = require("../src/services/catalogo-pastillas");
const { crearPlan, crearPlanFusion, ejecutarEnReplicaAislada, ejecutarFusionesConVentana,
  hashArchivo } = require("../src/migrations/pastillas-aplicacion");

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

test("replica set: CLI de códigos individuales verifica respaldo y conserva stock", { skip: !uri }, async () => {
  await conBaseDePrueba(async ({ db }) => {
    const archivoDir = fs.mkdtempSync(path.join(os.tmpdir(), "pastillas-cli-"));
    const inventario = path.join(archivoDir, "inventario.ejson");
    const informe = path.join(archivoDir, "informe.json");
    const plan = path.join(archivoDir, "plan.json");
    const respaldo = path.join(archivoDir, "respaldo.gz");
    const ejecutable = path.join(__dirname, "..", "scripts", "aplicar-pastillas.js");
    const destino = new URL(uri);
    destino.pathname = `/${db.databaseName}`;
    const env = { ...process.env, PASTILLAS_MONGODB_URI: destino.toString() };
    const run = args => {
      const resultado = spawnSync(process.execPath, [ejecutable, ...args], { encoding: "utf8", env });
      assert.equal(resultado.status, 0, resultado.stderr);
      return JSON.parse(resultado.stdout);
    };
    try {
      await db.collection("productos").insertOne({ _id: new ObjectId(), codigo: "PD/528", marca: "LPR",
        stock: 5, ubicacion: "NEGOCIO" });
      const productos = await db.collection("productos").find().sort({ _id: 1 }).toArray();
      fs.writeFileSync(inventario, EJSON.stringify({ productos }));
      fs.writeFileSync(respaldo, "respaldo de prueba");
      const resumen = run(["--informe-local", "--inventario", inventario, "--salida", informe]);
      const preparado = run(["--planificar", "--informe", informe, "--sha256", resumen.sha256,
        "--inventario", inventario, "--salida", plan]);
      assert.equal(preparado.seleccionados, 1);
      const documentoInforme = JSON.parse(fs.readFileSync(informe));
      const hello = await db.admin().command({ hello: 1 });
      const args = ["--aplicar", "--informe", informe, "--sha256", resumen.sha256,
        "--plan", plan, "--sha256-plan", preparado.sha256, "--respaldo", respaldo,
        "--sha256-respaldo", hashArchivo(fs.readFileSync(respaldo)),
        "--sha256-inventario-respaldo", documentoInforme.inventario.sha256,
        "--base", db.databaseName, "--replica", hello.setName,
        "--confirmar-restauracion", "--confirmar-ventana", "--confirmar-referencias"];
      assert.equal(run(args).estado, "aplicado");
      const producto = await db.collection("productos").findOne();
      assert.equal(producto.codigo, "05P1379");
      assert.equal(producto.stock, 5);
      assert.equal(producto.ubicacion, "NEGOCIO");
      assert.equal(run(args).estado, "ya_aplicado");
      assert.equal(await db.collection("pastillas_aplicacion_auditoria").countDocuments(), 1);
    } finally {
      for (const file of [inventario, informe, plan, respaldo]) {
        if (fs.existsSync(file)) fs.rmSync(file);
      }
      fs.rmdirSync(archivoDir);
    }
  });
});

test("replica set: plan individual conserva el inventario de una instantánea real",
  { skip: !uri || !process.env.PASTILLAS_TEST_SNAPSHOT || !process.env.PASTILLAS_TEST_BACKUP }, async () => {
    await conBaseDePrueba(async ({ db }) => {
      const snapshot = EJSON.parse(fs.readFileSync(process.env.PASTILLAS_TEST_SNAPSHOT, "utf8"));
      assert.ok(Array.isArray(snapshot.productos) && Array.isArray(snapshot.movimientos));
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pastillas-inventario-"));
      const informe = path.join(dir, "informe.json");
      const plan = path.join(dir, "plan.json");
      const ejecutable = path.join(__dirname, "..", "scripts", "aplicar-pastillas.js");
      const destino = new URL(uri);
      destino.pathname = `/${db.databaseName}`;
      const env = { ...process.env, PASTILLAS_MONGODB_URI: destino.toString() };
      const run = args => {
        const resultado = spawnSync(process.execPath, [ejecutable, ...args], { encoding: "utf8", env });
        assert.equal(resultado.status, 0, resultado.stderr);
        return JSON.parse(resultado.stdout);
      };
      try {
        await db.collection("productos").insertMany(snapshot.productos);
        if (snapshot.movimientos.length) await db.collection("movimientos").insertMany(snapshot.movimientos);
        const resumen = run(["--informe-local", "--inventario", process.env.PASTILLAS_TEST_SNAPSHOT,
          "--salida", informe]);
        const preparado = run(["--planificar", "--informe", informe, "--sha256", resumen.sha256,
          "--inventario", process.env.PASTILLAS_TEST_SNAPSHOT, "--salida", plan]);
        if (process.env.PASTILLAS_TEST_EXPECTED_COUNT) {
          assert.equal(preparado.seleccionados, Number(process.env.PASTILLAS_TEST_EXPECTED_COUNT));
        }
        const datosPlan = JSON.parse(fs.readFileSync(plan));
        const cambios = new Map(datosPlan.seleccionados.map(c => [c.id, c]));
        const inventarioHash = JSON.parse(fs.readFileSync(informe)).inventario.sha256;
        const backup = process.env.PASTILLAS_TEST_BACKUP;
        const hello = await db.admin().command({ hello: 1 });
        const args = ["--aplicar", "--informe", informe, "--sha256", resumen.sha256,
          "--plan", plan, "--sha256-plan", preparado.sha256, "--respaldo", backup,
          "--sha256-respaldo", hashArchivo(fs.readFileSync(backup)),
          "--sha256-inventario-respaldo", inventarioHash, "--base", db.databaseName,
          "--replica", hello.setName, "--confirmar-restauracion", "--confirmar-ventana",
          "--confirmar-referencias"];
        assert.equal(run(args).estado, "aplicado");
        const posteriores = await db.collection("productos").find().sort({ _id: 1 }).toArray();
        assert.equal(posteriores.length, snapshot.productos.length);
        const originales = new Map(snapshot.productos.map(p => [String(p._id), p]));
        for (const actual of posteriores) {
          const anterior = originales.get(String(actual._id));
          assert.ok(anterior);
          const cambio = cambios.get(String(actual._id));
          if (!cambio) {
            assert.deepEqual(actual, anterior);
            continue;
          }
          const { codigo, CODIGO, codigosAnteriores, migracionPastillas, ...resto } = actual;
          const { codigo: previo, CODIGO: PREVIO, codigosAnteriores: anteriores,
            migracionPastillas: migracionAnterior, ...restoAnterior } = anterior;
          assert.deepEqual(resto, restoAnterior);
          if (previo != null) assert.equal(codigo, cambio.codigoOficial);
          if (PREVIO != null) assert.equal(CODIGO, cambio.codigoOficial);
          for (const alias of [...(anteriores || []), previo, PREVIO].filter(Boolean)) {
            assert.ok(codigosAnteriores.includes(alias));
          }
          assert.equal(migracionAnterior, undefined);
          assert.equal(migracionPastillas.codigoAnterior, cambio.codigoAnterior);
        }
        assert.deepEqual(await db.collection("movimientos").find().sort({ _id: 1 }).toArray(), snapshot.movimientos);
        assert.equal(run(args).estado, "ya_aplicado");
      } finally {
        for (const file of [informe, plan]) if (fs.existsSync(file)) fs.rmSync(file);
        fs.rmdirSync(dir);
      }
    });
  });

test("replica restaurada: lote real conserva stock, ubicaciones y referencias",
  { skip: !process.env.PASTILLAS_TEST_RESTORED_URI || !process.env.PASTILLAS_TEST_BATCH_DIR }, async () => {
    const restoredUri = process.env.PASTILLAS_TEST_RESTORED_URI;
    const parsed = new URL(restoredUri);
    if (parsed.protocol !== "mongodb:" || parsed.hostname !== "127.0.0.1" ||
        !parsed.port || parsed.searchParams.get("directConnection") !== "true") {
      throw new Error("La prueba del lote solo admite una réplica local directa.");
    }
    const dir = process.env.PASTILLAS_TEST_BATCH_DIR;
    const snapshot = EJSON.parse(fs.readFileSync(path.join(dir, "inventario-y-movimientos.ejson"), "utf8"));
    const bytesInforme = fs.readFileSync(path.join(dir, "informe.json"));
    const bytesPlan = fs.readFileSync(path.join(dir, "plan-12-fusiones.json"));
    const plan = JSON.parse(bytesPlan);
    const backup = path.join(dir, "atlas.archive.gz");
    const client = new MongoClient(restoredUri);
    try {
      await client.connect();
      const db = client.db("rectifren");
      const hello = await db.admin().command({ hello: 1 });
      const productosAntes = await db.collection("productos").find().sort({ _id: 1 }).toArray();
      const movimientosAntes = await db.collection("movimientos").find().sort({ _id: 1 }).toArray();
      assert.equal(huella(productosAntes), huella(snapshot.productos));
      assert.equal(huella(movimientosAntes), huella(snapshot.movimientos));
      const opciones = { db, session: client.startSession(), leerCatalogo: obtenerCatalogoLocal,
        bytesInforme, hashAprobado: hashArchivo(bytesInforme), bytesPlan, hashPlan: hashArchivo(bytesPlan),
        fecha: new Date("2026-01-01"), baseAprobada: db.databaseName, replicaAprobada: hello.setName,
        archivoRespaldo: backup, hashRespaldoAprobado: hashArchivo(fs.readFileSync(backup)),
        hashInventarioRespaldo: huella(productosAntes), restauracionComprobada: true,
        ventanaSinEscritoresConfirmada: true, referenciasExternasRevisadas: true };
      try {
        assert.deepEqual(await ejecutarFusionesConVentana(opciones), { estado: "aplicado", fusiones: 12 });
        const posteriores = await db.collection("productos").find().sort({ _id: 1 }).toArray();
        const movimientos = await db.collection("movimientos").find().sort({ _id: 1 }).toArray();
        const antesPorId = new Map(productosAntes.map(p => [String(p._id), p]));
        const despuesPorId = new Map(posteriores.map(p => [String(p._id), p]));
        const fuentes = new Map();
        const grupoIds = new Set(plan.fusiones.flatMap(f => f.ids));
        assert.equal(posteriores.length, productosAntes.length);
        for (const fusion of plan.fusiones) {
          const destino = despuesPorId.get(fusion.destino);
          const esperados = new Map();
          for (const id of fusion.ids) {
            const anterior = antesPorId.get(id);
            esperados.set(anterior.ubicacion, (esperados.get(anterior.ubicacion) || 0) +
              (anterior.stock ?? anterior.STOCK));
            if (id !== fusion.destino) {
              fuentes.set(id, fusion.destino);
              const archivado = despuesPorId.get(id);
              assert.equal(archivado.archivado, true);
              assert.equal(String(archivado.migracionPastillas.reemplazadoPor), fusion.destino);
              assert.equal(archivado.ubicacion, anterior.ubicacion);
              assert.equal(archivado.stock ?? archivado.STOCK, anterior.stock ?? anterior.STOCK);
            }
          }
          assert.equal(destino.codigo, fusion.codigoOficial);
          assert.deepEqual(new Map(destino.variantes.map(v => [v.ubicacion, v.cantidad])), esperados);
        }
        for (const actual of posteriores) {
          if (!grupoIds.has(String(actual._id))) {
            assert.equal(huella(actual), huella(antesPorId.get(String(actual._id))));
          }
        }
        const movimientosPorId = new Map(movimientos.map(m => [String(m._id), m]));
        let redirigidos = 0;
        for (const previo of movimientosAntes) {
          const actual = movimientosPorId.get(String(previo._id));
          assert.ok(actual);
          const nuevoId = fuentes.get(String(previo.productoId));
          if (!nuevoId) {
            assert.equal(huella(actual), huella(previo));
            continue;
          }
          const { productoId, referenciaPastillasOriginal, ...otros } = actual;
          const { productoId: referenciaPrevia, ...otrosPrevios } = previo;
          assert.equal(String(productoId), nuevoId);
          assert.equal(String(referenciaPastillasOriginal.productoId), String(referenciaPrevia));
          assert.equal(huella(otros), huella(otrosPrevios));
          redirigidos++;
        }
        const audit = await db.collection("pastillas_aplicacion_auditoria").findOne({ _id: opciones.hashPlan });
        assert.equal(audit.respaldos.length, 24);
        assert.equal(audit.respaldosMovimientos.length, redirigidos);
        assert.deepEqual(await ejecutarFusionesConVentana(opciones), { estado: "ya_aplicado", fusiones: 12 });
        const mongoose = require("mongoose");
        const destino = new URL(restoredUri);
        destino.pathname = "/rectifren";
        const anterioresFlags = {
          familias: process.env.FAMILIAS_HABILITADAS,
          catalogo: process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS,
        };
        process.env.FAMILIAS_HABILITADAS = "false";
        process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "true";
        try {
          await mongoose.connect(destino.toString());
          const servicioProductos = require("../src/services/productos");
          const servicioStock = require("../src/services/stock");
          for (const codigo of ["528", "05P1379"]) {
            const resultado = await servicioProductos.buscar(codigo);
            assert.equal(resultado.familiasError, undefined);
            const filas = resultado.familias.flatMap(f => f.filas).filter(f => f.marca === "LPR");
            assert.ok(filas.some(f => f.ubicacion === "NEGOCIO" && f.stock === 8));
            assert.ok(filas.some(f => f.ubicacion === "DEPOSITO_GALPON" && f.stock === 10));
          }
          const movimiento = await servicioStock.aplicarMovimiento("SALIDA",
            { codigo: "PD/528", marca: "LPR", ubicacion: "NEGOCIO", cantidad: 1 });
          assert.equal(movimiento.stock_anterior, 8);
          assert.equal(movimiento.stock_nuevo, 7);
        } finally {
          await mongoose.disconnect();
          for (const [nombre, valor] of Object.entries({
            FAMILIAS_HABILITADAS: anterioresFlags.familias,
            FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS: anterioresFlags.catalogo,
          })) {
            if (valor === undefined) delete process.env[nombre];
            else process.env[nombre] = valor;
          }
        }
      } finally {
        await opciones.session.endSession();
      }
    } finally {
      await client.close();
    }
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
      assert.equal(audit.versionPlan, 2);
      assert.equal(audit.informeSha256, opciones.hashAprobado);
      assert.equal(audit.planSha256, opciones.hashPlan);
      assert.equal(audit.inventarioDespues, huella(await db.collection("productos").find().sort({ _id: 1 }).toArray()));
      assert.equal(audit.movimientosDespues, huella(await db.collection("movimientos").find().sort({ _id: 1 }).toArray()));
      assert.equal(audit.catalogoSha256, huella(catalogo));
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
