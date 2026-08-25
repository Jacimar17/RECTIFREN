/**
 * RECTIFREN Inventario API
 * Hoja principal: encabezados exactos "CODIGO", "MARCA", "STOCK"
 * Hoja movimientos: "MOVIMIENTOS" (se crea si no existe)
 *
 * Acciones GET:
 *   ?action=list
 *   ?action=movements&range=week|month
 *
 * Acciones POST:
 *   action=login   (user, pass)
 *   action=in      (user, pass, codigo, marca, cantidad, nota?)
 *   action=out     (user, pass, codigo, marca, cantidad, nota?)
 *   action=set     (user, pass, codigo, marca, nuevoStock, nuevoCodigo?, nuevaMarca?)
 *   action=add     (user, pass, codigo, marca, stock)
 *   action=delete  (user, pass, codigo, marca)
 */

const SHEET_NAME_STOCK = "Stock";
const SHEET_NAME_MOVS  = "MOVIMIENTOS";

function doGet(e) {
  try {
    const action = (e.parameter.action || "").toLowerCase();

    if (action === "list") {
      const cache = CacheService.getScriptCache();
      const cached = cache.get("stock_list");
      if (cached) {
        return json_({ ok: true, data: JSON.parse(cached), cached: true });
      }
      const data = getStock_();
      cache.put("stock_list", JSON.stringify(data), 120); // 2 minutos
      return json_({ ok: true, data });
    }

    if (action === "movements") {
      const range = (e.parameter.range || "week").toLowerCase();
      return json_({ ok: true, data: getMovements_(range) });
    }

    return json_({ ok: false, error: "Acción no válida. Use ?action=list" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const params = e.parameter || {};
    const action = (params.action || "").toLowerCase();

    if (action === "login") {
      const ok = validateCreds_(params.user, params.pass);
      return json_({ ok });
    }

    if (["in", "out", "set", "add", "delete"].includes(action)) {
      if (!validateCreds_(params.user, params.pass)) {
        return json_({ ok: false, error: "Credenciales inválidas." });
      }

      const codigo = (params.codigo || "").trim();
      const marca  = (params.marca  || "").trim();

      if (!codigo || !marca) {
        return json_({ ok: false, error: "Faltan datos: codigo/marca." });
      }

      // ---- ENTRADA / SALIDA ----
      if (action === "in" || action === "out") {
        const cantidad = Number(params.cantidad || 0);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          return json_({ ok: false, error: "Cantidad inválida." });
        }
        const nota = (params.nota || "").trim();
        const res = applyInOut_(action, codigo, marca, cantidad, nota);
        return json_({ ok: true, ...res });
      }

      // ---- AJUSTE DE STOCK (con edición opcional de código/marca) ----
      if (action === "set") {
        const nuevoStock  = Number(params.nuevoStock);
        const nuevoCodigo = (params.nuevoCodigo || "").trim() || codigo;
        const nuevaMarca  = (params.nuevaMarca  || "").trim() || marca;
        if (!Number.isFinite(nuevoStock) || nuevoStock < 0) {
          return json_({ ok: false, error: "nuevoStock inválido." });
        }
        const res = applySet_(codigo, marca, nuevoStock, nuevoCodigo, nuevaMarca);
        return json_({ ok: true, ...res });
      }

      // ---- AGREGAR PRODUCTO ----
      if (action === "add") {
        const stock = Number(params.stock || 0);
        if (!Number.isFinite(stock) || stock < 0) {
          return json_({ ok: false, error: "Stock inválido." });
        }
        const res = addProduct_(codigo, marca, stock);
        return json_(res);
      }

      // ---- ELIMINAR PRODUCTO ----
      if (action === "delete") {
        const res = deleteProduct_(codigo, marca);
        return json_(res);
      }
    }

    return json_({ ok: false, error: "Acción no válida." });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ===================== Helpers ===================== */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSs_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getStockSheet_() {
  const ss = getSs_();
  let sh = ss.getSheetByName(SHEET_NAME_STOCK);
  if (!sh) sh = ss.getSheets()[0];
  return sh;
}

function getMovSheet_() {
  const ss = getSs_();
  let sh = ss.getSheetByName(SHEET_NAME_MOVS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME_MOVS);
    sh.getRange(1,1,1,8).setValues([[
      "FECHA","ACCION","CODIGO","MARCA","CANTIDAD","STOCK_ANTERIOR","STOCK_NUEVO","NOTA"
    ]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureHeaders_(sh) {
  const headers = sh.getRange(1,1,1,3).getValues()[0].map(String);
  const expected = ["CODIGO","MARCA","STOCK"];
  if (headers.join("|") !== expected.join("|")) {
    throw new Error(`Encabezados inválidos. Deben ser: ${expected.join(" | ")}`);
  }
}

function getStock_() {
  const sh = getStockSheet_();
  ensureHeaders_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  return sh.getRange(2,1,lastRow-1,3).getValues()
    .filter(r => String(r[0]).trim() !== "" || String(r[1]).trim() !== "")
    .map(r => ({
      codigo: String(r[0] ?? "").trim(),
      marca:  String(r[1] ?? "").trim(),
      stock:  Number(r[2] ?? 0)
    }));
}

function findRow_(sh, codigo, marca) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const values = sh.getRange(2,1,lastRow-1,2).getValues();
  for (let i = 0; i < values.length; i++) {
    const c = String(values[i][0] ?? "").trim();
    const m = String(values[i][1] ?? "").trim();
    if (c === codigo && m === marca) return i + 2;
  }
  return -1;
}

function applyInOut_(type, codigo, marca, cantidad, nota) {
  const sh = getStockSheet_();
  ensureHeaders_(sh);
  const row = findRow_(sh, codigo, marca);
  if (row === -1) return { ok: false, error: "Producto no encontrado." };

  const stockCell = sh.getRange(row, 3);
  const before = Number(stockCell.getValue() || 0);
  let after = before;

  if (type === "in") after = before + cantidad;
  if (type === "out") {
    after = before - cantidad;
    if (after < 0) return { ok: false, error: "Stock insuficiente." };
  }

  stockCell.setValue(after);
  logMove_(type === "in" ? "ENTRADA" : "SALIDA", codigo, marca, cantidad, before, after, nota || "");
  return { stock_anterior: before, stock_nuevo: after };
}

function applySet_(codigo, marca, nuevoStock, nuevoCodigo, nuevaMarca) {
  const sh = getStockSheet_();
  ensureHeaders_(sh);
  const row = findRow_(sh, codigo, marca);
  if (row === -1) return { ok: false, error: "Producto no encontrado." };

  const before = Number(sh.getRange(row, 3).getValue() || 0);

  // Actualizar codigo, marca y stock en la misma fila
  sh.getRange(row, 1).setValue(nuevoCodigo);
  sh.getRange(row, 2).setValue(nuevaMarca);
  sh.getRange(row, 3).setValue(nuevoStock);

  logMove_("AJUSTE", nuevoCodigo, nuevaMarca, 0, before, nuevoStock, "");
  return { stock_anterior: before, stock_nuevo: nuevoStock };
}

function addProduct_(codigo, marca, stock) {
  const sh = getStockSheet_();
  ensureHeaders_(sh);

  // Verificar que no exista ya
  const existing = findRow_(sh, codigo, marca);
  if (existing !== -1) {
    return { ok: false, error: `El producto "${codigo} - ${marca}" ya existe.` };
  }

  sh.appendRow([codigo, marca, stock]);
  logMove_("ALTA", codigo, marca, stock, 0, stock, "");
  return { ok: true };
}

function deleteProduct_(codigo, marca) {
  const sh = getStockSheet_();
  ensureHeaders_(sh);

  const row = findRow_(sh, codigo, marca);
  if (row === -1) return { ok: false, error: "Producto no encontrado." };

  const before = Number(sh.getRange(row, 3).getValue() || 0);
  sh.deleteRow(row);
  logMove_("BAJA", codigo, marca, 0, before, 0, "");
  return { ok: true };
}

function logMove_(accion, codigo, marca, cantidad, before, after, nota) {
  const sh = getMovSheet_();
  sh.appendRow([
    new Date(), accion, codigo, marca,
    cantidad, before, after, nota || ""
  ]);
  // Invalidar caché de stock
  try { CacheService.getScriptCache().remove("stock_list"); } catch(e) {}
}

function getMovements_(range) {
  const sh = getMovSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const days = (range === "month") ? 30 : 7;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const values = sh.getRange(2,1,lastRow-1,8).getValues();

  const out = [];
  for (const r of values) {
    const fecha = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (fecha < cutoff) continue;
    out.push({
      fecha:          fecha.toISOString(),
      accion:         String(r[1] ?? ""),
      codigo:         String(r[2] ?? ""),
      marca:          String(r[3] ?? ""),
      cantidad:       Number(r[4] ?? 0),
      stock_anterior: Number(r[5] ?? 0),
      stock_nuevo:    Number(r[6] ?? 0),
      nota:           String(r[7] ?? "")
    });
  }

  out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return out;
}

function validateCreds_(user, pass) {
  const props = PropertiesService.getScriptProperties();
  const u = props.getProperty("ADMIN_USER") || "";
  const p = props.getProperty("ADMIN_PASS") || "";
  return String(user || "") === u && String(pass || "") === p;
}
