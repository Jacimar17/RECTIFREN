const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/stock");

const router = express.Router();

router.post("/in", auth, controller.aplicarEntrada);
router.post("/out", auth, controller.aplicarSalida);

module.exports = router;
