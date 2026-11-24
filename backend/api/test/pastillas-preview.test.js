const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { Types } = require("mongoose");
const { crearInforme } = require("../src/migrations/pastillas-preview");
const { crearInformeVerificable } = require("../src/migrations/pastillas-informe");
const { leerInventario } = require("../scripts/preview-pastillas");

const catalogo = [{
  code: "44980NA", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "LPR", value: "05P1379" },
  ],
}, {
  code: "44980ULT", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "LPR", value: "05P 1379" },
  ],
}];

test("propone código oficial y detecta duplicado exacto sin cambiar ubicaciones ni datos", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "05P 1379", marca: "LPR", stock: 5, ubicacion: "DEPOSITO_GALPON" },
    { _id: "3", codigo: "105P1379", marca: "LPR", stock: 99, ubicacion: "NEGOCIO" },
  ];
  const antes = structuredClone(productos);
  const informe = crearInforme(productos, catalogo);
  assert.equal(informe.propuestas.length, 1);
  assert.equal(informe.propuestas[0].codigoOficial, "05P1379");
  assert.deepEqual(informe.propuestas[0].documentos.map((p) => p.id), ["1", "2"]);
  assert.deepEqual(informe.propuestas[0].stockPorUbicacionAntes, { NEGOCIO: 5, DEPOSITO_GALPON: 5 });
  assert.equal(informe.propuestas[0].stockTotalAntes, 10);
  assert.deepEqual(productos, antes);
});

test("conserva marcas sin código, ambigüedades y ubicaciones no comprobadas", () => {
  const inventario = [
    { _id: "1", codigo: "PD/528", marca: "SHUNKO", stock: 2, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "PD/528", marca: "LPR", stock: 4 },
    { _id: "3", codigo: "PD/528", marca: "LPR", stock: 1, ubicacion: "NEGOCIO" },
  ];
  const conflictivo = [...catalogo, { code: "OTRA", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" }, { code: "LPR", value: "OTRO" },
  ] }];
  const resultado = crearInforme(inventario, conflictivo);
  assert.equal(resultado.propuestas.length, 0);
  assert.match(resultado.pendientes[0].motivo, /Sin código oficial/);
  assert.match(resultado.pendientes[1].motivo, /ubicación/);
  assert.match(resultado.pendientes[2].motivo, /Más de un código/);
});

test("advierte diferencias y posibles duplicados en variantes", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 1, ubicacion: "NEGOCIO", precio: 10 },
    { _id: "2", codigo: "05P1379", marca: "LPR", stock: 2, ubicacion: "DEPOSITO_GALPON", precio: 20 },
    { _id: "3", schemaVersion: 2, codigo: "44980NA", variantes: [{ marca: "LPR", cantidad: 4, ubicacion: "NEGOCIO" }],
      equivalenciasCatalogo: [{ marca: "LPR", codigo: "05P1379" }] },
  ];
  const propuesta = crearInforme(productos, catalogo).propuestas[0];
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("precio")));
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("variantes")));
});

test("informa diferencias en metadatos adicionales sin descartarlos", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 1, ubicacion: "NEGOCIO", fabricanteExtra: "A" },
    { _id: "2", codigo: "05P1379", marca: "LPR", stock: 2, ubicacion: "DEPOSITO_GALPON", fabricanteExtra: "B" },
  ];
  const propuesta = crearInforme(productos, catalogo).propuestas[0];
  assert.ok(propuesta.requiereRevision.includes("Diferencias en fabricanteExtra."));
  assert.deepEqual(propuesta.metadatosEnConflicto.fabricanteExtra, [
    { id: "1", valor: "A" }, { id: "2", valor: "B" },
  ]);
});

test("marca propuestas que comparten un destino como ambiguas", () => {
  const fichas = [
    { code: "A", brand: "LITTON", substitutes: [
      { code: "FRASLE", value: "PD/1" }, { code: "LPR", value: "X" },
    ] },
    { code: "B", brand: "LITTON", substitutes: [
      { code: "FRASLE", value: "PD/2" }, { code: "LPR", value: "LPRX" },
    ] },
  ];
  const productos = [
    { _id: "1", codigo: "PD/1", marca: "LPR", stock: 1, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "PD/2", marca: "LPR", stock: 1, ubicacion: "NEGOCIO" },
    { _id: "3", codigo: "LPRX", marca: "LPR", stock: 2, ubicacion: "DEPOSITO_GALPON" },
  ];
  const informe = crearInforme(productos, fichas);
  assert.equal(informe.propuestas.length, 2);
  assert.ok(informe.propuestas.every((item) => item.requiereRevision.some((motivo) => motivo.includes("varias propuestas"))));
});

test("rechaza catálogos incompletos", () => {
  assert.throws(() => crearInforme([], [{ code: "1", error: "falló", substitutes: [] }]), /inválidas/);
  assert.throws(() => crearInforme([], []), /inválidas/);
  assert.throws(() => crearInforme([], [catalogo[0], { ...catalogo[0] }]), /inválidas/);
  assert.throws(() => crearInforme([], [{ ...catalogo[0], substitutes: [null] }]), /inválidas/);
});

test("ignora el marcador de código ausente usado en el catálogo real", () => {
  const fichas = [{ code: "1", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" }, { code: "LPR", value: "-" }, { code: "LPR", value: "\r" },
  ] }];
  const informe = crearInforme([
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
  ], fichas);
  assert.equal(informe.propuestas.length, 0);
  assert.match(informe.pendientes[0].motivo, /Sin código oficial/);
});

test("reconoce códigos TRW de sus variantes de marca sin elegir entre códigos distintos", () => {
  const producto = { _id: "1", codigo: "PD/528", marca: "TRW", stock: 5, ubicacion: "NEGOCIO" };
  const ficha = { code: "A", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "TRW - BRASIL", value: "RCPT09460" },
    { code: "TRW - EXPO", value: "-" },
  ] };
  const unico = crearInforme([producto], [ficha]);
  assert.equal(unico.propuestas[0].codigoOficial, "RCPT09460");
  assert.deepEqual(unico.propuestas[0].stockPorUbicacionAntes, { NEGOCIO: 5, DEPOSITO_GALPON: 0 });
  const destino = { _id: "2", codigo: "TRW09460", marca: "TRW", stock: 9, ubicacion: "DEPOSITO_GALPON" };
  const conDestino = crearInforme([producto, destino], [ficha]).propuestas[0];
  assert.deepEqual(conDestino.documentos.map((item) => item.id), ["1", "2"]);
  assert.deepEqual(conDestino.stockPorUbicacionAntes, { NEGOCIO: 5, DEPOSITO_GALPON: 9 });
  assert.ok(conDestino.requiereRevision.some((motivo) => motivo.includes("TRW abreviado")));

  const ambiguo = crearInforme([producto], [{ ...ficha, substitutes: [
    ...ficha.substitutes, { code: "TRW - EXPO", value: "GDB3364" },
  ] }]);
  assert.equal(ambiguo.propuestas.length, 0);
  assert.deepEqual(ambiguo.pendientes[0].codigosPosibles.map((item) => item.codigo), ["RCPT09460", "GDB3364"]);
  assert.match(ambiguo.pendientes[0].motivo, /Más de un código/);
});

test("elige NA para Liton y ULT para Ultraliton sin mezclar marcas ni ubicaciones", () => {
  for (const [marca, esperado] of [
    ["Liton", "44980NA"], ["Litton", "44980NA"],
    ["Ultraliton", "44980ULT"], ["Ultra Litton", "44980ULT"], ["Ultralitton", "44980ULT"],
  ]) {
    const producto = { _id: "1", codigo: "PD/528", marca, stock: 5, ubicacion: "NEGOCIO" };
    const informe = crearInforme([producto], catalogo);
    assert.equal(informe.propuestas[0].codigoOficial, esperado, marca);
    assert.deepEqual(informe.propuestas[0].stockPorUbicacionAntes, { NEGOCIO: 5, DEPOSITO_GALPON: 0 });
  }
  const productos = [
    { _id: "na", codigo: "PD/528", marca: "Liton", stock: 3, ubicacion: "NEGOCIO" },
    { _id: "ult", codigo: "PD/528", marca: "Ultra Litton", stock: 4, ubicacion: "DEPOSITO_GALPON" },
    { _id: "na2", codigo: "44980NA", marca: "LITTON", stock: 2, ubicacion: "DEPOSITO_GALPON" },
  ];
  const informe = crearInforme(productos, catalogo);
  assert.deepEqual(informe.propuestas.find((item) => item.codigoOficial === "44980NA").documentos.map((item) => item.id), ["na", "na2"]);
  assert.deepEqual(informe.propuestas.find((item) => item.codigoOficial === "44980ULT").documentos.map((item) => item.id), ["ult"]);
});

test("no inventa la variante ausente ni elige entre códigos de piezas distintas", () => {
  const producto = { _id: "1", codigo: "PD/528", marca: "Liton", stock: 2, ubicacion: "NEGOCIO" };
  const sinNa = crearInforme([producto], [catalogo[1]]);
  assert.equal(sinNa.propuestas.length, 0);
  assert.match(sinNa.pendientes[0].motivo, /variante/);
  assert.deepEqual(sinNa.pendientes[0].codigosPosibles.map((item) => item.codigo), ["44980ULT"]);
  const otrasFichas = [...catalogo, { ...catalogo[0], code: "OTRA99NA" }];
  const ambiguo = crearInforme([producto], otrasFichas);
  assert.equal(ambiguo.propuestas.length, 0);
  assert.match(ambiguo.pendientes[0].motivo, /variante/);
  const conXfr = crearInforme([producto], [catalogo[0], { ...catalogo[0], code: "44980XFR" }]);
  assert.equal(conXfr.propuestas[0].codigoOficial, "44980NA");
  const ultra = { ...producto, marca: "ULTRALITTON" };
  assert.equal(crearInforme([ultra], [catalogo[0]]).propuestas.length, 0);
});

test("procesa el archivo de equivalencias real sin tratar marcadores vacíos como errores", () => {
  const fichas = require("../../../litton-pastillas.json");
  const informe = crearInforme([
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
  ], fichas);
  assert.equal(informe.propuestas[0].codigoOficial, "05P1379");
});

test("no oculta un destino con códigos contradictorios o stock incoherente", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "OTRO", CODIGO: "05P1379", marca: "LPR", stock: 4, STOCK: 8, ubicacion: "DEPOSITO_GALPON" },
  ];
  const propuesta = crearInforme(productos, catalogo).propuestas[0];
  assert.equal(propuesta.documentos.length, 2);
  assert.equal(propuesta.stockIncompleto, true);
  assert.equal(propuesta.stockPorUbicacionPropuesto, null);
  assert.equal(propuesta.stockTotalPropuesto, null);
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("contradictorios")));
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("stock")));
});

test("informa códigos PD contradictorios aunque solo aparezcan en el alias", () => {
  const informe = crearInforme([
    { _id: "1", codigo: "OTRO", CODIGO: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
  ], catalogo);
  assert.equal(informe.propuestas.length, 0);
  assert.match(informe.pendientes[0].motivo, /contradictorios/);
});

test("identifica documentos exportados en formato JSON de MongoDB", () => {
  const informe = crearInforme([
    { _id: { $oid: "123456789012345678901234" }, codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
  ], catalogo);
  assert.equal(informe.propuestas[0].documentos[0].id, "123456789012345678901234");
});

test("lee instantáneas de Atlas con EJSON y rechaza conteos o identificadores incorrectos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pastillas-inventario-"));
  const ruta = path.join(dir, "inventario.json");
  const documento = { _id: { $oid: "123456789012345678901234" }, codigo: "PD/528",
    marca: "LPR", stock: 5, ubicacion: "NEGOCIO" };
  try {
    fs.writeFileSync(ruta, JSON.stringify({ cantidad: 1, documentos: [documento] }));
    const inventario = leerInventario(ruta);
    assert.equal(inventario[0]._id.toHexString(), documento._id.$oid);
    assert.equal(crearInforme(inventario, catalogo).propuestas[0].codigoOficial, "05P1379");
    fs.writeFileSync(ruta, JSON.stringify({ cantidad: 2, documentos: [documento] }));
    assert.throws(() => leerInventario(ruta), /conteo válido/);
    fs.writeFileSync(ruta, JSON.stringify({ cantidad: 2, documentos: [documento, documento] }));
    assert.throws(() => leerInventario(ruta), /identificadores duplicados/);
    fs.writeFileSync(ruta, JSON.stringify({ cantidad: 1, documentos: [{ codigo: "PD/528" }] }));
    assert.throws(() => leerInventario(ruta), /sin identificador válido/);
    fs.writeFileSync(ruta, JSON.stringify([documento]));
    assert.equal(leerInventario(ruta)[0]._id.toHexString(), documento._id.$oid);
  } finally {
    fs.unlinkSync(ruta);
    fs.rmdirSync(dir);
  }
});

test("identifica ObjectId reales e informa evidencia y distribución propuesta", () => {
  const id = new Types.ObjectId();
  const informe = crearInforme([
    { _id: id, codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
  ], catalogo);
  const propuesta = informe.propuestas[0];
  assert.equal(propuesta.documentos[0].id, id.toHexString());
  assert.deepEqual(propuesta.stockPorUbicacionPropuesto, propuesta.stockPorUbicacionAntes);
  assert.equal(propuesta.stockTotalPropuesto, 5);
  assert.ok(propuesta.evidencia.some((ficha) =>
    ficha.equivalencias.some((item) => item.code === "LPR" && item.value === "05P1379")));
});

test("el informe verificable detecta cambios de inventario y catálogo", () => {
  const producto = { _id: new Types.ObjectId(), codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" };
  const activo = { version: "v1", fichas: catalogo };
  const informe = crearInformeVerificable([producto], activo);
  assert.deepEqual(informe, crearInformeVerificable([producto], activo));
  assert.notEqual(informe.inventario.sha256,
    crearInformeVerificable([{ ...producto, stock: 6 }], activo).inventario.sha256);
  assert.notEqual(informe.catalogo.sha256,
    crearInformeVerificable([producto], { ...activo, version: "v2" }).catalogo.sha256);
  assert.throws(() => crearInformeVerificable([producto], { fichas: catalogo }), /versión activa/);
});

test("una conexión inválida no expone las credenciales en el error de la simulación", () => {
  const resultado = spawnSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "preview-pastillas.js"), "--atlas", "--salida", "no-crear.json",
  ], {
    env: { ...process.env, MONGODB_URI: "mongodb://usuario-prueba:secreto-prueba@localhost:abc/base" },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /Simulación detenida/);
  assert.doesNotMatch(resultado.stderr, /usuario-prueba|secreto-prueba/);
});

test("informa una posible coincidencia con prefijo de marca sin aceptar códigos parecidos", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 2, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "LPR05P1379", marca: "LPR", stock: 3, ubicacion: "DEPOSITO_GALPON" },
    { _id: "3", codigo: "LPR105P1379", marca: "LPR", stock: 4, ubicacion: "DEPOSITO_GALPON" },
    { _id: "4", codigo: "LPR05P1379", marca: "OTRA", stock: 5, ubicacion: "NEGOCIO" },
  ];
  const propuesta = crearInforme(productos, catalogo).propuestas[0];
  assert.deepEqual(propuesta.documentos.map((item) => item.id), ["1", "2"]);
  assert.deepEqual(propuesta.stockPorUbicacionAntes, { NEGOCIO: 2, DEPOSITO_GALPON: 3 });
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("prefijo de marca")));
});

test("simula la familia 528 sin mezclar marcas ni adivinar códigos", () => {
  const productos = [
    { _id: "frasle", codigo: "PD/528", marca: "FRASLE", stock: 2, ubicacion: "NEGOCIO" },
    { _id: "frima", codigo: "PD/528", marca: "FRI-MA", stock: 3, ubicacion: "NEGOCIO" },
    { _id: "litton", codigo: "PD/528", marca: "LITTON", stock: 4, ubicacion: "NEGOCIO" },
    { _id: "lpr-negocio", codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
    { _id: "lpr-galpon", codigo: "LPR05P1379", marca: "LPR", stock: 6, ubicacion: "DEPOSITO_GALPON" },
    { _id: "trw", codigo: "PD/528", marca: "TRW", stock: 0, ubicacion: "NEGOCIO" },
    { _id: "trw-galpon", codigo: "TRW09460", marca: "TRW", stock: 7, ubicacion: "DEPOSITO_GALPON" },
  ];
  const fichas = catalogo.map((ficha) => ({
    ...ficha,
    substitutes: [...ficha.substitutes, { code: "TRW - BRASIL", value: "RCPT09460" }],
  }));
  const informe = crearInforme(productos, fichas);
  const lpr = informe.propuestas.find((item) => item.marca === "LPR");
  assert.equal(lpr.codigoOficial, "05P1379");
  assert.deepEqual(lpr.documentos.map((item) => item.id), ["lpr-negocio", "lpr-galpon"]);
  assert.deepEqual(lpr.stockPorUbicacionAntes, { NEGOCIO: 5, DEPOSITO_GALPON: 6 });
  assert.equal(informe.propuestas.find((item) => item.marca === "FRASLE").codigoOficial, "PD/528");
  assert.deepEqual(informe.pendientes.map((item) => item.producto.marca).sort(), ["FRI-MA"]);
  assert.equal(informe.propuestas.find((item) => item.marca === "LITTON").codigoOficial, "44980NA");
  const trw = informe.propuestas.find((item) => item.marca === "TRW");
  assert.equal(trw.codigoOficial, "RCPT09460");
  assert.deepEqual(trw.documentos.map((item) => item.id), ["trw", "trw-galpon"]);
  assert.ok(trw.requiereRevision.some((motivo) => motivo.includes("TRW abreviado")));
});
