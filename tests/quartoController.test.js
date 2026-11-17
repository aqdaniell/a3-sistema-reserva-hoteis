jest.mock('../src/services/quartoService', () => ({
  listar: jest.fn(),
  buscarPorId: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  excluir: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const quartoService = require('../src/services/quartoService');
const quartoController = require('../src/controllers/quartoController');
const AppError = require('../src/utils/AppError');

const quartoExemplo = () => ({
  id: 1,
  numero: 101,
  tipo: 'solteiro',
  status: 'disponivel',
  valor_diaria_centavos: 15000,
});

function criarResMock() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

/**
 * Monta o `src/app.js` real com rotas temporárias apontando para o controller
 * em teste, permitindo validar HTTP status, corpo real da resposta (incluindo 204)
 * e integração com o middleware global de erros via Supertest.
 */
function criarAppIntegradoComController() {
  let appIntegrado;

  jest.isolateModules(() => {
    jest.doMock('../src/services/quartoService', () => quartoService);
    const controller = require('../src/controllers/quartoController');

    const router = express.Router();
    router.get('/quartos', controller.listar);
    router.get('/quartos/:id', controller.buscarPorId);
    router.post('/quartos', controller.criar);
    router.put('/quartos/:id', controller.atualizar);
    router.delete('/quartos/:id', controller.excluir);

    jest.doMock('../src/routes', () => router);
    try {
      appIntegrado = require('../src/app');
    } finally {
      jest.dontMock('../src/routes');
      jest.dontMock('../src/services/quartoService');
    }
  });

  return appIntegrado;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('quartoController — testes unitários', () => {
  describe('listar', () => {
    it('chama quartoService.listar e responde 200 com a lista', () => {
      const lista = [quartoExemplo(), { ...quartoExemplo(), id: 2, numero: 102 }];
      quartoService.listar.mockReturnValue(lista);
      const res = criarResMock();
      const next = jest.fn();

      quartoController.listar({}, res, next);

      expect(quartoService.listar).toHaveBeenCalledTimes(1);
      expect(quartoService.listar).toHaveBeenCalledWith();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(lista);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erro de quartoService.listar para next(error)', () => {
      const erro = new AppError('Erro interno do servidor', 500);
      quartoService.listar.mockImplementation(() => {
        throw erro;
      });
      const res = criarResMock();
      const next = jest.fn();

      quartoController.listar({}, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(erro);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('buscarPorId', () => {
    it('envia req.params.id ao serviço e responde 200 com o quarto', () => {
      const quarto = quartoExemplo();
      quartoService.buscarPorId.mockReturnValue(quarto);
      const req = { params: { id: '1' } };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.buscarPorId(req, res, next);

      expect(quartoService.buscarPorId).toHaveBeenCalledTimes(1);
      expect(quartoService.buscarPorId).toHaveBeenCalledWith('1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(quarto);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erro de quartoService.buscarPorId para next(error)', () => {
      const erro = new AppError('Quarto não encontrado', 404);
      quartoService.buscarPorId.mockImplementation(() => {
        throw erro;
      });
      const req = { params: { id: '999' } };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.buscarPorId(req, res, next);

      expect(quartoService.buscarPorId).toHaveBeenCalledWith('999');
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(erro);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('criar', () => {
    it('envia req.body ao serviço e responde 201 com o quarto criado', () => {
      const payload = {
        numero: 101,
        tipo: 'solteiro',
        status: 'disponivel',
        valor_diaria_centavos: 15000,
      };
      const criado = quartoExemplo();
      quartoService.criar.mockReturnValue(criado);
      const req = { body: payload };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.criar(req, res, next);

      expect(quartoService.criar).toHaveBeenCalledTimes(1);
      expect(quartoService.criar).toHaveBeenCalledWith(payload);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(criado);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erro de validação ou conflito de quartoService.criar para next(error)', () => {
      const erro = new AppError('Já existe um quarto cadastrado com este número', 409);
      quartoService.criar.mockImplementation(() => {
        throw erro;
      });
      const req = { body: { numero: 101 } };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.criar(req, res, next);

      expect(quartoService.criar).toHaveBeenCalledWith(req.body);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(erro);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('atualizar', () => {
    it('envia req.params.id e req.body ao serviço e responde 200 com o quarto atualizado', () => {
      const payload = {
        numero: 102,
        tipo: 'casal',
        status: 'manutencao',
        valor_diaria_centavos: 22000,
      };
      const atualizado = { id: 1, ...payload };
      quartoService.atualizar.mockReturnValue(atualizado);
      const req = { params: { id: '1' }, body: payload };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.atualizar(req, res, next);

      expect(quartoService.atualizar).toHaveBeenCalledTimes(1);
      expect(quartoService.atualizar).toHaveBeenCalledWith('1', payload);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(atualizado);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erro de quartoService.atualizar para next(error)', () => {
      const erro = new AppError('Quarto não encontrado', 404);
      quartoService.atualizar.mockImplementation(() => {
        throw erro;
      });
      const req = { params: { id: '999' }, body: {} };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.atualizar(req, res, next);

      expect(quartoService.atualizar).toHaveBeenCalledWith('999', {});
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(erro);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('excluir', () => {
    it('envia req.params.id ao serviço e responde 204 sem corpo', () => {
      quartoService.excluir.mockReturnValue(undefined);
      const req = { params: { id: '1' } };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.excluir(req, res, next);

      expect(quartoService.excluir).toHaveBeenCalledTimes(1);
      expect(quartoService.excluir).toHaveBeenCalledWith('1');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalledTimes(1);
      expect(res.send).toHaveBeenCalledWith();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erro 409 de quartoService.excluir para next(error)', () => {
      const erro = new AppError('Não é possível excluir o quarto pois existem reservas vinculadas', 409);
      quartoService.excluir.mockImplementation(() => {
        throw erro;
      });
      const req = { params: { id: '1' } };
      const res = criarResMock();
      const next = jest.fn();

      quartoController.excluir(req, res, next);

      expect(quartoService.excluir).toHaveBeenCalledWith('1');
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(erro);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });
});

describe('quartoController — integração HTTP com o middleware global de src/app.js', () => {
  const app = criarAppIntegradoComController();
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('GET /quartos retorna 200 e JSON da lista', async () => {
    const lista = [quartoExemplo()];
    quartoService.listar.mockReturnValue(lista);

    const response = await request(app).get('/quartos');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(lista);
  });

  it('GET /quartos/:id retorna 200 e o quarto encontrado', async () => {
    const quarto = quartoExemplo();
    quartoService.buscarPorId.mockReturnValue(quarto);

    const response = await request(app).get('/quartos/1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(quarto);
    expect(quartoService.buscarPorId).toHaveBeenCalledWith('1');
  });

  it('POST /quartos retorna 201 e o quarto criado', async () => {
    const payload = {
      numero: 101,
      tipo: 'solteiro',
      status: 'disponivel',
      valor_diaria_centavos: 15000,
    };
    quartoService.criar.mockReturnValue({ id: 1, ...payload });

    const response = await request(app).post('/quartos').send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 1, ...payload });
    expect(quartoService.criar).toHaveBeenCalledWith(payload);
  });

  it('PUT /quartos/:id retorna 200 e o quarto atualizado', async () => {
    const payload = {
      numero: 202,
      tipo: 'suite',
      status: 'manutencao',
      valor_diaria_centavos: 45000,
    };
    quartoService.atualizar.mockReturnValue({ id: 7, ...payload });

    const response = await request(app).put('/quartos/7').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 7, ...payload });
    expect(quartoService.atualizar).toHaveBeenCalledWith('7', payload);
  });

  it('DELETE /quartos/:id retorna 204 sem corpo nem Content-Type', async () => {
    quartoService.excluir.mockReturnValue(undefined);

    const response = await request(app).delete('/quartos/1');

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(response.headers['content-type']).toBeUndefined();
    expect(quartoService.excluir).toHaveBeenCalledWith('1');
  });

  it.each([
    ['400', new AppError('O campo "numero" é obrigatório', 400), 400, 'O campo "numero" é obrigatório'],
    ['404', new AppError('Quarto não encontrado', 404), 404, 'Quarto não encontrado'],
    ['409', new AppError('Quarto possui reservas vinculadas', 409), 409, 'Quarto possui reservas vinculadas'],
  ])('encaminha AppError %s ao middleware global mantendo o formato JSON padrão', async (_label, erro, status, msg) => {
    quartoService.buscarPorId.mockImplementation(() => {
      throw erro;
    });

    const response = await request(app).get('/quartos/1');

    expect(response.status).toBe(status);
    expect(response.body).toEqual({
      status: 'error',
      message: msg,
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('encaminha erro inesperado ao middleware global retornando 500 sem expor mensagem interna', async () => {
    quartoService.listar.mockImplementation(() => {
      throw new Error('DETALHE_INTERNO_SENSIVEL_SQLITE');
    });

    const response = await request(app).get('/quartos');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Erro interno do servidor',
    });
    expect(JSON.stringify(response.body)).not.toContain('DETALHE_INTERNO_SENSIVEL_SQLITE');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
