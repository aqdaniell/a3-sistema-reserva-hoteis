// Proteção: estes testes executam migrations e apagam/inserem dados.
// Fora de NODE_ENV=test a conexão apontaria para o database.sqlite real.
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    `tests/quartoModel.test.js só pode ser executado com NODE_ENV=test (atual: ${process.env.NODE_ENV}). ` +
      'Execução interrompida para proteger o banco real.'
  );
}

const { getDatabase, closeDatabase } = require('../src/database/connection');
const { runMigrations } = require('../src/database/migrate');
const quartoModel = require('../src/models/quartoModel');

const quartoBase = (overrides = {}) => ({
  numero: 101,
  tipo: 'solteiro',
  status: 'disponivel',
  valor_diaria_centavos: 15000,
  ...overrides,
});

const criarReserva = (quartoId, status = 'confirmada') => {
  const db = getDatabase();
  const clienteId = db
    .prepare('INSERT INTO clientes (nome, cpf) VALUES (?, ?)')
    .run('Maria', '11111111111').lastInsertRowid;

  return db
    .prepare(
      `INSERT INTO reservas (quarto_id, cliente_id, checkin, checkout, valor_total_centavos, status)
       VALUES (?, ?, '2026-12-01', '2026-12-05', 60000, ?)`
    )
    .run(quartoId, clienteId, status);
};

beforeEach(() => {
  // Em NODE_ENV=test a conexão é ':memory:'; fechar garante um banco novo por teste.
  closeDatabase();
  runMigrations(getDatabase());
});

afterAll(() => {
  closeDatabase();
});

describe('quartoModel.findAll', () => {
  it('retorna lista vazia quando não há quartos', () => {
    expect(quartoModel.findAll()).toEqual([]);
  });

  it('lista todos os quartos ordenados por número', () => {
    quartoModel.create(quartoBase({ numero: 203 }));
    quartoModel.create(quartoBase({ numero: 101 }));
    quartoModel.create(quartoBase({ numero: 102, status: 'manutencao' }));

    const quartos = quartoModel.findAll();

    expect(quartos.map((q) => q.numero)).toEqual([101, 102, 203]);
    expect(quartos[1]).toMatchObject({ status: 'manutencao' });
  });
});

describe('quartoModel.findById', () => {
  it('retorna o quarto com todas as colunas', () => {
    const criado = quartoModel.create(quartoBase());

    expect(quartoModel.findById(criado.id)).toEqual({
      id: criado.id,
      numero: 101,
      tipo: 'solteiro',
      status: 'disponivel',
      valor_diaria_centavos: 15000,
    });
  });

  it('retorna null quando o quarto não existe', () => {
    expect(quartoModel.findById(9999)).toBeNull();
  });
});

describe('quartoModel.findByNumero', () => {
  it('retorna o quarto com o número informado', () => {
    quartoModel.create(quartoBase({ numero: 305 }));

    expect(quartoModel.findByNumero(305)).toMatchObject({ numero: 305, tipo: 'solteiro' });
  });

  it('retorna null quando o número não existe', () => {
    expect(quartoModel.findByNumero(999)).toBeNull();
  });
});

describe('quartoModel.create', () => {
  it('insere e retorna o quarto criado, mantendo o valor em centavos (inteiro)', () => {
    const criado = quartoModel.create(quartoBase({ numero: 110, valor_diaria_centavos: 19990 }));

    expect(criado.id).toBeGreaterThan(0);
    expect(criado).toMatchObject({ numero: 110, valor_diaria_centavos: 19990 });
    expect(Number.isInteger(criado.valor_diaria_centavos)).toBe(true);
    expect(quartoModel.findAll()).toHaveLength(1);
  });

  it('propaga erro de número duplicado (UNIQUE)', () => {
    quartoModel.create(quartoBase());

    expect(() => quartoModel.create(quartoBase())).toThrow(/UNIQUE/);
    expect(quartoModel.findAll()).toHaveLength(1);
  });

  it('propaga erro de status inválido (CHECK)', () => {
    expect(() => quartoModel.create(quartoBase({ status: 'ocupado' }))).toThrow(/CHECK/);
  });

  it('propaga erro de valor fracionado ou não positivo (CHECK)', () => {
    expect(() => quartoModel.create(quartoBase({ valor_diaria_centavos: 150.5 }))).toThrow(/CHECK/);
    expect(() => quartoModel.create(quartoBase({ numero: 2, valor_diaria_centavos: 0 }))).toThrow(/CHECK/);
  });

  it('propaga erro de campo obrigatório ausente (NOT NULL)', () => {
    expect(() => quartoModel.create({ numero: 1, tipo: 'casal', status: 'disponivel' })).toThrow();
  });
});

describe('quartoModel.update', () => {
  it('atualiza todos os campos e retorna o quarto atualizado', () => {
    const { id } = quartoModel.create(quartoBase());

    const atualizado = quartoModel.update(id, {
      numero: 102,
      tipo: 'casal',
      status: 'manutencao',
      valor_diaria_centavos: 25000,
    });

    expect(atualizado).toEqual({
      id,
      numero: 102,
      tipo: 'casal',
      status: 'manutencao',
      valor_diaria_centavos: 25000,
    });
    expect(quartoModel.findById(id)).toEqual(atualizado);
  });

  it('atualiza apenas os campos informados', () => {
    const { id } = quartoModel.create(quartoBase());

    const atualizado = quartoModel.update(id, { status: 'manutencao' });

    expect(atualizado).toEqual({
      id,
      numero: 101,
      tipo: 'solteiro',
      status: 'manutencao',
      valor_diaria_centavos: 15000,
    });
  });

  it('ignora campos desconhecidos (incluindo id) e não altera o registro', () => {
    const { id } = quartoModel.create(quartoBase());

    const resultado = quartoModel.update(id, { id: 999, coluna_inexistente: 'x' });

    expect(resultado).toMatchObject({ id, numero: 101 });
  });

  it('retorna null quando o quarto não existe', () => {
    expect(quartoModel.update(9999, { status: 'manutencao' })).toBeNull();
    expect(quartoModel.update(9999, {})).toBeNull();
  });

  it('não altera nenhum campo quando os dados de atualização estão vazios', () => {
    const { id } = quartoModel.create(quartoBase({ numero: 120, tipo: 'suite', valor_diaria_centavos: 32050 }));
    const original = quartoModel.findById(id);

    const resultado = quartoModel.update(id, {});

    expect(resultado).toEqual(original);
    expect(quartoModel.findById(id)).toEqual(original);
    expect(quartoModel.findAll()).toEqual([original]);
  });

  it('propaga erro ao violar UNIQUE e mantém o registro original', () => {
    quartoModel.create(quartoBase({ numero: 101 }));
    const { id } = quartoModel.create(quartoBase({ numero: 102 }));

    expect(() => quartoModel.update(id, { numero: 101 })).toThrow(/UNIQUE/);
    expect(quartoModel.findById(id).numero).toBe(102);
  });

  it('propaga erro ao violar CHECK', () => {
    const { id } = quartoModel.create(quartoBase());

    expect(() => quartoModel.update(id, { status: 'ocupado' })).toThrow(/CHECK/);
    expect(() => quartoModel.update(id, { valor_diaria_centavos: -1 })).toThrow(/CHECK/);
  });
});

describe('quartoModel.remove', () => {
  it('exclui o quarto e retorna true', () => {
    const { id } = quartoModel.create(quartoBase());

    expect(quartoModel.remove(id)).toBe(true);
    expect(quartoModel.findById(id)).toBeNull();
  });

  it('retorna false quando o quarto não existe', () => {
    expect(quartoModel.remove(9999)).toBe(false);
  });

  it('propaga erro de chave estrangeira ao excluir quarto com reservas', () => {
    const { id } = quartoModel.create(quartoBase());
    criarReserva(id);

    expect(() => quartoModel.remove(id)).toThrow(/FOREIGN KEY/);
    expect(quartoModel.findById(id)).not.toBeNull();
  });
});

describe('quartoModel.hasReservas', () => {
  it('retorna false quando o quarto não possui reservas', () => {
    const { id } = quartoModel.create(quartoBase());

    expect(quartoModel.hasReservas(id)).toBe(false);
  });

  it('retorna true quando existe reserva vinculada ao quarto', () => {
    const { id } = quartoModel.create(quartoBase());
    criarReserva(id);

    expect(quartoModel.hasReservas(id)).toBe(true);
  });

  it('retorna true para reserva cancelada (qualquer status conta)', () => {
    const { id } = quartoModel.create(quartoBase());
    criarReserva(id, 'cancelada');

    expect(quartoModel.hasReservas(id)).toBe(true);
  });

  it('retorna true para reserva concluida (qualquer status conta)', () => {
    const { id } = quartoModel.create(quartoBase());
    criarReserva(id, 'concluida');

    expect(quartoModel.hasReservas(id)).toBe(true);
  });

  it('considera apenas as reservas do próprio quarto', () => {
    const comReserva = quartoModel.create(quartoBase({ numero: 101 }));
    const semReserva = quartoModel.create(quartoBase({ numero: 102 }));
    criarReserva(comReserva.id);

    expect(quartoModel.hasReservas(comReserva.id)).toBe(true);
    expect(quartoModel.hasReservas(semReserva.id)).toBe(false);
  });

  it('retorna false para quarto inexistente', () => {
    expect(quartoModel.hasReservas(9999)).toBe(false);
  });
});
