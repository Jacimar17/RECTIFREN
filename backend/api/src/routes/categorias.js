const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/categorias");

const router = express.Router();

router.get("/", auth, controller.listar);
router.post("/", auth, controller.crear);
router.put("/:id", auth, controller.renombrar);

module.exports = router;

