const { Router } = require('express');
const healthRoutes = require('./healthRoutes');
const quartoRoutes = require('./quartoRoutes');

const router = Router();

router.use('/', healthRoutes);
router.use('/quartos', quartoRoutes);

module.exports = router;
