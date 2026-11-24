const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/equivalencias");
const asyncHandler = require("../utils/async-handler");
const requireJsonObject = require("../middleware/require-json-object");
const { familiasHabilitadas } = require("../utils/familias");

const router = express.Router();

router.use(auth, (req, res, next) => {
  if (!familiasHabilitadas()) {
    return res.status(503).json({ ok: false, error: "Las familias y equivalencias están deshabilitadas temporalmente." });
  }
  next();
});

router.get("/search", asyncHandler(controller.buscar));
router.get("/:id", asyncHandler(controller.obtener));
router.post("/:id/vincular", requireJsonObject, asyncHandler(controller.vincular));
router.delete("/:id/desvincular", requireJsonObject, asyncHandler(controller.desvincular));

module.exports = router;
