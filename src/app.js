const express = require('express');
const routes = require('./routes');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas da aplicação
app.use(routes);

// Tratamento de rotas não encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Rota não encontrada'
  });
});

// Middleware global de tratamento de erros (500)
app.use((err, req, res, next) => {
  console.error('Erro interno:', err);
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
