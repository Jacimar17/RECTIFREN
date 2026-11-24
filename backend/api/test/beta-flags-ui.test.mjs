import test from "node:test";
import assert from "node:assert/strict";
import { bindBetaModal } from "../../../js/beta.js";
import { FAMILIAS_HABILITADAS, FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS } from "../../../js/config.js?v=20261124-persistedfamilies";

test("Beta opens local inventory details without requesting provider offers when they are disabled", async () => {
  assert.equal(FAMILIAS_HABILITADAS, false);
  assert.equal(FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS, true);
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const handlers = new Map();
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", innerHTML: "", style: {}, dataset: {},
      addEventListener(type, handler) { handlers.set(`${id}:${type}`, handler); },
      setAttribute() {},
      querySelector() { return null; },
    });
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: element,
    addEventListener() {},
  };
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (url.includes("/api/proveedores/detalle")) throw new Error("provider details must not be requested");
    const body = url.includes("/api/productos/search")
      ? { ok: true, data: [], familias: [] }
      : { ok: true, total: 1, data: [{ codigo: "PD/528", marca: "FRASLE" }], errores: [] };
    return { text: async () => JSON.stringify(body) };
  };
  try {
    element("betaSearch").value = "PD/528";
    bindBetaModal({ getIsAdmin: () => true, getAdminToken: () => "synthetic-token", adminLogout() {}, isBusy: () => false });
    await handlers.get("btnBetaSearch:click")();
    handlers.get("betaResults:click")({
      target: { closest: (selector) => selector === ".beta-result-card" ? { dataset: { resultIndex: "0" } } : null },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(element("betaResults").innerHTML, /En tu inventario/);
    assert.doesNotMatch(element("betaResults").innerHTML, /Dónde conseguirla|data-provider=/);
    assert.equal(urls.filter((url) => url.includes("/api/productos/search")).length, 1);
    assert.equal(urls.filter((url) => url.includes("/api/proveedores/detalle")).length, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});
