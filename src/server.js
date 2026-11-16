const app = require('./app');
const { getDatabase } = require('./database/connection');

const PORT = process.env.PORT || 3000;

try {
  // Inicializa a conexão com o banco de dados
  getDatabase();
  console.log('Conexão com SQLite estabelecida com sucesso.');

  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Verificação de integridade disponível em http://localhost:${PORT}/health`);
  });
} catch (error) {
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
}
