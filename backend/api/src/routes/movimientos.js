const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/movimientos");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", auth, asyncHandler(controller.listar));

module.exports = router;
