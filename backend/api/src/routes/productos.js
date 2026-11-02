const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/productos");
const asyncHandler = require("../utils/async-handler");
const requireJsonObject = require("../middleware/require-json-object");

const router = express.Router();

router.get("/catalogo", asyncHandler(controller.catalogoPublico));
router.get("/", auth, asyncHandler(controller.listar));
router.get("/search", auth, asyncHandler(controller.buscar));
router.post("/", auth, requireJsonObject, asyncHandler(controller.agregar));
router.put("/:id", auth, requireJsonObject, asyncHandler(controller.actualizar));
router.delete("/:id/variantes", auth, asyncHandler(controller.eliminarVariante));
router.delete("/:id", auth, asyncHandler(controller.eliminar));
router.patch("/:id/minimo", auth, requireJsonObject, asyncHandler(controller.actualizarStockMinimo));

module.exports = router;
