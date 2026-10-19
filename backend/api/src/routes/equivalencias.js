const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/equivalencias");

const router = express.Router();

router.get("/search", auth, controller.buscar);
router.get("/:id", auth, controller.obtener);
router.post("/:id/vincular", auth, controller.vincular);
router.delete("/:id/desvincular", auth, controller.desvincular);

module.exports = router;
