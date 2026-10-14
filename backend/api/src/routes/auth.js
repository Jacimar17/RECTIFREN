const express = require("express");
const controller = require("../controllers/auth");

const router = express.Router();

router.post("/login", controller.iniciarSesion);

module.exports = router;
