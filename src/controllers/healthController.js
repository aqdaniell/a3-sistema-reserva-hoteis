const { getDatabase } = require('../database/connection');

/**
 * Controller para verificação de saúde da aplicação e banco de dados.
 */
function getHealth(req, res) {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as alive').get();

    return res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: result && result.alive === 1 ? 'connected' : 'error'
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Falha ao verificar integridade do sistema',
      error: error.message
    });
  }
}

module.exports = {
  getHealth
};
