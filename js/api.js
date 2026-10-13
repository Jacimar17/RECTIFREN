import { API_URL } from "./config.js";

/* ── helpers internos ── */
async function request(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res  = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { ok: false, error: "Respuesta no JSON.", raw: text.slice(0, 200) }; }
  } catch (err) {
    if (err.name === "AbortError") return { ok: false, error: "El servidor tardó demasiado." };
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(t);
  }
}

function jsonHeaders(token) {
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export function authJsonHeaders(token) {
  return jsonHeaders(token);
}

/* ── GET /api/productos ── */
export async function apiGet(params) {
  const action = params.action || "";

  if (action === "list") {
    return request(`${API_URL}/api/productos`);
  }

  if (action === "movements") {
    const range = params.range || "week";
    return request(`${API_URL}/api/movimientos?range=${range}`);
  }

  if (action === "search") {
    const q = encodeURIComponent(params.q || "");
    return request(`${API_URL}/api/productos/search?q=${q}`, {}, 45000);
  }

  return { ok: false, error: "Acción no reconocida." };
}

/* ── POST con JSON (reemplaza apiPostForm) ── */
export async function apiPostForm(bodyObj, timeoutMs = 15000) {
  const action = bodyObj.action || "";
  const token  = bodyObj.token || "";

  // Login
  if (action === "login") {
    return request(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ user: bodyObj.user || "", pass: bodyObj.pass || "" })
    }, timeoutMs);
  }

  // Entrada de stock
  if (action === "in") {
    return request(`${API_URL}/api/stock/in`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ codigo: bodyObj.codigo, marca: bodyObj.marca, cantidad: bodyObj.cantidad || 1, nota: bodyObj.nota || "" })
    }, timeoutMs);
  }

  // Salida de stock
  if (action === "out") {
    return request(`${API_URL}/api/stock/out`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ codigo: bodyObj.codigo, marca: bodyObj.marca, cantidad: bodyObj.cantidad || 1, nota: bodyObj.nota || "" })
    }, timeoutMs);
  }

  // Ajuste / editar producto
  if (action === "set") {
    const lista = await request(`${API_URL}/api/productos/search?q=${encodeURIComponent(bodyObj.codigo || "")}`, {}, 45000);
    if (!lista.ok) return lista;
    const prod = (lista.data || []).find(p => p.codigo === bodyObj.codigo && p.marca === bodyObj.marca);
    if (!prod) return { ok: false, error: "Producto no encontrado." };

    return request(`${API_URL}/api/productos/${prod._id}`, {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        codigo:       bodyObj.nuevoCodigo  || bodyObj.codigo,
        marca:        bodyObj.nuevaMarca   || bodyObj.marca,
        stock:        bodyObj.nuevoStock,
        ubicacion:    bodyObj.ubicacion,
        equivalencias: bodyObj.equivalencias || ""
      })
    }, timeoutMs);
  }

  // Agregar producto
  if (action === "add") {
    return request(`${API_URL}/api/productos`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        codigo: bodyObj.codigo,
        marca: bodyObj.marca,
        stock: bodyObj.stock || 0,
        equivalencias: bodyObj.equivalencias || "",
        ubicacion: bodyObj.ubicacion
      })
    }, timeoutMs);
  }

  // Eliminar producto
  if (action === "delete") {
    const lista = await request(`${API_URL}/api/productos/search?q=${encodeURIComponent(bodyObj.codigo || "")}`, {}, 45000);
    if (!lista.ok) return lista;
    const prod = (lista.data || []).find(p => p.codigo === bodyObj.codigo && p.marca === bodyObj.marca);
    if (!prod) return { ok: false, error: "Producto no encontrado." };

    return request(`${API_URL}/api/productos/${prod._id}`, {
      method: "DELETE",
      headers: jsonHeaders(token)
    }, timeoutMs);
  }

  return { ok: false, error: "Acción no reconocida." };
}

/* ── Beta: búsqueda en proveedores ── */
export async function apiBetaProveedores(q, token) {
  return request(`${API_URL}/api/proveedores`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ q })
  }, 40000);
}

export async function apiDetalleProveedores(codigo, aimarCode, token) {
  return request(`${API_URL}/api/proveedores/detalle`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ codigo, aimarCode })
  }, 45000);
}
