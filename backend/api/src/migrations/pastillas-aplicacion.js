const { createHash } = require("node:crypto");
const { EJSON } = require("mongoose").mongo.BSON;
const { crearInformeVerificable, huella } = require("./pastillas-informe");
const { normalizarCodigo } = require("../proveedores/familia-inventario");
const { identidadMarca } = require("../proveedores/familias-catalogo-persistido");
const { ErrorSeguro, conLimpieza } = require("./pastillas-errores");

function hashArchivo(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonico(value) {
  if (Array.isArray(value)) return value.map(canonico);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonico(value[key])]));
  }
  return value;
}

function verificarInforme(bytes, hashAprobado, productos, catalogo) {
  if (!/^[a-f0-9]{64}$/.test(hashAprobado || "") || hashArchivo(bytes) !== hashAprobado) {
    throw new ErrorSeguro("La huella del archivo del informe no coincide con la aprobación.");
  }
  const aprobado = JSON.parse(bytes.toString("utf8"));
  const actual = JSON.parse(JSON.stringify(crearInformeVerificable(productos, catalogo)));
  if (JSON.stringify(canonico(aprobado)) !== JSON.stringify(canonico(actual))) {
    throw new ErrorSeguro("El informe aprobado no coincide con el inventario o catálogo actuales.");
  }
  return actual;
}

function id(documento) {
  return documento && documento._id != null ? String(documento._id) : "";
}

function seleccionarCambios(informe, productos) {
  const porId = new Map(productos.map(p => [id(p), p]));
  if (porId.size !== productos.length || porId.has("")) throw new ErrorSeguro("Identificadores de productos inválidos o duplicados.");
  const seleccionados = [];
  const excluidos = [];
  for (const propuesta of informe.propuestas) {
    const motivo = !Array.isArray(propuesta.requiereRevision) || propuesta.requiereRevision.length
      ? "Requiere revisión."
      : propuesta.documentos.length !== 1 ? "Fusión no implementada." : null;
    if (motivo) {
      excluidos.push({ marca: propuesta.marca, codigo: propuesta.codigoOficial, motivo });
      continue;
    }
    const producto = porId.get(propuesta.documentos[0].id);
    if (!producto || producto.archivado === true || producto.schemaVersion === 2 ||
        producto.migracionPastillas != null ||
        (producto.codigosAnteriores != null && (!Array.isArray(producto.codigosAnteriores) ||
          producto.codigosAnteriores.some(c => typeof c !== "string")))) {
      excluidos.push({ marca: propuesta.marca, codigo: propuesta.codigoOficial, motivo: "Documento incompatible." });
      continue;
    }
    const codigo = producto.codigo || producto.CODIGO;
    if (typeof codigo !== "string" || typeof propuesta.codigoOficial !== "string" ||
        normalizarCodigo(codigo) === normalizarCodigo(propuesta.codigoOficial)) {
      excluidos.push({ marca: propuesta.marca, codigo: propuesta.codigoOficial, motivo: "Sin cambio inequívoco." });
      continue;
    }
    // Los alias y variantes pueden contener duplicados que la simulación no busca.
    const clave = normalizarCodigo(propuesta.codigoOficial);
    const posibleDuplicado = productos.some(otro => {
      if (otro === producto || otro.archivado === true) return false;
      const codigos = [otro.codigo, otro.CODIGO, ...(Array.isArray(otro.codigosAnteriores) ? otro.codigosAnteriores : []),
        ...(Array.isArray(otro.equivalenciasCatalogo) ? otro.equivalenciasCatalogo.map(e => e && e.codigo) : []),
        ...(Array.isArray(otro.variantes) ? otro.variantes.flatMap(v =>
          v ? [v.codigo, v.CODIGO, ...(Array.isArray(v.codigosAnteriores) ? v.codigosAnteriores : [])] : []) : [])];
      return codigos.some(c => {
        const normalizado = normalizarCodigo(c);
        return normalizado === clave || (normalizado.length > clave.length && normalizado.endsWith(clave));
      });
    });
    if (posibleDuplicado) {
      excluidos.push({ marca: propuesta.marca, codigo: propuesta.codigoOficial, motivo: "Posible duplicado o alias." });
      continue;
    }
    seleccionados.push({ id: id(producto), codigoAnterior: codigo, codigoOficial: propuesta.codigoOficial });
  }
  return { seleccionados, excluidos };
}

function construirActualizacion(producto, cambio, informeHash, fecha) {
  if (id(producto) !== cambio.id || !/^[a-f0-9]{64}$/.test(informeHash) ||
      !(fecha instanceof Date) || !Number.isFinite(fecha.getTime()) ||
      producto.migracionPastillas != null ||
      (producto.codigo || producto.CODIGO) !== cambio.codigoAnterior ||
      typeof cambio.codigoOficial !== "string" || !cambio.codigoOficial.trim() ||
      (producto.codigosAnteriores != null && (!Array.isArray(producto.codigosAnteriores) ||
        producto.codigosAnteriores.some(c => typeof c !== "string")))) {
    throw new Error("Datos de trazabilidad inválidos.");
  }
  const set = { migracionPastillas: { informeSha256: informeHash, fecha, codigoAnterior: cambio.codigoAnterior } };
  if (producto.codigo != null) set.codigo = cambio.codigoOficial;
  if (producto.CODIGO != null) set.CODIGO = cambio.codigoOficial;
  const anteriores = [...new Set([producto.codigo, producto.CODIGO].filter(c => typeof c === "string" && c.trim()))];
  return { $set: set, $addToSet: { codigosAnteriores: { $each: anteriores } } };
}

async function inspeccionarEnTransaccion({ session, leerProductos, leerCatalogo, bytesInforme, hashAprobado }) {
  session.startTransaction({ readConcern: { level: "snapshot" }, readPreference: "primary" });
  return conLimpieza(async () => {
    const productos = await leerProductos(session);
    const catalogo = await leerCatalogo(session);
    const informe = verificarInforme(bytesInforme, hashAprobado, productos, catalogo);
    return seleccionarCambios(informe, productos);
  }, () => session.abortTransaction(), "abortar");
}

function crearPlan(informe, productos, informeSha256) {
  if (!/^[a-f0-9]{64}$/.test(informeSha256 || "")) throw new ErrorSeguro("Huella del informe inválida.");
  return { version: 1, informeSha256, ...seleccionarCambios(informe, productos) };
}

function valorId(value) {
  if (typeof value === "string" && value) return value;
  if (value && typeof value.toHexString === "function") return value.toHexString();
  return "";
}

function contieneIds(value, ids, codigos) {
  if (typeof value === "string") {
    const codigo = normalizarCodigo(value);
    return ids.has(value) || (codigo && codigos.has(codigo));
  }
  if (!value || typeof value !== "object") return false;
  if (typeof value.toHexString === "function") return ids.has(value.toHexString());
  if (value instanceof Date || Buffer.isBuffer(value)) return false;
  return Object.values(value).some(v => contieneIds(v, ids, codigos));
}

function camposConReferenciaDesconocida(doc, permitidos, ids, codigos) {
  return Object.entries(doc).some(([campo, valor]) =>
    !permitidos.has(campo) && contieneIds(valor, ids, codigos));
}

function prepararFusion(propuesta, productos, movimientos, confirmacion, informeSha256, fecha) {
  const fallar = motivo => { throw new ErrorSeguro(motivo); };
  if (!confirmacion || !Array.isArray(confirmacion.ids) || confirmacion.ids.length < 2 ||
      typeof confirmacion.destino !== "string" || typeof confirmacion.evidencia !== "string" ||
      !confirmacion.evidencia.trim()) fallar("Falta confirmación independiente de identidad.");
  const revisionesConfirmables = new Set([
    "Código con prefijo de marca: confirmar que es la misma pieza.",
    "Código TRW abreviado: confirmar que es la misma pieza.",
  ]);
  if (!propuesta || !Array.isArray(propuesta.requiereRevision) ||
      propuesta.requiereRevision.some(motivo => !revisionesConfirmables.has(motivo)) ||
      !Array.isArray(propuesta.documentos) || propuesta.documentos.length < 2 ||
      propuesta.stockIncompleto || Object.keys(propuesta.metadatosEnConflicto || {}).length) {
    fallar("El grupo requiere revisión.");
  }
  const ids = new Set(confirmacion.ids);
  if (ids.size !== confirmacion.ids.length || confirmacion.ids.some(clave => typeof clave !== "string" || !clave) ||
      ids.size !== propuesta.documentos.length ||
      propuesta.documentos.some(d => !ids.has(d.id)) || !ids.has(confirmacion.destino)) {
    fallar("La confirmación no identifica exactamente el grupo.");
  }
  const mapa = new Map(productos.map(p => [id(p), p]));
  if (mapa.size !== productos.length || mapa.has("")) fallar("Identificadores de productos inválidos.");
  const grupo = confirmacion.ids.map(clave => mapa.get(clave));
  if (grupo.some(p => !p)) fallar("Falta un producto del grupo.");
  const destino = mapa.get(confirmacion.destino);
  const oficial = propuesta.codigoOficial;
  const marca = destino.marca || destino.MARCA;
  if (typeof oficial !== "string" || !oficial.trim() || oficial !== oficial.trim() ||
      typeof marca !== "string" || !marca.trim() || marca !== marca.trim()) {
    fallar("Código o marca inválidos.");
  }
  const codigoOficialNormalizado = normalizarCodigo(oficial);
  const marcaNormalizada = identidadMarca(marca);
  const correspondeOficial = codigo => {
    const clave = normalizarCodigo(codigo);
    if (clave === codigoOficialNormalizado) return true;
    if (clave === `${normalizarCodigo(marca)}${codigoOficialNormalizado}`) return true;
    const trw = clave.match(/^TRW([A-Z0-9]+)$/);
    const rcpt = codigoOficialNormalizado.match(/^RCPT([A-Z0-9]+)$/);
    return marcaNormalizada === "TRW" && Boolean(trw && rcpt && trw[1] === rcpt[1]);
  };
  let anterior;
  for (const p of grupo) {
    const codigo = p.codigo || p.CODIGO;
    if (valorId(p._id) !== id(p) || p.archivado === true || (p.schemaVersion != null && p.schemaVersion !== 1) ||
        p.migracionPastillas != null || p.variantes != null ||
        (p.marca != null && p.marca !== marca) || (p.MARCA != null && p.MARCA !== marca) ||
        (p.codigo != null && p.codigo !== codigo) || (p.CODIGO != null && p.CODIGO !== codigo) ||
        typeof codigo !== "string" || codigo !== codigo.trim() ||
        !["NEGOCIO", "DEPOSITO_GALPON"].includes(p.ubicacion) || p.ubicacionPendiente ||
        !Number.isSafeInteger(p.stock ?? p.STOCK) || (p.stock ?? p.STOCK) < 0 ||
        (p.stock != null && p.STOCK != null && p.stock !== p.STOCK) ||
        (p.stockMinimo != null && (!Number.isSafeInteger(p.stockMinimo) || p.stockMinimo < 0)) ||
        (p.codigosAnteriores != null && (!Array.isArray(p.codigosAnteriores) ||
          p.codigosAnteriores.some(c => typeof c !== "string")))) {
      fallar("Documento, marca, código, stock o ubicación incompatible.");
    }
    if (!correspondeOficial(codigo)) {
      if (!/^PD[/ -]?[A-Z0-9]+$/i.test(codigo) || (anterior && anterior !== codigo)) {
        fallar("Los códigos no son exactos o existen códigos anteriores distintos.");
      }
      anterior = codigo;
    }
  }
  if (!correspondeOficial(destino.codigo || destino.CODIGO) ||
      (!anterior && !/^PD[/ -]?[A-Z0-9]+$/i.test(oficial))) {
    fallar("Se requiere destino oficial verificable y origen PD confirmado.");
  }
  const codigosGrupo = new Set([oficial, anterior, ...grupo.flatMap(p =>
    [p.codigo, p.CODIGO, ...(p.codigosAnteriores || [])])]
    .map(normalizarCodigo).filter(Boolean));
  const variables = new Set(["_id", "codigo", "CODIGO", "marca", "MARCA", "stock", "STOCK",
    "ubicacion", "ubicacionPendiente", "createdAt", "updatedAt", "__v"]);
  const metadatos = p => Object.fromEntries(Object.entries(p).filter(([k]) => !variables.has(k)));
  const huellaMetadatos = p => huella(canonico(JSON.parse(EJSON.stringify(metadatos(p), { relaxed: false }))));
  if (grupo.some(p => huellaMetadatos(p) !== huellaMetadatos(destino))) {
    fallar("Metadatos incompatibles.");
  }
  for (const p of productos) {
    if (camposConReferenciaDesconocida(p, new Set(["_id", "equivalentesVinculados",
      "codigo", "CODIGO", "codigosAnteriores"]), ids, codigosGrupo)) {
      fallar("Hay referencias de producto en campos no reconocidos.");
    }
    if (p.equivalentesVinculados != null && (!Array.isArray(p.equivalentesVinculados) ||
        p.equivalentesVinculados.some(ref => !valorId(ref) || !mapa.has(valorId(ref))))) {
      fallar("Vínculos no verificables.");
    }
    if (ids.has(id(p)) && (p.equivalentesVinculados || []).some(ref => ids.has(valorId(ref)))) {
      fallar("El grupo contiene vínculos internos.");
    }
  }
  const movimientosId = new Set();
  for (const m of movimientos) {
    if (!id(m) || movimientosId.has(id(m))) fallar("Identificadores de movimientos inválidos.");
    movimientosId.add(id(m));
    if (camposConReferenciaDesconocida(m, new Set(["_id", "productoId", "codigo"]), ids, codigosGrupo)) {
      fallar("Hay referencias de movimiento en campos no reconocidos.");
    }
    const ref = valorId(m.productoId);
    const codigoMovimiento = normalizarCodigo(m.codigo);
    if (codigoMovimiento && [...codigosGrupo].some(c => codigoMovimiento.endsWith(c)) && !ids.has(ref)) {
      const otro = mapa.get(ref);
      const otraMarca = otro && identidadMarca(otro.marca || otro.MARCA);
      if (!otraMarca || otraMarca === marcaNormalizada) fallar("Movimiento por código sin referencia inequívoca.");
    }
    if (ids.has(ref) && ref !== confirmacion.destino && m.referenciaPastillasOriginal != null) {
      fallar("La referencia histórica del movimiento ya está ocupada.");
    }
  }
  // No se asume que un alias, prefijo o variante en otro documento sea otra pieza.
  for (const p of productos) {
    if (ids.has(id(p)) || p.archivado === true) continue;
    const otraMarca = identidadMarca(p.marca || p.MARCA);
    const tieneVarianteDeMarca = Array.isArray(p.variantes) &&
      p.variantes.some(v => v && identidadMarca(v.marca) === marcaNormalizada);
    if (otraMarca && otraMarca !== marcaNormalizada && !tieneVarianteDeMarca) continue;
    const codigos = [p.codigo, p.CODIGO, ...(Array.isArray(p.codigosAnteriores) ? p.codigosAnteriores : []),
      ...(Array.isArray(p.equivalenciasCatalogo) ? p.equivalenciasCatalogo.map(e => e && e.codigo) : []),
      ...(Array.isArray(p.variantes) ? p.variantes.flatMap(v => v
        ? [v.codigo, v.CODIGO, ...(Array.isArray(v.codigosAnteriores) ? v.codigosAnteriores : [])] : []) : [])];
    if (codigos.some(c => {
      const codigo = normalizarCodigo(c), clave = normalizarCodigo(oficial);
      return codigo && (codigo === clave || codigo.endsWith(clave));
    })) fallar("Posible duplicado o alias externo.");
  }
  const variantes = new Map();
  for (const p of grupo) {
    const cantidad = p.stock ?? p.STOCK;
    const existente = variantes.get(p.ubicacion);
    if (existente) {
      existente.cantidad += cantidad;
      if (!Number.isSafeInteger(existente.cantidad)) fallar("Stock acumulado inválido.");
    } else {
      variantes.set(p.ubicacion, { _id: p._id, marca, ubicacion: p.ubicacion,
        cantidad, ...(p.stockMinimo != null ? { stockMinimo: p.stockMinimo } : {}) });
    }
  }
  const total = [...variantes.values()].reduce((s, v) => s + v.cantidad, 0);
  if (!Number.isSafeInteger(total)) fallar("Stock total inválido.");
  const alias = [...(destino.codigosAnteriores || [])];
  for (const p of grupo) {
    for (const codigo of [p.codigo, p.CODIGO]) {
      if (codigo && codigo !== oficial && !alias.includes(codigo)) alias.push(codigo);
    }
  }
  const fusionado = { ...destino, codigo: oficial, schemaVersion: 2, archivado: false,
    variantes: [...variantes.values()], codigosAnteriores: alias,
    migracionPastillas: { informeSha256, fecha, fusionados: grupo.filter(p => p !== destino).map(p => p._id) } };
  if (destino.CODIGO != null) fusionado.CODIGO = oficial;
  if (destino.stock != null) fusionado.stock = total;
  if (destino.STOCK != null) fusionado.STOCK = total;
  delete fusionado.ubicacion;
  const reemplazados = new Set([...ids].filter(clave => clave !== confirmacion.destino));
  const productosDespues = productos.map(p => {
    let result = p === destino ? fusionado : reemplazados.has(id(p))
      ? { ...p, archivado: true, migracionPastillas: { informeSha256, fecha, reemplazadoPor: destino._id } } : p;
    if (!reemplazados.has(id(p)) && Array.isArray(result.equivalentesVinculados)) {
      const refs = result.equivalentesVinculados.map(ref => reemplazados.has(valorId(ref)) ? destino._id : ref);
      const claves = refs.map(valorId);
      if (new Set(claves).size !== claves.length || claves.includes(id(p))) {
        fallar("La actualización produciría vínculos duplicados o reflexivos.");
      }
      if (refs.some((ref, i) => ref !== result.equivalentesVinculados[i])) result = { ...result, equivalentesVinculados: refs };
    }
    return result;
  });
  const movimientosDespues = movimientos.map(m => reemplazados.has(valorId(m.productoId))
    ? { ...m, productoId: destino._id, referenciaPastillasOriginal: { productoId: m.productoId, informeSha256 } }
    : m);
  return { productosDespues, movimientosDespues };
}

function crearPlanFusion(informe, productos, movimientos, informeSha256, confirmacion) {
  if (!/^[a-f0-9]{64}$/.test(informeSha256 || "") || !Array.isArray(movimientos)) {
    throw new ErrorSeguro("Huella del informe o movimientos inválidos.");
  }
  const copia = JSON.parse(JSON.stringify(confirmacion || null));
  const propuestas = informe.propuestas.filter(p => Array.isArray(p.documentos) && copia &&
    Array.isArray(copia.ids) && p.documentos.length === copia.ids.length &&
    p.documentos.every(d => copia.ids.includes(d.id)));
  let motivo = "";
  try {
    if (propuestas.length !== 1) throw new ErrorSeguro("La confirmación no identifica una única propuesta.");
    prepararFusion(propuestas[0], productos, movimientos, copia, informeSha256, new Date(0));
  } catch (error) {
    if (!(error instanceof ErrorSeguro)) throw error;
    motivo = error.message;
  }
  return { version: 2, informeSha256, movimientosSha256: huella(movimientos), confirmacion: copia,
    fusion: motivo ? null : { ids: copia.ids, destino: copia.destino },
    excluidos: motivo ? [motivo] : [] };
}

function verificarPlan(bytesPlan, hashPlan, informe, productos, informeSha256, movimientos) {
  if (!Buffer.isBuffer(bytesPlan) || !/^[a-f0-9]{64}$/.test(hashPlan || "") || hashArchivo(bytesPlan) !== hashPlan) {
    throw new ErrorSeguro("La huella del plan no coincide con la aprobación.");
  }
  const plan = JSON.parse(bytesPlan.toString("utf8"));
  const esperado = plan.version === 2
    ? crearPlanFusion(informe, productos, movimientos, informeSha256, plan.confirmacion)
    : crearPlan(informe, productos, informeSha256);
  if (JSON.stringify(canonico(plan)) !== JSON.stringify(canonico(esperado))) {
    throw new ErrorSeguro("El plan aprobado no coincide con el informe y el inventario.");
  }
  return esperado;
}

function productoActualizado(producto, cambio, informeHash, fecha) {
  const update = construirActualizacion(producto, cambio, informeHash, fecha);
  const anteriores = [...(producto.codigosAnteriores || [])];
  for (const codigo of update.$addToSet.codigosAnteriores.$each) {
    if (!anteriores.includes(codigo)) anteriores.push(codigo);
  }
  return { ...producto, ...update.$set, codigosAnteriores: anteriores };
}

function reconstruirAntes(actuales, respaldo) {
  if (!Array.isArray(respaldo)) throw new ErrorSeguro("Faltan respaldos.");
  const mapa = new Map(respaldo.map(p => [id(p), p]));
  if (mapa.size !== respaldo.length || mapa.has("")) throw new ErrorSeguro("Respaldos inválidos.");
  const encontrados = new Set();
  const anteriores = actuales.map(p => {
    if (!mapa.has(id(p))) return p;
    encontrados.add(id(p));
    return mapa.get(id(p));
  });
  if (encontrados.size !== mapa.size) throw new ErrorSeguro("Faltan documentos respaldados.");
  return anteriores;
}

function documentosAlterados(antes, despues) {
  return antes.flatMap((p, i) => huella(p) === huella(despues[i]) ? [] : [{ antes: p, despues: despues[i] }]);
}

async function ejecutarFusionTransaccional({ session, almacen, productos, catalogo, auditoria,
  bytesInforme, hashAprobado, bytesPlan, hashPlan, fecha }) {
  if (typeof almacen.comprobarCobertura !== "function" || typeof almacen.leerMovimientos !== "function" ||
      typeof almacen.reemplazarMovimiento !== "function" ||
      await almacen.comprobarCobertura(session) !== true) {
    throw new ErrorSeguro("No se verificó la cobertura de referencias del entorno de prueba.");
  }
  const movimientos = await almacen.leerMovimientos(session);
  let anteriores = productos;
  let movimientosAntes = movimientos;
  if (auditoria) {
    if (auditoria.versionPlan !== 2 || auditoria.informeSha256 !== hashAprobado ||
        auditoria.planSha256 !== hashPlan || auditoria.inventarioDespues !== huella(productos) ||
        auditoria.movimientosDespues !== huella(movimientos) || auditoria.catalogoSha256 !== huella(catalogo) ||
        !(auditoria.fecha instanceof Date) || !Number.isFinite(auditoria.fecha.getTime())) {
      throw new ErrorSeguro("La aplicación anterior o el estado actual no se pueden verificar.");
    }
    anteriores = reconstruirAntes(productos, auditoria.respaldos);
    movimientosAntes = reconstruirAntes(movimientos, auditoria.respaldosMovimientos);
  }
  const informe = verificarInforme(bytesInforme, hashAprobado, anteriores, catalogo);
  const plan = verificarPlan(bytesPlan, hashPlan, informe, anteriores, hashAprobado, movimientosAntes);
  if (!plan.fusion) {
    if (auditoria) throw new ErrorSeguro("Auditoría sin fusión aprobada.");
    await session.abortTransaction();
    return { estado: "sin_cambios", seleccionados: 0 };
  }
  const propuesta = informe.propuestas.find(p => p.documentos.length === plan.fusion.ids.length &&
    p.documentos.every(d => plan.fusion.ids.includes(d.id)));
  const resultado = prepararFusion(propuesta, anteriores, movimientosAntes, plan.confirmacion,
    hashAprobado, auditoria ? auditoria.fecha : fecha);
  const productosCambiados = documentosAlterados(anteriores, resultado.productosDespues);
  const movimientosCambiados = documentosAlterados(movimientosAntes, resultado.movimientosDespues);
  if (auditoria) {
    if (huella(resultado.productosDespues) !== huella(productos) ||
        huella(resultado.movimientosDespues) !== huella(movimientos) ||
        huella(productosCambiados.map(c => c.antes)) !== huella(auditoria.respaldos) ||
        huella(movimientosCambiados.map(c => c.antes)) !== huella(auditoria.respaldosMovimientos)) {
      throw new ErrorSeguro("El estado aplicado no coincide con la fusión aprobada.");
    }
    await session.abortTransaction();
    return { estado: "ya_aplicado", seleccionados: 1 };
  }
  await almacen.insertarAuditoria({
    versionPlan: 2, planSha256: hashPlan, informeSha256: hashAprobado, fecha,
    catalogoSha256: huella(catalogo), inventarioDespues: huella(resultado.productosDespues),
    movimientosDespues: huella(resultado.movimientosDespues),
    respaldos: productosCambiados.map(c => c.antes),
    respaldosMovimientos: movimientosCambiados.map(c => c.antes),
  }, session);
  for (const cambio of productosCambiados) {
    if (await almacen.reemplazarProducto(cambio.antes, cambio.despues, session) !== 1) {
      throw new ErrorSeguro("Conflicto al reemplazar un producto.");
    }
  }
  for (const cambio of movimientosCambiados) {
    if (await almacen.reemplazarMovimiento(cambio.antes, cambio.despues, session) !== 1) {
      throw new ErrorSeguro("Conflicto al reemplazar un movimiento.");
    }
  }
  await session.commitTransaction();
  return { estado: "aplicado", seleccionados: 1 };
}

// El adaptador de prueba debe proporcionar aislamiento serializable para todas
// las lecturas, escrituras condicionales y una auditoría única por hash de plan.
// Una instantánea MongoDB por sí sola no satisface este contrato.
async function ejecutarMotorAislado({ session, almacen, bytesInforme, hashAprobado, bytesPlan, hashPlan, fecha }) {
  if (!Buffer.isBuffer(bytesInforme) || !/^[a-f0-9]{64}$/.test(hashAprobado || "") ||
      hashArchivo(bytesInforme) !== hashAprobado || !Buffer.isBuffer(bytesPlan) ||
      !/^[a-f0-9]{64}$/.test(hashPlan || "") || hashArchivo(bytesPlan) !== hashPlan ||
      !(fecha instanceof Date) || !Number.isFinite(fecha.getTime())) {
    throw new ErrorSeguro("Aprobación o fecha inválida.");
  }
  session.startTransaction({ readConcern: { level: "snapshot" }, readPreference: "primary",
    writeConcern: { w: "majority" } });
  let finalizada = false;
  try {
    await almacen.comprobarAislamiento(session);
    const productos = await almacen.leerProductos(session);
    const catalogo = await almacen.leerCatalogo(session);
    const auditoria = await almacen.leerAuditoria(hashPlan, session);
    if (JSON.parse(bytesPlan.toString("utf8")).version === 2) {
      const resultado = await ejecutarFusionTransaccional({ session, almacen, productos, catalogo,
        auditoria, bytesInforme, hashAprobado, bytesPlan, hashPlan, fecha });
      finalizada = true;
      return resultado;
    }
    if (auditoria) {
      if (auditoria.informeSha256 !== hashAprobado || auditoria.planSha256 !== hashPlan ||
          !Array.isArray(auditoria.respaldos) ||
          auditoria.inventarioDespues !== huella(productos) ||
          auditoria.catalogoSha256 !== huella(catalogo)) {
        throw new ErrorSeguro("La aplicación anterior o el estado actual no se pueden verificar.");
      }
      const respaldos = new Map(auditoria.respaldos.map(p => [id(p), p]));
      if (respaldos.size !== auditoria.respaldos.length || respaldos.has("")) {
        throw new ErrorSeguro("Los respaldos de la auditoría son inválidos.");
      }
      const encontrados = new Set();
      const anteriores = productos.map(p => {
        const clave = id(p);
        if (!respaldos.has(clave)) return p;
        encontrados.add(clave);
        return respaldos.get(clave);
      });
      if (encontrados.size !== respaldos.size) throw new ErrorSeguro("Faltan productos respaldados.");
      const informe = verificarInforme(bytesInforme, hashAprobado, anteriores, catalogo);
      const plan = verificarPlan(bytesPlan, hashPlan, informe, anteriores, hashAprobado);
      if (plan.seleccionados.length !== respaldos.size ||
          plan.seleccionados.some(c => !respaldos.has(c.id))) {
        throw new ErrorSeguro("Los respaldos no coinciden con el plan.");
      }
      if (!(auditoria.fecha instanceof Date) || !Number.isFinite(auditoria.fecha.getTime())) {
        throw new ErrorSeguro("La fecha de auditoría es inválida.");
      }
      const esperados = new Map(plan.seleccionados.map(c => [
        c.id, productoActualizado(respaldos.get(c.id), c, hashAprobado, auditoria.fecha),
      ]));
      if (huella(anteriores.map(p => esperados.get(id(p)) || p)) !== huella(productos)) {
        throw new ErrorSeguro("El estado aplicado no coincide con los cambios aprobados.");
      }
      await session.abortTransaction();
      finalizada = true;
      return { estado: "ya_aplicado", seleccionados: plan.seleccionados.length };
    }

    const informe = verificarInforme(bytesInforme, hashAprobado, productos, catalogo);
    const plan = verificarPlan(bytesPlan, hashPlan, informe, productos, hashAprobado);
    const porId = new Map(productos.map(p => [id(p), p]));
    const cambios = plan.seleccionados.map(cambio => {
      const antes = porId.get(cambio.id);
      return { antes, despues: productoActualizado(antes, cambio, hashAprobado, fecha) };
    });
    if (new Set(cambios.map(c => id(c.antes))).size !== cambios.length) {
      throw new ErrorSeguro("Un producto aparece en más de un cambio.");
    }
    if (!cambios.length) {
      await session.abortTransaction();
      finalizada = true;
      return { estado: "sin_cambios", seleccionados: 0 };
    }
    const despuesPorId = new Map(cambios.map(c => [id(c.antes), c.despues]));
    const inventarioDespues = productos.map(p => despuesPorId.get(id(p)) || p);
    await almacen.insertarAuditoria({
      planSha256: hashPlan, informeSha256: hashAprobado, fecha,
      catalogoSha256: huella(catalogo), inventarioDespues: huella(inventarioDespues),
      respaldos: cambios.map(c => c.antes),
    }, session);
    for (const cambio of cambios) {
      const modificados = await almacen.reemplazarProducto(cambio.antes, cambio.despues, session);
      if (modificados !== 1) throw new ErrorSeguro("Conflicto al reemplazar un producto.");
    }
    await session.commitTransaction();
    finalizada = true;
    return { estado: "aplicado", seleccionados: cambios.length };
  } catch (error) {
    if (finalizada) throw error;
    return conLimpieza(async () => { throw error; }, () => session.abortTransaction(), "abortar");
  }
}

// Las comprobaciones de conexión reducen el riesgo de usar producción por
// accidente; no sustituyen el aislamiento operacional del servidor local.
async function ejecutarEnReplicaAislada({ db, session, leerCatalogo, verificarAislamiento, verificarCobertura,
  soloPruebas, bytesInforme, hashAprobado, bytesPlan, hashPlan, fecha }) {
  const cliente = db && db.client;
  const opciones = cliente && cliente.options;
  const hosts = opciones && opciones.hosts;
  if (soloPruebas !== true || !db || typeof db.collection !== "function" ||
      !/^test_pastillas_[a-f0-9]{32}$/.test(db.databaseName || "") ||
      !cliente || !session || session.client !== cliente || !opciones || !opciones.directConnection ||
      !Array.isArray(hosts) || hosts.length !== 1 || !hosts[0] || hosts[0].host !== "127.0.0.1" ||
      typeof leerCatalogo !== "function" || typeof verificarAislamiento !== "function") {
    throw new ErrorSeguro("Se requiere un entorno de pruebas aislado y verificación operacional.");
  }
  const productos = db.collection("productos");
  const movimientos = db.collection("movimientos");
  const auditorias = db.collection("pastillas_aplicacion_auditoria");
  return ejecutarMotorAislado({
    session, bytesInforme, hashAprobado, bytesPlan, hashPlan, fecha,
    almacen: {
      async comprobarAislamiento(s) {
        if (await verificarAislamiento(db, s) !== true) {
          throw new ErrorSeguro("No se garantizó el aislamiento de prueba.");
        }
      },
      leerProductos: s => productos.find({}, { session: s }).sort({ _id: 1 }).toArray(),
      leerCatalogo: s => leerCatalogo(db, s),
      comprobarCobertura: s => typeof verificarCobertura === "function" ? verificarCobertura(db, s) : false,
      leerMovimientos: s => movimientos.find({}, { session: s }).sort({ _id: 1 }).toArray(),
      leerAuditoria: (hash, s) => auditorias.findOne({ _id: hash }, { session: s }),
      insertarAuditoria: (audit, s) => auditorias.insertOne({ _id: audit.planSha256, ...audit }, { session: s }),
      async reemplazarProducto(antes, despues, s) {
        const resultado = await productos.replaceOne({ _id: antes._id }, despues, { session: s });
        return resultado.matchedCount;
      },
      async reemplazarMovimiento(antes, despues, s) {
        const resultado = await movimientos.replaceOne({ _id: antes._id }, despues, { session: s });
        return resultado.matchedCount;
      },
    },
  });
}

function aplicar() {
  throw new ErrorSeguro("Aplicación bloqueada: faltan controles de respaldo, cobertura de referencias y validación para producción.");
}

module.exports = { hashArchivo, verificarInforme, seleccionarCambios, construirActualizacion,
  inspeccionarEnTransaccion, crearPlan, crearPlanFusion, verificarPlan, ejecutarEnReplicaAislada, aplicar };
