const express = require("express");
const controller = require("../controllers/auth");
const asyncHandler = require("../utils/async-handler");
const requireJsonObject = require("../middleware/require-json-object");

const router = express.Router();

router.post("/login", requireJsonObject, asyncHandler(controller.iniciarSesion));

module.exports = router;
