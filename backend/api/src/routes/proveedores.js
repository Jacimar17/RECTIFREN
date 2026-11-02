const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/proveedores");
const asyncHandler = require("../utils/async-handler");
const requireJsonObject = require("../middleware/require-json-object");

const router = express.Router();

router.post("/detalle", auth, requireJsonObject, asyncHandler(controller.buscarDetalle));
router.get("/litton/vehiculos", auth, asyncHandler(controller.vehiculosLitton));
router.get("/litton/buscar-vehiculo", auth, asyncHandler(controller.buscarPorVehiculo));
router.post("/", auth, requireJsonObject, asyncHandler(controller.buscar));

module.exports = router;
