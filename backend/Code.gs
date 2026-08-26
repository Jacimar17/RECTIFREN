/**
 * ============================================================
 *  RECTIFREN — API Backend
 *  Motor: Google Apps Script + Google Sheets
 *  Versión: 2.0
 * ============================================================
 *
 *  HOJA "Stock":        CODIGO | MARCA | STOCK | EQUIVALENCIAS
 *  HOJA "MOVIMIENTOS":  FECHA | ACCION | CODIGO | MARCA | CANTIDAD | STOCK_ANTERIOR | STOCK_NUEVO | NOTA
 *
 *  GET  ?action=list
 *  GET  ?action=movements&range=week|month
 *  GET  ?action=search&q=<término>
 *
 *  POST action=login   { user, pass }
 *  POST action=in      { user, pass, codigo, marca, cantidad, nota? }
 *  POST action=out     { user, pass, codigo, marca, cantidad, nota? }
 *  POST action=set     { user, pass, codigo, marca, nuevoStock, nuevoCodigo?, nuevaMarca?, equivalencias? }
 *  POST action=add     { user, pass, codigo, marca, stock, equivalencias? }
 *  POST action=delete  { user, pass, codigo, marca }
 * ============================================================
 */

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */

const CONFIG = {
  sheets: {
    stock: "stock",
    movimientos: "MOVIMIENTOS"
  },
  cache: {
    ttl: 120  // segundos que vive el caché de lista
  },
  headers: {
    stock: ["CODIGO", "MARCA", "STOCK", "EQUIVALENCIAS"],
    movimientos: ["FECHA", "ACCION", "CODIGO", "MARCA", "CANTIDAD", "STOCK_ANTERIOR", "STOCK_NUEVO", "NOTA"]
  }
};

/* ============================================================
   ENTRY POINTS
   ============================================================ */

function doGet(e) {
  return handleRequest(() => {
    const { action, ...params } = parseParams(e.parameter);
    switch (action) {
      case "list":      return listStock_();
      case "movements": return listMovements_(params.range || "week");
      case "search":    return searchStock_(params.q || "");
      default:          return error_("Acción no válida. Acciones GET: list, movements, search");
    }
  });
}

function doPost(e) {
  return handleRequest(() => {
    const params = parseParams(e.parameter);
    const { action } = params;

    if (action === "login") {
      const ok = validateCreds_(params.user, params.pass);
      return ok ? ok_({}) : error_("Credenciales inválidas.", 401);
    }

    // — Rutas protegidas —
    if (!validateCreds_(params.user, params.pass)) {
      return error_("No autorizado.", 401);
    }

    const { codigo, marca } = sanitize_(params);
    if (!codigo || !marca) return error_("Faltan campos requeridos: codigo, marca.");

    switch (action) {
      case "in":
      case "out":    return stockInOut_(action, codigo, marca, params);
      case "set":    return stockSet_(codigo, marca, params);
      case "add":    return productAdd_(codigo, marca, params);
      case "delete": return productDelete_(codigo, marca);
      default:       return error_("Acción no válida.");
    }
  });
}

/* ============================================================
   ACCIONES — STOCK
   ============================================================ */

function listStock_() {
  try {
    const cache  = CacheService.getScriptCache();
    const cached = cache.get("stock_list");
    if (cached) return ok_({ data: JSON.parse(cached), fromCache: true });
    const data = readStockRows_();
    try { cache.put("stock_list", JSON.stringify(data), CONFIG.cache.ttl); } catch (_) { /* datos muy grandes, se omite cache */ }
    return ok_({ data });
  } catch (err) {
    // Si falla el cache, devolver igual sin el
    const data = readStockRows_();
    return ok_({ data });
  }
}

function searchStock_(query) {
  if (!query.trim()) return ok_({ data: [] });
  const q    = query.trim().toLowerCase();
  const all  = readStockRows_();
  const data = all.filter(p =>
    p.codigo.toLowerCase().includes(q) ||
    p.marca.toLowerCase().includes(q)  ||
    p.equivalencias.toLowerCase().includes(q)
  );
  return ok_({ data, query, total: data.length });
}

function stockInOut_(type, codigo, marca, params) {
  const cantidad = parseFloat(params.cantidad);
  if (!cantidad || cantidad <= 0) return error_("El campo 'cantidad' debe ser un número positivo.");

  const sh  = getStockSheet_();
  const row = findRow_(sh, codigo, marca);
  if (row === -1) return error_(`Producto no encontrado: ${codigo} — ${marca}`);

  const antes  = getStockValue_(sh, row);
  let   despues = antes;

  if (type === "in")  despues = antes + cantidad;
  if (type === "out") {
    if (antes < cantidad) return error_(`Stock insuficiente. Disponible: ${antes}, solicitado: ${cantidad}`);
    despues = antes - cantidad;
  }

  sh.getRange(row, 3).setValue(despues);
  logMovimiento_(type === "in" ? "ENTRADA" : "SALIDA", codigo, marca, cantidad, antes, despues, params.nota || "");
  invalidateCache_();

  return ok_({ codigo, marca, stock_anterior: antes, stock_nuevo: despues });
}

function stockSet_(codigo, marca, params) {
  const nuevoStock  = parseFloat(params.nuevoStock);
  if (isNaN(nuevoStock) || nuevoStock < 0) return error_("El campo 'nuevoStock' debe ser un número >= 0.");

  const nuevoCodigo      = (params.nuevoCodigo      || codigo).trim();
  const nuevaMarca       = (params.nuevaMarca       || marca).trim();
  const nuevasEquiv      = (params.equivalencias    || "").trim();

  const sh  = getStockSheet_();
  const row = findRow_(sh, codigo, marca);
  if (row === -1) return error_(`Producto no encontrado: ${codigo} — ${marca}`);

  const antes = getStockValue_(sh, row);
  sh.getRange(row, 1, 1, 4).setValues([[nuevoCodigo, nuevaMarca, nuevoStock, nuevasEquiv]]);
  logMovimiento_("AJUSTE", nuevoCodigo, nuevaMarca, 0, antes, nuevoStock, "");
  invalidateCache_();

  return ok_({ codigo: nuevoCodigo, marca: nuevaMarca, stock_anterior: antes, stock_nuevo: nuevoStock });
}

/* ============================================================
   ACCIONES — PRODUCTOS
   ============================================================ */

function productAdd_(codigo, marca, params) {
  const sh = getStockSheet_();
  if (findRow_(sh, codigo, marca) !== -1) {
    return error_(`El producto ya existe: ${codigo} — ${marca}`);
  }

  const stock       = parseFloat(params.stock || 0);
  const equivalencias = (params.equivalencias || "").trim();
  if (isNaN(stock) || stock < 0) return error_("El campo 'stock' debe ser un número >= 0.");

  sh.appendRow([codigo, marca, stock, equivalencias]);
  logMovimiento_("ALTA", codigo, marca, stock, 0, stock, "");
  invalidateCache_();

  return ok_({ codigo, marca, stock });
}

function productDelete_(codigo, marca) {
  const sh  = getStockSheet_();
  const row = findRow_(sh, codigo, marca);
  if (row === -1) return error_(`Producto no encontrado: ${codigo} — ${marca}`);

  const stockAntes = getStockValue_(sh, row);
  sh.deleteRow(row);
  logMovimiento_("BAJA", codigo, marca, 0, stockAntes, 0, "");
  invalidateCache_();

  return ok_({ codigo, marca });
}

/* ============================================================
   MOVIMIENTOS
   ============================================================ */

function listMovements_(range) {
  const sh      = getMovSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return ok_({ data: [] });

  const days   = range === "month" ? 30 : 7;
  const cutoff = new Date(Date.now() - days * 86400 * 1000);
  const rows   = sh.getRange(2, 1, lastRow - 1, 8).getValues();

  const data = rows
    .filter(r => {
      const fecha = r[0] instanceof Date ? r[0] : new Date(r[0]);
      return fecha >= cutoff;
    })
    .map(r => ({
      fecha:          (r[0] instanceof Date ? r[0] : new Date(r[0])).toISOString(),
      accion:         String(r[1] || ""),
      codigo:         String(r[2] || ""),
      marca:          String(r[3] || ""),
      cantidad:       Number(r[4] || 0),
      stock_anterior: Number(r[5] || 0),
      stock_nuevo:    Number(r[6] || 0),
      nota:           String(r[7] || "")
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  return ok_({ data, range, total: data.length });
}

function logMovimiento_(accion, codigo, marca, cantidad, antes, despues, nota) {
  getMovSheet_().appendRow([new Date(), accion, codigo, marca, cantidad, antes, despues, nota || ""]);
}

/* ============================================================
   HELPERS — SHEETS
   ============================================================ */

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getStockSheet_() {
  const ss = getSpreadsheet_();
  return ss.getSheetByName(CONFIG.sheets.stock) || ss.getSheets()[0];
}

function getMovSheet_() {
  const ss = getSpreadsheet_();
  let sh   = ss.getSheetByName(CONFIG.sheets.movimientos);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.sheets.movimientos);
    sh.getRange(1, 1, 1, 8).setValues([CONFIG.headers.movimientos]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readStockRows_() {
  const sh      = getStockSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  // Leer hasta 4 columnas (la 4ta es EQUIVALENCIAS, puede no existir aún)
  const numCols = Math.min(sh.getLastColumn(), 4);
  return sh.getRange(2, 1, lastRow - 1, numCols).getValues()
    .filter(r => String(r[0]).trim() || String(r[1]).trim())
    .map(r => ({
      codigo:        String(r[0] || "").trim(),
      marca:         String(r[1] || "").trim(),
      stock:         Number(r[2] || 0),
      equivalencias: String(r[3] || "").trim()
    }));
}

function findRow_(sh, codigo, marca) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const values = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === codigo && String(values[i][1]).trim() === marca) {
      return i + 2;
    }
  }
  return -1;
}

function getStockValue_(sh, row) {
  return Number(sh.getRange(row, 3).getValue() || 0);
}

/* ============================================================
   HELPERS — CACHÉ
   ============================================================ */

function invalidateCache_() {
  try { CacheService.getScriptCache().remove("stock_list"); } catch (_) {}
}

/* ============================================================
   HELPERS — AUTH
   ============================================================ */

function validateCreds_(user, pass) {
  const props = PropertiesService.getScriptProperties();
  return String(user || "") === (props.getProperty("ADMIN_USER") || "")
      && String(pass || "") === (props.getProperty("ADMIN_PASS") || "");
}

/* ============================================================
   HELPERS — RESPUESTA HTTP
   ============================================================ */

function handleRequest(fn) {
  try {
    return fn();
  } catch (err) {
    console.error(err);
    return error_(`Error interno: ${String(err)}`);
  }
}

function ok_(payload) {
  return json_({ ok: true, ...payload });
}

function error_(message, code) {
  return json_({ ok: false, error: message, code: code || 400 });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   HELPERS — PARSEO
   ============================================================ */

function parseParams(params) {
  const result = {};
  for (const key in params) {
    result[key.toLowerCase()] = String(params[key] || "").trim();
  }
  return result;
}

function sanitize_(params) {
  return {
    codigo: (params.codigo || "").trim(),
    marca:  (params.marca  || "").trim()
  };
}
