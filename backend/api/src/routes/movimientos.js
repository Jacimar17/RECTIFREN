const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/movimientos");

const router = express.Router();

router.get("/", auth, controller.listar);

module.exports = router;
