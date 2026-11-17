// Proteção: os testes ponta a ponta executam migrations em memória (NODE_ENV=test).
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    `tests/quartoRoutes.test.js só pode ser executado com NODE_ENV=test (atual: ${process.env.NODE_ENV}).`
  );
}

const request = require('supertest');
const realApp = require('../src/app');
const { getDatabase, closeDatabase } = require('../src/database/connection');
const { runMigrations } = require('../src/database/migrate');
const AppError = require('../src/utils/AppError');

/**
 * Carrega `src/app.js` -> `src/routes` -> `src/routes/quartoRoutes.js` em isolamento
 * com `quartoController` mockado, validando o roteamento HTTP e o contrato com o Controller.
 * Também expõe `closeIsolatedDatabase` da instância isolada de `connection.js` para
 * evitar que uma eventual abertura de `:memory:` via `/health` fique aberta.
 */
function criarAppComControllerMockado() {
  const controllerMock = {
    listar: jest.fn((req, res) => res.status(200).json([])),
    buscarPorId: jest.fn((req, res) => res.status(200).json({ id: Number(req.params.id) })),
    criar: jest.fn((req, res) => res.status(201).json({ id: 1, ...req.body })),
    atualizar: jest.fn((req, res) => res.status(200).json({ id: Number(req.params.id), ...req.body })),
    excluir: jest.fn((req, res) => res.status(204).send()),
  };

  let appIsolado;
  let isolatedConnection;

  jest.isolateModules(() => {
    jest.doMock('../src/controllers/quartoController', () => controllerMock);
    try {
      appIsolado = require('../src/app');
      isolatedConnection = require('../src/database/connection');
    } finally {
      jest.dontMock('../src/controllers/quartoController');
    }
  });

  return {
    app: appIsolado,
    controllerMock,
    closeIsolatedDatabase: () => isolatedConnection.closeDatabase(),
  };
}

describe('quartoRoutes — roteamento HTTP e integração com quartoController', () => {
  const { app, controllerMock, closeIsolatedDatabase } = criarAppComControllerMockado();
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    closeIsolatedDatabase();
  });

  it('GET /quartos aciona quartoController.listar e retorna 200', async () => {
    const quartos = [{ id: 1, numero: 101 }];
    controllerMock.listar.mockImplementationOnce((req, res) => res.status(200).json(quartos));

    const response = await request(app).get('/quartos');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(quartos);
    expect(controllerMock.listar).toHaveBeenCalledTimes(1);
    expect(controllerMock.buscarPorId).not.toHaveBeenCalled();
  });

  it('GET /quartos/:id aciona quartoController.buscarPorId com req.params.id e retorna 200', async () => {
    const quarto = { id: 15, numero: 302 };
    controllerMock.buscarPorId.mockImplementationOnce((req, res) => {
      expect(req.params.id).toBe('15');
      return res.status(200).json(quarto);
    });

    const response = await request(app).get('/quartos/15');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(quarto);
    expect(controllerMock.buscarPorId).toHaveBeenCalledTimes(1);
  });

  it('POST /quartos aciona quartoController.criar com req.body e retorna 201', async () => {
    const payload = {
      numero: 101,
      tipo: 'solteiro',
      status: 'disponivel',
      valor_diaria_centavos: 15000,
    };
    controllerMock.criar.mockImplementationOnce((req, res) => {
      expect(req.body).toEqual(payload);
      return res.status(201).json({ id: 1, ...req.body });
    });

    const response = await request(app).post('/quartos').send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 1, ...payload });
    expect(controllerMock.criar).toHaveBeenCalledTimes(1);
  });

  it('PUT /quartos/:id aciona quartoController.atualizar com id e body e retorna 200', async () => {
    const payload = {
      numero: 202,
      tipo: 'casal',
      status: 'manutencao',
      valor_diaria_centavos: 25000,
    };
    controllerMock.atualizar.mockImplementationOnce((req, res) => {
      expect(req.params.id).toBe('7');
      expect(req.body).toEqual(payload);
      return res.status(200).json({ id: 7, ...req.body });
    });

    const response = await request(app).put('/quartos/7').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 7, ...payload });
    expect(controllerMock.atualizar).toHaveBeenCalledTimes(1);
  });

  it('DELETE /quartos/:id aciona quartoController.excluir com req.params.id e retorna 204 sem corpo', async () => {
    controllerMock.excluir.mockImplementationOnce((req, res) => {
      expect(req.params.id).toBe('9');
      return res.status(204).send();
    });

    const response = await request(app).delete('/quartos/9');

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(response.headers['content-type']).toBeUndefined();
    expect(controllerMock.excluir).toHaveBeenCalledTimes(1);
  });

  it('não expõe PATCH /quartos/:id (retorna 404 conforme decisão de arquitetura)', async () => {
    const response = await request(app).patch('/quartos/1').send({ status: 'manutencao' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Rota não encontrada',
    });
    expect(controllerMock.atualizar).not.toHaveBeenCalled();
  });

  it('preserva a rota GET /health funcionando', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
  });

  it.each([
    ['GET /quartos (500 inesperado)', 'get', '/quartos', 'listar', new Error('SQLITE_ERROR: detalhe secreto'), 500, 'Erro interno do servidor'],
    ['GET /quartos/:id (404)', 'get', '/quartos/99', 'buscarPorId', new AppError('Quarto não encontrado', 404), 404, 'Quarto não encontrado'],
    ['POST /quartos (400)', 'post', '/quartos', 'criar', new AppError('Dados inválidos', 400), 400, 'Dados inválidos'],
    ['PUT /quartos/:id (409)', 'put', '/quartos/1', 'atualizar', new AppError('Número duplicado', 409), 409, 'Número duplicado'],
    ['DELETE /quartos/:id (409)', 'delete', '/quartos/1', 'excluir', new AppError('Quarto possui reservas vinculadas', 409), 409, 'Quarto possui reservas vinculadas'],
  ])('encaminha erros de %s ao middleware global de src/app.js', async (_desc, method, path, handler, erro, status, message) => {
    controllerMock[handler].mockImplementationOnce((req, res, next) => next(erro));

    const response = await request(app)[method](path);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ status: 'error', message });
  });
});

describe('Quartos API — integração ponta a ponta com banco em memória', () => {
  const payloadBase = (overrides = {}) => ({
    numero: 101,
    tipo: 'solteiro',
    status: 'disponivel',
    valor_diaria_centavos: 15000,
    ...overrides,
  });

  beforeEach(() => {
    closeDatabase();
    runMigrations(getDatabase());
  });

  afterAll(() => {
    closeDatabase();
  });

  it('executa o fluxo CRUD completo pelos cinco endpoints (POST, GET, GET/:id, PUT, DELETE)', async () => {
    const criado = await request(realApp)
      .post('/quartos')
      .send(payloadBase({ tipo: '  solteiro  ' }));

    expect(criado.status).toBe(201);
    expect(criado.body).toEqual({
      id: 1,
      numero: 101,
      tipo: 'solteiro',
      status: 'disponivel',
      valor_diaria_centavos: 15000,
    });

    const lista = await request(realApp).get('/quartos');
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([criado.body]);

    const detalhe = await request(realApp).get('/quartos/1');
    expect(detalhe.status).toBe(200);
    expect(detalhe.body).toEqual(criado.body);

    const payloadAtualizacao = payloadBase({
      numero: 105,
      tipo: 'casal',
      status: 'manutencao',
      valor_diaria_centavos: 22000,
    });
    const atualizado = await request(realApp).put('/quartos/1').send(payloadAtualizacao);
    expect(atualizado.status).toBe(200);
    expect(atualizado.body).toEqual({ id: 1, ...payloadAtualizacao });

    const excluido = await request(realApp).delete('/quartos/1');
    expect(excluido.status).toBe(204);
    expect(excluido.text).toBe('');

    const aposExclusao = await request(realApp).get('/quartos');
    expect(aposExclusao.status).toBe(200);
    expect(aposExclusao.body).toEqual([]);
  });

  it('GET /quartos retorna os quartos ordenados pelo número', async () => {
    await request(realApp).post('/quartos').send(payloadBase({ numero: 305, tipo: 'suite' }));
    await request(realApp).post('/quartos').send(payloadBase({ numero: 101, tipo: 'solteiro' }));
    await request(realApp).post('/quartos').send(payloadBase({ numero: 202, tipo: 'casal', status: 'manutencao' }));

    const resposta = await request(realApp).get('/quartos');

    expect(resposta.status).toBe(200);
    expect(resposta.body.map((q) => q.numero)).toEqual([101, 202, 305]);
  });

  it('POST /quartos com número de quarto duplicado retorna 409', async () => {
    await request(realApp).post('/quartos').send(payloadBase({ numero: 101 }));

    const resposta = await request(realApp).post('/quartos').send(payloadBase({ numero: 101, tipo: 'casal' }));

    expect(resposta.status).toBe(409);
    expect(resposta.body).toEqual({
      status: 'error',
      message: 'Já existe um quarto cadastrado com este número',
    });

    const lista = await request(realApp).get('/quartos');
    expect(lista.body).toHaveLength(1);
  });

  it('PUT /quartos/:id mantendo o próprio número retorna 200', async () => {
    const criado = await request(realApp).post('/quartos').send(payloadBase({ numero: 101 }));

    const payload = payloadBase({
      numero: 101,
      tipo: 'casal',
      status: 'manutencao',
      valor_diaria_centavos: 24000,
    });
    const resposta = await request(realApp).put(`/quartos/${criado.body.id}`).send(payload);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ id: criado.body.id, ...payload });
  });

  it('PUT /quartos/:id tentando utilizar o número de outro quarto retorna 409', async () => {
    await request(realApp).post('/quartos').send(payloadBase({ numero: 101 }));
    const segundo = await request(realApp).post('/quartos').send(payloadBase({ numero: 102, tipo: 'casal' }));

    const resposta = await request(realApp)
      .put(`/quartos/${segundo.body.id}`)
      .send(payloadBase({ numero: 101, tipo: 'suite' }));

    expect(resposta.status).toBe(409);
    expect(resposta.body).toEqual({
      status: 'error',
      message: 'Já existe um quarto cadastrado com este número',
    });

    const conferencia = await request(realApp).get(`/quartos/${segundo.body.id}`);
    expect(conferencia.status).toBe(200);
    expect(conferencia.body.numero).toBe(102);
  });

  it('GET /quartos/:id de quarto inexistente retorna 404', async () => {
    const resposta = await request(realApp).get('/quartos/999');

    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({
      status: 'error',
      message: 'Quarto não encontrado',
    });
  });

  it('PUT /quartos/:id de quarto inexistente retorna 404', async () => {
    const resposta = await request(realApp).put('/quartos/999').send(payloadBase());

    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({
      status: 'error',
      message: 'Quarto não encontrado',
    });
  });

  it('DELETE /quartos/:id de quarto inexistente retorna 404', async () => {
    const resposta = await request(realApp).delete('/quartos/999');

    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({
      status: 'error',
      message: 'Quarto não encontrado',
    });
  });

  it('retorna 409 ao tentar excluir quarto com reserva vinculada', async () => {
    const criado = await request(realApp).post('/quartos').send(
      payloadBase({ numero: 201, tipo: 'suite', valor_diaria_centavos: 40000 })
    );

    const db = getDatabase();
    const clienteId = db
      .prepare('INSERT INTO clientes (nome, cpf) VALUES (?, ?)')
      .run('Maria', '11111111111').lastInsertRowid;
    db.prepare(
      `INSERT INTO reservas (quarto_id, cliente_id, checkin, checkout, valor_total_centavos, status)
       VALUES (?, ?, '2026-12-01', '2026-12-03', 80000, 'cancelada')`
    ).run(criado.body.id, clienteId);

    const resposta = await request(realApp).delete(`/quartos/${criado.body.id}`);
    expect(resposta.status).toBe(409);
    expect(resposta.body.status).toBe('error');
    expect(resposta.body.message).toMatch(/reservas vinculadas/i);
  });

  it('retorna 400 ao enviar payload inválido no POST /quartos', async () => {
    const resposta = await request(realApp).post('/quartos').send(payloadBase({ numero: -1, valor_diaria_centavos: 10000 }));

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({
      status: 'error',
      message: 'O campo "numero" deve ser um número inteiro positivo',
    });
  });

  it('POST /quartos com JSON malformado retorna 400', async () => {
    const resposta = await request(realApp)
      .post('/quartos')
      .set('Content-Type', 'application/json')
      .send('{ "numero": ');

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({
      status: 'error',
      message: 'JSON inválido no corpo da requisição',
    });
  });
});
