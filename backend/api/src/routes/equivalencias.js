const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/equivalencias");
const asyncHandler = require("../utils/async-handler");
const requireJsonObject = require("../middleware/require-json-object");

const router = express.Router();

router.get("/search", auth, asyncHandler(controller.buscar));
router.get("/:id", auth, asyncHandler(controller.obtener));
router.post("/:id/vincular", auth, requireJsonObject, asyncHandler(controller.vincular));
router.delete("/:id/desvincular", auth, requireJsonObject, asyncHandler(controller.desvincular));

module.exports = router;
