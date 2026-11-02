const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/stock");
const asyncHandler = require("../utils/async-handler");
const requireJsonObject = require("../middleware/require-json-object");

const router = express.Router();

router.post("/in", auth, requireJsonObject, asyncHandler(controller.aplicarEntrada));
router.post("/out", auth, requireJsonObject, asyncHandler(controller.aplicarSalida));

module.exports = router;
