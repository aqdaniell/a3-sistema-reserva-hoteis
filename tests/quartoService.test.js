jest.mock('../src/models/quartoModel', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByNumero: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  hasReservas: jest.fn(),
}));

const quartoModel = require('../src/models/quartoModel');
const quartoService = require('../src/services/quartoService');
const AppError = require('../src/utils/AppError');

const dadosValidos = () => ({
  numero: 101,
  tipo: 'solteiro',
  status: 'disponivel',
  valor_diaria_centavos: 15000,
});

const quartoSalvo = (extra = {}) => ({ id: 1, ...dadosValidos(), ...extra });

/** Executa `fn` e devolve o erro lançado (falha o teste se nada for lançado). */
function capturarErro(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('Era esperado que a função lançasse um erro');
}

function esperarAppError(fn, statusCode, mensagem) {
  const err = capturarErro(fn);
  expect(err).toBeInstanceOf(AppError);
  expect(err.statusCode).toBe(statusCode);
  if (mensagem !== undefined) {
    expect(err.message).toMatch(mensagem);
  }
  return err;
}

/** Simula erro do better-sqlite3 (SqliteError) com código e mensagem internos. */
function erroSqlite(code, message) {
  const err = new Error(message);
  err.name = 'SqliteError';
  err.code = code;
  return err;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('quartoService.listar', () => {
  it('retorna todos os quartos do model', () => {
    const quartos = [quartoSalvo(), quartoSalvo({ id: 2, numero: 102 })];
    quartoModel.findAll.mockReturnValue(quartos);

    expect(quartoService.listar()).toBe(quartos);
    expect(quartoModel.findAll).toHaveBeenCalledTimes(1);
  });

  it('retorna lista vazia quando não há quartos', () => {
    quartoModel.findAll.mockReturnValue([]);
    expect(quartoService.listar()).toEqual([]);
  });
});

describe('quartoService.buscarPorId', () => {
  it('retorna o quarto encontrado', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());

    expect(quartoService.buscarPorId(1)).toEqual(quartoSalvo());
    expect(quartoModel.findById).toHaveBeenCalledWith(1);
  });

  it('aceita ID numérico em texto (parâmetro de rota)', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());

    quartoService.buscarPorId('1');
    expect(quartoModel.findById).toHaveBeenCalledWith(1);
  });

  it('lança 404 quando o quarto não existe', () => {
    quartoModel.findById.mockReturnValue(null);

    esperarAppError(() => quartoService.buscarPorId(999), 404, /não encontrado/i);
  });

  it.each([0, -1, 1.5, 'abc', '1abc', '', null, undefined, NaN])('lança 400 para ID inválido (%p)', (id) => {
    esperarAppError(() => quartoService.buscarPorId(id), 400, /ID/);
    expect(quartoModel.findById).not.toHaveBeenCalled();
  });
});

describe('quartoService.criar — validação de campos', () => {
  describe('numero', () => {
    it.each([0, -5, 1.5, '101', null, undefined, NaN, Infinity, true])('rejeita numero inválido (%p)', (numero) => {
      esperarAppError(() => quartoService.criar({ ...dadosValidos(), numero }), 400, /numero/);
      expect(quartoModel.create).not.toHaveBeenCalled();
    });

    it('rejeita numero ausente', () => {
      const { numero, ...semNumero } = dadosValidos();
      esperarAppError(() => quartoService.criar(semNumero), 400, /numero/);
    });
  });

  describe('tipo', () => {
    it.each(['', '   ', '\t\n', 123, null, undefined, {}, []])('rejeita tipo inválido (%p)', (tipo) => {
      esperarAppError(() => quartoService.criar({ ...dadosValidos(), tipo }), 400, /tipo/);
      expect(quartoModel.create).not.toHaveBeenCalled();
    });

    it('remove espaços nas pontas antes de enviar ao model', () => {
      quartoModel.findByNumero.mockReturnValue(null);
      quartoModel.create.mockImplementation((d) => ({ id: 1, ...d }));

      const criado = quartoService.criar({ ...dadosValidos(), tipo: '  casal  ' });

      expect(quartoModel.create).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'casal' }));
      expect(criado.tipo).toBe('casal');
    });
  });

  describe('status', () => {
    it.each(['disponivel', 'manutencao'])('aceita status "%s"', (status) => {
      quartoModel.findByNumero.mockReturnValue(null);
      quartoModel.create.mockImplementation((d) => ({ id: 1, ...d }));

      expect(quartoService.criar({ ...dadosValidos(), status }).status).toBe(status);
    });

    it.each(['ocupado', 'DISPONIVEL', ' disponivel', '', 1, null, undefined])('rejeita status inválido (%p)', (status) => {
      esperarAppError(() => quartoService.criar({ ...dadosValidos(), status }), 400, /status/);
      expect(quartoModel.create).not.toHaveBeenCalled();
    });
  });

  describe('valor_diaria_centavos', () => {
    it.each([0, -100, 10.5, '15000', null, undefined, NaN, Infinity])(
      'rejeita valor_diaria_centavos inválido (%p)',
      (valor) => {
        esperarAppError(
          () => quartoService.criar({ ...dadosValidos(), valor_diaria_centavos: valor }),
          400,
          /valor_diaria_centavos/
        );
        expect(quartoModel.create).not.toHaveBeenCalled();
      }
    );
  });

  describe('corpo da requisição', () => {
    it.each([null, undefined, 'texto', 42, []])('rejeita corpo inválido (%p)', (corpo) => {
      esperarAppError(() => quartoService.criar(corpo), 400, /Corpo da requisição/);
      expect(quartoModel.create).not.toHaveBeenCalled();
    });
  });
});

describe('quartoService.criar — regras de negócio', () => {
  it('cria o quarto e devolve o registro do model', () => {
    quartoModel.findByNumero.mockReturnValue(null);
    quartoModel.create.mockReturnValue(quartoSalvo());

    expect(quartoService.criar(dadosValidos())).toEqual(quartoSalvo());
    expect(quartoModel.create).toHaveBeenCalledWith(dadosValidos());
  });

  it('envia ao model apenas os quatro campos conhecidos', () => {
    quartoModel.findByNumero.mockReturnValue(null);
    quartoModel.create.mockReturnValue(quartoSalvo());

    quartoService.criar({ ...dadosValidos(), id: 99, admin: true });

    expect(quartoModel.create).toHaveBeenCalledWith(dadosValidos());
  });

  it('lança 409 quando o número do quarto já existe', () => {
    quartoModel.findByNumero.mockReturnValue(quartoSalvo());

    esperarAppError(() => quartoService.criar(dadosValidos()), 409, /número/);
    expect(quartoModel.findByNumero).toHaveBeenCalledWith(101);
    expect(quartoModel.create).not.toHaveBeenCalled();
  });

  it('converte violação UNIQUE do banco (corrida) em 409 sem expor detalhes do SQLite', () => {
    quartoModel.findByNumero.mockReturnValue(null);
    quartoModel.create.mockImplementation(() => {
      throw erroSqlite('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: quartos.numero');
    });

    const err = esperarAppError(() => quartoService.criar(dadosValidos()), 409);
    expect(err.message).not.toMatch(/UNIQUE constraint|quartos\.numero|SQLITE/);
  });
});

describe('quartoService.atualizar', () => {
  it('atualiza todos os campos e devolve o registro atualizado', () => {
    const novos = { numero: 202, tipo: 'suite', status: 'manutencao', valor_diaria_centavos: 50000 };
    quartoModel.findById.mockReturnValue(quartoSalvo());
    quartoModel.findByNumero.mockReturnValue(null);
    quartoModel.update.mockReturnValue({ id: 1, ...novos });

    expect(quartoService.atualizar(1, novos)).toEqual({ id: 1, ...novos });
    expect(quartoModel.update).toHaveBeenCalledWith(1, novos);
  });

  it.each(['numero', 'tipo', 'status', 'valor_diaria_centavos'])('exige o campo obrigatório "%s"', (campo) => {
    const dados = dadosValidos();
    delete dados[campo];

    esperarAppError(() => quartoService.atualizar(1, dados), 400, new RegExp(campo));
    expect(quartoModel.update).not.toHaveBeenCalled();
  });

  it('rejeita corpo vazio (não é PATCH)', () => {
    esperarAppError(() => quartoService.atualizar(1, {}), 400);
    expect(quartoModel.update).not.toHaveBeenCalled();
  });

  it.each([
    ['numero', 0],
    ['tipo', '   '],
    ['status', 'ocupado'],
    ['valor_diaria_centavos', -1],
  ])('valida o campo "%s" na atualização', (campo, valor) => {
    esperarAppError(() => quartoService.atualizar(1, { ...dadosValidos(), [campo]: valor }), 400, new RegExp(campo));
    expect(quartoModel.update).not.toHaveBeenCalled();
  });

  it('lança 400 para ID inválido', () => {
    esperarAppError(() => quartoService.atualizar('abc', dadosValidos()), 400, /ID/);
    expect(quartoModel.findById).not.toHaveBeenCalled();
  });

  it('lança 404 quando o quarto não existe', () => {
    quartoModel.findById.mockReturnValue(null);

    esperarAppError(() => quartoService.atualizar(999, dadosValidos()), 404, /não encontrado/i);
    expect(quartoModel.update).not.toHaveBeenCalled();
  });

  it('permite manter o próprio número atual sem falso conflito', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());
    quartoModel.findByNumero.mockReturnValue(quartoSalvo()); // o número 101 pertence ao próprio quarto 1
    quartoModel.update.mockReturnValue(quartoSalvo({ tipo: 'casal' }));

    const resultado = quartoService.atualizar(1, { ...dadosValidos(), tipo: 'casal' });

    expect(resultado.tipo).toBe('casal');
    expect(quartoModel.update).toHaveBeenCalledWith(1, { ...dadosValidos(), tipo: 'casal' });
  });

  it('lança 409 quando o número pertence a outro quarto', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo({ id: 1, numero: 101 }));
    quartoModel.findByNumero.mockReturnValue(quartoSalvo({ id: 2, numero: 202 }));

    esperarAppError(() => quartoService.atualizar(1, { ...dadosValidos(), numero: 202 }), 409, /número/);
    expect(quartoModel.update).not.toHaveBeenCalled();
  });

  it('lança 404 se o quarto sumir entre a verificação e a atualização', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());
    quartoModel.findByNumero.mockReturnValue(null);
    quartoModel.update.mockReturnValue(null);

    esperarAppError(() => quartoService.atualizar(1, dadosValidos()), 404);
  });
});

describe('quartoService.excluir', () => {
  it('lança 404 quando o quarto não existe', () => {
    quartoModel.findById.mockReturnValue(null);

    esperarAppError(() => quartoService.excluir(999), 404, /não encontrado/i);
    expect(quartoModel.hasReservas).not.toHaveBeenCalled();
    expect(quartoModel.remove).not.toHaveBeenCalled();
  });

  it('lança 400 para ID inválido', () => {
    esperarAppError(() => quartoService.excluir(-1), 400, /ID/);
    expect(quartoModel.findById).not.toHaveBeenCalled();
  });

  it('lança 409 e não exclui quando há reserva vinculada (qualquer status)', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());
    quartoModel.hasReservas.mockReturnValue(true);

    const err = esperarAppError(() => quartoService.excluir(1), 409, /reservas vinculadas/);
    expect(err.message).toMatch(/manutencao/);
    expect(quartoModel.hasReservas).toHaveBeenCalledWith(1);
    expect(quartoModel.remove).not.toHaveBeenCalled();
  });

  it('exclui o quarto quando não há reservas vinculadas', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());
    quartoModel.hasReservas.mockReturnValue(false);
    quartoModel.remove.mockReturnValue(true);

    expect(quartoService.excluir(1)).toBeUndefined();
    expect(quartoModel.remove).toHaveBeenCalledWith(1);
  });

  it('converte violação de chave estrangeira (corrida) em 409 sem expor detalhes do SQLite', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());
    quartoModel.hasReservas.mockReturnValue(false);
    quartoModel.remove.mockImplementation(() => {
      throw erroSqlite('SQLITE_CONSTRAINT_FOREIGNKEY', 'FOREIGN KEY constraint failed');
    });

    const err = esperarAppError(() => quartoService.excluir(1), 409, /reservas vinculadas/);
    expect(err.message).not.toMatch(/FOREIGN KEY constraint|SQLITE/);
  });

  it('lança 404 se o quarto sumir entre a verificação e a exclusão', () => {
    quartoModel.findById.mockReturnValue(quartoSalvo());
    quartoModel.hasReservas.mockReturnValue(false);
    quartoModel.remove.mockReturnValue(false);

    esperarAppError(() => quartoService.excluir(1), 404);
  });
});

describe('quartoService — conversão de erros inesperados', () => {
  const erroInterno = () =>
    erroSqlite('SQLITE_ERROR', 'no such table: quartos (caminho C:\\segredo\\database.sqlite)');

  const operacoes = {
    listar: () => {
      quartoModel.findAll.mockImplementation(() => {
        throw erroInterno();
      });
      return () => quartoService.listar();
    },
    buscarPorId: () => {
      quartoModel.findById.mockImplementation(() => {
        throw erroInterno();
      });
      return () => quartoService.buscarPorId(1);
    },
    criar: () => {
      quartoModel.findByNumero.mockReturnValue(null);
      quartoModel.create.mockImplementation(() => {
        throw erroInterno();
      });
      return () => quartoService.criar(dadosValidos());
    },
    atualizar: () => {
      quartoModel.findById.mockReturnValue(quartoSalvo());
      quartoModel.findByNumero.mockReturnValue(null);
      quartoModel.update.mockImplementation(() => {
        throw erroInterno();
      });
      return () => quartoService.atualizar(1, dadosValidos());
    },
    excluir: () => {
      quartoModel.findById.mockReturnValue(quartoSalvo());
      quartoModel.hasReservas.mockImplementation(() => {
        throw erroInterno();
      });
      return () => quartoService.excluir(1);
    },
  };

  it.each(Object.keys(operacoes))('%s: erro inesperado vira AppError 500 genérico, sem detalhes internos', (nome) => {
    const err = esperarAppError(operacoes[nome](), 500, /^Erro interno do servidor$/);

    expect(err.message).not.toMatch(/SQLITE|no such table|segredo|database\.sqlite/);
    expect(err.cause).toBeInstanceOf(Error); // erro original preservado apenas para o log do servidor
    expect(err.cause.message).toMatch(/no such table/);
  });

  it('converte violação CHECK do banco em 500 genérico (a validação do serviço deveria ter barrado)', () => {
    quartoModel.findByNumero.mockReturnValue(null);
    quartoModel.create.mockImplementation(() => {
      throw erroSqlite('SQLITE_CONSTRAINT_CHECK', 'CHECK constraint failed: valor_diaria_centavos > 0');
    });

    const err = esperarAppError(() => quartoService.criar(dadosValidos()), 500, /^Erro interno do servidor$/);
    expect(err.message).not.toMatch(/CHECK constraint|SQLITE/);
  });

  it('converte violação PRIMARY KEY do banco em 500 genérico (não é duplicidade de número)', () => {
    quartoModel.findByNumero.mockReturnValue(null);
    quartoModel.create.mockImplementation(() => {
      throw erroSqlite('SQLITE_CONSTRAINT_PRIMARYKEY', 'UNIQUE constraint failed: quartos.id');
    });

    const err = esperarAppError(() => quartoService.criar(dadosValidos()), 500, /^Erro interno do servidor$/);
    expect(err.message).not.toMatch(/UNIQUE constraint|quartos\.id|PRIMARYKEY|SQLITE/);
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause.code).toBe('SQLITE_CONSTRAINT_PRIMARYKEY');
  });

  it('preserva erros AppError já lançados, sem reembrulhar', () => {
    const original = new AppError('Erro de regra de negócio', 422);
    quartoModel.findAll.mockImplementation(() => {
      throw original;
    });

    expect(capturarErro(() => quartoService.listar())).toBe(original);
  });

  it('converte também erros que não são instâncias de Error', () => {
    quartoModel.findAll.mockImplementation(() => {
      throw 'falha estranha com detalhes internos';
    });

    const err = esperarAppError(() => quartoService.listar(), 500, /^Erro interno do servidor$/);
    expect(err.message).not.toMatch(/detalhes internos/);
  });
});
