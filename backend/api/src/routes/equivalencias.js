const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/equivalencias");

const router = express.Router();

router.get("/search", controller.buscar);
router.get("/:id", controller.obtener);
router.post("/:id/vincular", auth, controller.vincular);
router.delete("/:id/desvincular", auth, controller.desvincular);

module.exports = router;
