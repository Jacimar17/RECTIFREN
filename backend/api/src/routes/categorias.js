const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/categorias");

const router = express.Router();

router.get("/", auth, controller.listar);
router.get("/marcas", auth, controller.marcas);
router.post("/", auth, controller.crear);
router.post("/asignar", auth, controller.asignar);
router.put("/:id", auth, controller.renombrar);

module.exports = router;

