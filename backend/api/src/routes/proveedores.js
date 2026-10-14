const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/proveedores");

const router = express.Router();

router.post("/detalle", auth, controller.buscarDetalle);
router.post("/", auth, controller.buscar);

module.exports = router;
