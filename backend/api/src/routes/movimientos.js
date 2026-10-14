const express = require("express");
const controller = require("../controllers/movimientos");

const router = express.Router();

router.get("/", controller.listar);

module.exports = router;
