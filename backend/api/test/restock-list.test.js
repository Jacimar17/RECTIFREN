const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = pathToFileURL(path.join(__dirname, "../../../js/restock-list.js")).href;

test("agrupa solo las salidas por código y marca sumando cantidades", async () => {
  const { buildRestockText } = await import(modulePath);
  const text = buildRestockText([
    { accion: "SALIDA", codigo: "PD/59", marca: "Frasle", cantidad: 2, ubicacion: "NEGOCIO" },
    { accion: "salida", codigo: "pd/59", marca: "FRASLE", cantidad: 3, ubicacion: "DEPOSITO_GALPON" },
    { accion: "SALIDA", codigo: "RF-10", marca: "Litton", cantidad: 1 },
    { accion: "ENTRADA", codigo: "RF-99", marca: "TRW", cantidad: 8 },
    { accion: "AJUSTE", codigo: "RF-98", marca: "TRW", cantidad: 4 },
  ], "week");

  assert.equal(text, "Productos a reponer (últimos 7 días):\nPD/59 Frasle x5\nRF-10 Litton x1");
});

test("indica el período de 30 días y ignora cantidades inválidas", async () => {
  const { buildRestockText } = await import(modulePath);
  const text = buildRestockText([
    { accion: "SALIDA", codigo: "A1", marca: "TRW", cantidad: 0 },
    { accion: "SALIDA", codigo: "A2", marca: "TRW", cantidad: "x" },
    { accion: "SALIDA", codigo: "A3", marca: "TRW", cantidad: "2" },
  ], "month");

  assert.equal(text, "Productos a reponer (últimos 30 días):\nA3 TRW x2");
});

test("devuelve texto vacío cuando no hubo salidas", async () => {
  const { buildRestockText } = await import(modulePath);
  assert.equal(buildRestockText([{ accion: "ENTRADA", codigo: "A", marca: "B", cantidad: 1 }], "week"), "");
  assert.equal(buildRestockText(undefined, "week"), "");
});
