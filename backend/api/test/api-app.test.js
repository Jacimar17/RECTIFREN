const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crearApp = require("../src/app");
const errorHandler = require("../src/middleware/error-handler");
const httpError = require("../src/utils/http-error");

let server;
let baseUrl;

test.before(async () => {
  server = crearApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function request(path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : {},
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("mantiene la respuesta de salud existente y expone /health", async () => {
  const root = await request("/");
  const health = await request("/health");
  const expected = { ok: true, app: "RECTIFREN API", version: "1.0.0" };

  assert.equal(root.status, 200);
  assert.deepEqual(root.body, expected);
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, expected);
});

test("mantiene protegidas las rutas administrativas", async () => {
  const response = await request("/api/productos");

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { ok: false, error: "Sesión requerida." });
});

test("rechaza el login cuando el cuerpo JSON no es un objeto", async () => {
  const response = await request("/api/auth/login", { method: "POST", body: [] });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    ok: false,
    error: "El cuerpo de la solicitud debe ser un objeto JSON.",
  });
});

test("mantiene el formato de errores 404", async () => {
  const response = await request("/ruta-inexistente");

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { ok: false, error: "Ruta no encontrada." });
});

test("oculta detalles inesperados y conserva errores operativos", () => {
  function responder() {
    return {
      status(status) {
        this.statusCode = status;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
  }

  const internalResponse = responder();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    errorHandler(new Error("database credentials"), {}, internalResponse, assert.fail);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(internalResponse.statusCode, 500);
  assert.deepEqual(internalResponse.body, { ok: false, error: "Error interno." });

  const validationResponse = responder();
  errorHandler(httpError(409, "El recurso ya existe."), {}, validationResponse, assert.fail);
  assert.equal(validationResponse.statusCode, 409);
  assert.deepEqual(validationResponse.body, { ok: false, error: "El recurso ya existe." });
});
