const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/proveedores");

const router = express.Router();

router.post("/detalle", auth, controller.buscarDetalle);
router.get("/litton/vehiculos", auth, controller.vehiculosLitton);
router.get("/litton/buscar-vehiculo", auth, controller.buscarPorVehiculo);
router.post("/", auth, controller.buscar);

module.exports = router;
