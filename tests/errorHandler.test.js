const express = require('express');
const request = require('supertest');
const realApp = require('../src/app');
const { closeDatabase } = require('../src/database/connection');
const AppError = require('../src/utils/AppError');

/**
 * Carrega o módulo real `src/app.js` em isolamento, injetando rotas de teste
 * para acionar o middleware global de erros via Supertest sem expor rotas
 * fictícias na aplicação de produção.
 */
function criarAppComRotasDeTeste(registrarRotas) {
  let appIsolado;

  jest.isolateModules(() => {
    const router = express.Router();
    registrarRotas(router);
    jest.doMock('../src/routes', () => router);
    try {
      appIsolado = require('../src/app');
    } finally {
      jest.dontMock('../src/routes');
    }
  });

  return appIsolado;
}

describe('AppError', () => {
  it('define message, name e statusCode padrão 400', () => {
    const erro = new AppError('Campo inválido');
    expect(erro).toBeInstanceOf(Error);
    expect(erro).toBeInstanceOf(AppError);
    expect(erro.name).toBe('AppError');
    expect(erro.message).toBe('Campo inválido');
    expect(erro.statusCode).toBe(400);
  });

  it.each([400, 404, 409, 500, 599])('aceita statusCode válido (%s)', (statusCode) => {
    const erro = new AppError('Erro operacional', statusCode);
    expect(erro.statusCode).toBe(statusCode);
  });

  it.each([200, 399, 600])('rejeita statusCode fora do intervalo 400-599 (%s) com RangeError', (statusCode) => {
    expect(() => new AppError('Status inválido', statusCode)).toThrow(RangeError);
    expect(() => new AppError('Status inválido', statusCode)).toThrow('statusCode deve estar entre 400 e 599');
  });

  it.each(['400', NaN, 400.5, null])('rejeita statusCode não inteiro (%p) com TypeError', (statusCode) => {
    expect(() => new AppError('Status inválido', statusCode)).toThrow(TypeError);
    expect(() => new AppError('Status inválido', statusCode)).toThrow(
      'statusCode deve ser um número inteiro entre 400 e 599'
    );
  });
});

describe('Infraestrutura de erros HTTP em src/app.js', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    closeDatabase();
  });

  describe('Comportamento padrão da aplicação real', () => {
    it('preserva o endpoint GET /health retornando 200', async () => {
      const response = await request(realApp).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('database', 'connected');
    });

    it('não expõe error.message quando GET /health falha internamente', async () => {
      let appComFalhaNoBanco;
      jest.isolateModules(() => {
        jest.doMock('../src/database/connection', () => ({
          getDatabase: () => {
            throw new Error('SQLITE_CANTOPEN: caminho secreto do banco');
          }
        }));
        try {
          appComFalhaNoBanco = require('../src/app');
        } finally {
          jest.dontMock('../src/database/connection');
        }
      });

      const response = await request(appComFalhaNoBanco).get('/health');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Falha ao verificar integridade do sistema'
      });
      expect(response.body).not.toHaveProperty('error');
      expect(JSON.stringify(response.body)).not.toContain('SQLITE_CANTOPEN');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('retorna 404 com formato padrão para rotas inexistentes', async () => {
      const response = await request(realApp).get('/nao-existe');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Rota não encontrada'
      });
    });

    it('retorna 400 ao receber JSON malformado no corpo da requisição', async () => {
      const response = await request(realApp)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('{ "numero": ');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        status: 'error',
        message: 'JSON inválido no corpo da requisição'
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Middleware global de erros', () => {
    const appComErros = criarAppComRotasDeTeste((router) => {
      router.get('/erro-400', (req, res, next) => {
        next(new AppError('Dados obrigatórios ausentes', 400));
      });

      router.get('/erro-mensagem-vazia', (req, res, next) => {
        next(new AppError('', 400));
      });

      router.get('/erro-404', (req, res, next) => {
        next(new AppError('Quarto não encontrado', 404));
      });

      router.get('/erro-409', (req, res, next) => {
        next(new AppError('Quarto possui reservas vinculadas', 409));
      });

      router.get('/erro-plain-409', (req, res, next) => {
        const err = new Error('Número de quarto já cadastrado');
        err.statusCode = 409;
        next(err);
      });

      router.get('/erro-async-409', async () => {
        throw new AppError('Conflito assíncrono', 409);
      });

      router.get('/erro-async-500', async () => {
        throw new Error('ERRO_SECRETO_ASYNC_DB: falha na consulta');
      });

      router.get('/erro-500-inesperado', () => {
        throw new Error('SQLITE_ERROR: detalhe interno sensível');
      });

      router.get('/erro-500-explicito', (req, res, next) => {
        const err = new Error('Senha ou caminho interno do servidor');
        err.statusCode = 500;
        next(err);
      });

      router.get('/erro-status-invalido', (req, res, next) => {
        const err = new Error('Falha com status fora do padrão');
        err.statusCode = 200;
        next(err);
      });

      router.get('/erro-status-nao-numerico', (req, res, next) => {
        const err = new Error('Falha com status em texto');
        err.statusCode = '400';
        next(err);
      });

      router.get('/erro-headers-sent', (req, res, next) => {
        res.status(200).send('ok');
        next(new Error('Falha após envio da resposta'));
      });
    });

    it('retorna HTTP 400 para erro operacional Bad Request', async () => {
      const response = await request(appComErros).get('/erro-400');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Dados obrigatórios ausentes'
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('usa mensagem fallback quando a mensagem de erro 4xx está vazia', async () => {
      const response = await request(appComErros).get('/erro-mensagem-vazia');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Erro na requisição'
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('retorna HTTP 404 quando lançado erro com statusCode 404', async () => {
      const response = await request(appComErros).get('/erro-404');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Quarto não encontrado'
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('retorna HTTP 409 Conflict via AppError', async () => {
      const response = await request(appComErros).get('/erro-409');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Quarto possui reservas vinculadas'
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('reconhece err.statusCode em instância comum de Error', async () => {
      const response = await request(appComErros).get('/erro-plain-409');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Número de quarto já cadastrado'
      });
    });

    it('captura rejeições assíncronas operacionais automaticamente no Express 5', async () => {
      const response = await request(appComErros).get('/erro-async-409');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Conflito assíncrono'
      });
    });

    it('captura erro inesperado em rota assíncrona retornando HTTP 500 sem vazar detalhes', async () => {
      const response = await request(appComErros).get('/erro-async-500');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Erro interno do servidor'
      });
      expect(response.body).not.toHaveProperty('error');
      expect(response.body).not.toHaveProperty('stack');
      expect(JSON.stringify(response.body)).not.toContain('ERRO_SECRETO_ASYNC_DB');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('retorna HTTP 500 sem expor detalhes internos em erro inesperado', async () => {
      const response = await request(appComErros).get('/erro-500-inesperado');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Erro interno do servidor'
      });
      expect(response.body).not.toHaveProperty('error');
      expect(response.body).not.toHaveProperty('stack');
      expect(JSON.stringify(response.body)).not.toContain('SQLITE_ERROR');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('não expõe mensagem interna mesmo quando statusCode 500 é definido explicitamente', async () => {
      const response = await request(appComErros).get('/erro-500-explicito');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Erro interno do servidor'
      });
      expect(JSON.stringify(response.body)).not.toContain('Senha');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it.each([
      '/erro-status-invalido',
      '/erro-status-nao-numerico'
    ])('usa HTTP 500 como padrão quando statusCode é inválido (%s)', async (rota) => {
      const response = await request(appComErros).get(rota);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Erro interno do servidor'
      });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('delega ao Express e não tenta reescrever resposta quando res.headersSent já é true', async () => {
      const response = await request(appComErros).get('/erro-headers-sent');

      expect(response.status).toBe(200);
      expect(response.text).toBe('ok');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
