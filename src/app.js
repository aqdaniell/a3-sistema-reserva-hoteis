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

// Middleware global de tratamento de erros
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const hasValidStatus =
    err &&
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode <= 599;

  const statusCode = hasValidStatus ? err.statusCode : 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error('Erro interno:', err);
  }

  const message = isServerError
    ? 'Erro interno do servidor'
    : err.type === 'entity.parse.failed'
      ? 'JSON inválido no corpo da requisição'
      : (err && err.message) || 'Erro na requisição';

  res.status(statusCode).json({
    status: 'error',
    message
  });
});

module.exports = app;
