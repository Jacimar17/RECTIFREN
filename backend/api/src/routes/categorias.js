const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/categorias");
const asyncHandler = require("../utils/async-handler");
const requireJsonObject = require("../middleware/require-json-object");

const router = express.Router();

router.get("/", auth, asyncHandler(controller.listar));
router.get("/marcas", auth, asyncHandler(controller.marcas));
router.post("/", auth, requireJsonObject, asyncHandler(controller.crear));
router.post("/asignar", auth, requireJsonObject, asyncHandler(controller.asignar));
router.put("/:id", auth, requireJsonObject, asyncHandler(controller.renombrar));

module.exports = router;
