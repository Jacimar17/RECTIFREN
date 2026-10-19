const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/productos");

const router = express.Router();

router.get("/catalogo", controller.catalogoPublico);
router.get("/", controller.listar);
router.get("/search", controller.buscar);
router.post("/", auth, controller.agregar);
router.put("/:id", auth, controller.actualizar);
router.delete("/:id/variantes", auth, controller.eliminarVariante);
router.delete("/:id", auth, controller.eliminar);
router.patch("/:id/minimo", auth, controller.actualizarStockMinimo);

module.exports = router;
