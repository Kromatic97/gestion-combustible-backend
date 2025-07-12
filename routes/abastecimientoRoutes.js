const express = require('express');
const router = express.Router();
const abastecimientoController = require('../controllers/abastecimientoController');

router.post('/', abastecimientoController.registrarAbastecimiento);
router.get('/stock', controller.obtenerStockActual); // 👈 agregamos esta línea

module.exports = router;
