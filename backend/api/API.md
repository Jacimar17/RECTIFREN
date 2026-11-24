# RECTIFREN API

HTTP API implemented by `src/routes` and registered centrally in `src/routes/index.js`.
The paths below are relative to `/api`, unless explicitly marked as the health check.
Existing paths are kept stable for the frontend.
The machine-readable contract is in [`openapi.yaml`](./openapi.yaml).

## Conventions

- Send and receive JSON (`Content-Type: application/json`).
- Protected endpoints require the Bearer token from `POST /api/auth/login`; it expires after six hours.
- Successful responses use JSON with `ok: true`. Depending on the endpoint, data is returned in `data`, `mensaje`, or additional top-level fields.
- Errors use `{ "ok": false, "error": "..." }`; validation, authentication, missing resources, and conflicts return appropriate HTTP statuses.
- Login is limited to 10 attempts per IP per 15 minutes.
- Provider endpoints are available only when `BETA_PROVEEDORES=true`; otherwise they return `404`.
- JSON request bodies must be objects.

The API uses a shared error handler for asynchronous route failures. Invalid JSON body shapes and malformed MongoDB identifiers return `400`; duplicate resources return `409`; unexpected server failures return `500` with a generic message.

## Health

| Method | Path | Auth | Description | Success |
|---|---|---|---|---|
| `GET` | `/` | No | API health/version | `{ "ok": true, "app": "RECTIFREN API", "version": "1.0.0" }` |
| `GET` | `/health` | No | Health check alias | `{ "ok": true, "app": "RECTIFREN API", "version": "1.0.0" }` |

## Authentication

| Method | Path | Auth | Request | Success |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | No | `{ "user": "…", "pass": "…" }` | `{ "ok": true, "token": "…", "expiresAt": 0 }` |

## Products

| Method | Path | Auth | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/productos/catalogo` | No | Query: `q` (max. 100), `marca` (max. 100), `page` (mín. 1), `limit` (1–100, default 20) | `{ "ok": true, ...catalog }` |
| `GET` | `/api/productos` | Yes | — | `{ "ok": true, "data": [...] }` |
| `GET` | `/api/productos/search` | Yes | Query: `q` | `{ "ok": true, "data": [...], ...searchMetadata }` |
| `POST` | `/api/productos` | Yes | Product fields: `codigo`, `marca`, optional `stock`, `descripcion`, `equivalencias`, `ubicacion`, `categoria`, `camposExtra`, `sumarStock` | `201`, `{ "ok": true, "data": product }` |
| `PUT` | `/api/productos/{id}` | Yes | Editable fields: `codigo`, `marca`, `marcaOrig`, `stock`, `ubicacion`, `ubicacionOrig`, `equivalencias`, optional `categoria` | `{ "ok": true, "data": product }` |
| `DELETE` | `/api/productos/{id}` | Yes | — | `{ "ok": true, "mensaje": "..." }` |
| `DELETE` | `/api/productos/{id}/variantes` | Yes | `{ "marca": "...", "ubicacion": "..." }` | `{ "ok": true, "mensaje": "..." }` |
| `PATCH` | `/api/productos/{id}/minimo` | Yes | `{ "stockMinimo": 0, "marca": "...", "ubicacion": "..." }` | `{ "ok": true, "data": ... }` |

Products explicitly marked as pending location can omit `ubicacion` in inventory responses. Their stock is included in `total` and, when present, in `SIN_UBICACION`, rather than in either known location. Updating the product with a valid `ubicacion` assigns it and clears the pending status.

### Brake-pad families

`FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS` defaults to enabled in the API; set it to `false` to disable it. The frontend has a separate flag of the same name in `js/config.js`. Family lookup reads the checked-in `litton-pastillas.json`, validates it and caches it for the process lifetime; restart or redeploy after updating it. `catalogoVersion` is `local-` followed by the normalized catalog SHA-256. It does not publish to MongoDB or query Litton live; if the file is missing or invalid, `/api/productos/search` keeps direct results and returns `familiasError` with a safe warning.

For products with a matching recorded brand, exact brand-prefixed catalog codes and exact TRW abbreviations are also recognized. This associates search results only; it does not confirm duplicates or merge products.

This flag does not enable `FAMILIAS_HABILITADAS`, manual equivalence routes, or external provider offers. Those remain disabled unless the original flag is explicitly enabled. When enabled, legacy local families remain available for explicitly categorized non-pad products within the same category; uncategorized products cannot safely be classified as non-pad. Provider detail requires both flags and `BETA_PROVEEDORES=true`, otherwise it returns `503` (or `404` when beta is disabled).

## Stock and movements

| Method | Path | Auth | Request | Success |
|---|---|---|---|---|
| `POST` | `/api/stock/in` | Yes | `{ "codigo": "...", "marca": "...", "ubicacion": "...", "cantidad": 1, "nota": "" }` | `{ "ok": true, ...movement }` |
| `POST` | `/api/stock/out` | Yes | `{ "codigo": "...", "marca": "...", "ubicacion": "...", "cantidad": 1, "nota": "" }` | `{ "ok": true, ...movement }` |
| `GET` | `/api/movimientos` | Yes | Query: `range` (`week` by default; `month` for 30 days) | `{ "ok": true, "data": [...], "total": 0, "range": "week" }` |

## Equivalences

| Method | Path | Auth | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/equivalencias/search` | Yes | Query: `q` | `{ "ok": true, "data": [...] }` |
| `GET` | `/api/equivalencias/{id}` | Yes | — | `{ "ok": true, "vinculados": [...], "textoLibre": [...], "equivalenciasCatalogo": [...] }` |
| `POST` | `/api/equivalencias/{id}/vincular` | Yes | `{ "equivalenteId": "..." }` or `{ "equivalenteTexto": "..." }` | `{ "ok": true, "mensaje": "..." }` |
| `DELETE` | `/api/equivalencias/{id}/desvincular` | Yes | `{ "equivalenteId": "..." }` or `{ "equivalenteTexto": "..." }` | `{ "ok": true, "mensaje": "..." }` |

## Categories

| Method | Path | Auth | Request | Success |
|---|---|---|---|---|
| `GET` | `/api/categorias` | Yes | — | `{ "ok": true, "data": [...] }` |
| `GET` | `/api/categorias/marcas` | Yes | — | `{ "ok": true, "data": [...] }` |
| `POST` | `/api/categorias` | Yes | `{ "nombre": "...", "descripcion": "", "camposExtra": [] }` | `201`, `{ "ok": true, "data": category }` |
| `POST` | `/api/categorias/asignar` | Yes | Filters: `marca` and/or `texto`; `categoria`; optional `soloSinCategoria`, `aplicar` | `{ "ok": true, "data": ...previewOrResult }` |
| `PUT` | `/api/categorias/{id}` | Yes | `{ "nombre": "..." }` | `{ "ok": true, "data": category }` |

## Providers (beta)

All provider endpoints require authentication and `BETA_PROVEEDORES=true`.

| Method | Path | Request | Success |
|---|---|---|---|
| `POST` | `/api/proveedores` | `{ "q": "..." }` | Search results with `ok`, `total`, `data`, and `errores` |
| `POST` | `/api/proveedores/detalle` | `{ "codigo": "..." }` | Provider/family details |
| `GET` | `/api/proveedores/litton/vehiculos` | — | `{ "ok": true, "data": [...] }` |
| `GET` | `/api/proveedores/litton/buscar-vehiculo` | Query: `marca`, `modelo` (máx. 100 caracteres), optional `page` (1–1000) | Litton vehicle candidates enriched with equivalences, configured supplier offers, and per-candidate provider errors |

Vehicle lookup uses only `marca` and `modelo`. When `FAMILIAS_HABILITADAS` is disabled, it returns Litton candidates without provider offers. When enabled, the response lists configured providers in `proveedores`; each returned candidate contains its Litton product data, `equivalencias`, an `ofertas` group keyed by provider ID, and `errores`. If a product detail or supplier lookup fails, the candidate remains in the response and reports the error instead of discarding other results.

Each offer has `proveedor`, `codigoProveedor`, `marca`, `descripcion`, `precio` (`importe` and `moneda`), `stock` (`estado` and optional numeric `cantidad`), `url`, `imagen`, and `codigoCoincidente`. Unknown stock is represented as `desconocido` with `cantidad: null`, not as zero.

## Local validation

Run the API test suite from `backend/api` with `npm test`. The app can be imported from `src/app.js` without connecting to MongoDB, which allows HTTP behavior to be tested independently from database startup.
