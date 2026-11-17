const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/database/migrate');

const MIGRATIONS_DIR = path.join(__dirname, '../src/database/migrations');
const TODAS_MIGRATIONS = ['001_initial_schema.sql', '002_ajustes_schema.sql'];

let db;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------- helpers
const novoCliente = (cpf = '11111111111') =>
  db.prepare('INSERT INTO clientes (nome, cpf) VALUES (?, ?)').run('Maria', cpf).lastInsertRowid;

const novoQuarto = (numero = 101, status = 'disponivel', valorCentavos = 15000) =>
  db
    .prepare('INSERT INTO quartos (numero, tipo, status, valor_diaria_centavos) VALUES (?, ?, ?, ?)')
    .run(numero, 'solteiro', status, valorCentavos).lastInsertRowid;

const inserirReserva = (
  quartoId,
  clienteId,
  checkin = '2026-12-01',
  checkout = '2026-12-05',
  valorTotalCentavos = 60000,
  status = 'confirmada'
) =>
  db
    .prepare(
      `INSERT INTO reservas (quarto_id, cliente_id, checkin, checkout, valor_total_centavos, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(quartoId, clienteId, checkin, checkout, valorTotalCentavos, status);

const inserirPagamento = (reservaId, valorCentavos = 10000, data = '2026-12-01', metodo = 'pix') =>
  db
    .prepare('INSERT INTO pagamentos (reserva_id, valor_centavos, data_pagamento, metodo) VALUES (?, ?, ?, ?)')
    .run(reservaId, valorCentavos, data, metodo);

/** Cria um diretório temporário contendo apenas as migrations indicadas (arquivos reais). */
function dirComMigrations(nomes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
  for (const nome of nomes) {
    fs.copyFileSync(path.join(MIGRATIONS_DIR, nome), path.join(dir, nome));
  }
  return dir;
}

// ----------------------------------------------------------- schema geral
describe('Schema', () => {
  it('cria as cinco tabelas do sistema e a tabela de controle', () => {
    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((t) => t.name);

    expect(tabelas).toEqual(
      expect.arrayContaining(['clientes', 'quartos', 'reservas', 'pagamentos', 'funcionarios', 'schema_migrations'])
    );
    expect(tabelas.filter((t) => t.endsWith('_new'))).toEqual([]);
  });

  it('mantém os índices de reservas e pagamentos após a migration 002', () => {
    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((i) => i.name);

    expect(indices).toEqual(
      expect.arrayContaining(['idx_reservas_quarto_id', 'idx_reservas_cliente_id', 'idx_pagamentos_reserva_id'])
    );
  });

  it('declara as chaves estrangeiras esperadas e mantém foreign_keys ativo', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

    const fks = (tabela) =>
      db.pragma(`foreign_key_list(${tabela})`).map((fk) => `${fk.from}->${fk.table}.${fk.to}`);

    expect(fks('reservas')).toEqual(expect.arrayContaining(['quarto_id->quartos.id', 'cliente_id->clientes.id']));
    expect(fks('pagamentos')).toEqual(['reserva_id->reservas.id']);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('usa colunas monetárias INTEGER em centavos', () => {
    const coluna = (tabela, nome) => db.pragma(`table_info(${tabela})`).find((c) => c.name === nome);

    expect(coluna('quartos', 'valor_diaria_centavos').type).toBe('INTEGER');
    expect(coluna('reservas', 'valor_total_centavos').type).toBe('INTEGER');
    expect(coluna('pagamentos', 'valor_centavos').type).toBe('INTEGER');

    expect(coluna('quartos', 'valor_diaria')).toBeUndefined();
    expect(coluna('reservas', 'valor_total')).toBeUndefined();
    expect(coluna('pagamentos', 'valor')).toBeUndefined();
  });
});

// ------------------------------------------------------------- unicidade
describe('Constraints de unicidade', () => {
  it('rejeita CPF duplicado', () => {
    novoCliente('22222222222');
    expect(() => novoCliente('22222222222')).toThrow(/UNIQUE/);
  });

  it('rejeita login duplicado de funcionário', () => {
    const insert = () =>
      db
        .prepare('INSERT INTO funcionarios (nome, cargo, login, senha_hash) VALUES (?, ?, ?, ?)')
        .run('Ana', 'recepcionista', 'ana', '$2b$10$hashhashhash');

    insert();
    expect(insert).toThrow(/UNIQUE/);
  });

  it('rejeita número de quarto duplicado', () => {
    novoQuarto(201);
    expect(() => novoQuarto(201)).toThrow(/UNIQUE/);
  });
});

// ------------------------------------------------------------------- CPF
describe('CPF', () => {
  it('aceita CPF com exatamente 11 dígitos', () => {
    expect(novoCliente('12345678901')).toBeGreaterThan(0);
  });

  it.each([
    ['formatado com pontos e traço', '123.456.789-01'],
    ['com espaços', '123 456 789 01'],
    ['curto demais', '1234567890'],
    ['longo demais', '123456789012'],
    ['com letras', '1234567890a'],
    ['vazio', ''],
  ])('rejeita CPF %s', (_descricao, cpf) => {
    expect(() => novoCliente(cpf)).toThrow(/CHECK/);
  });

  it('rejeita CPF nulo', () => {
    expect(() => db.prepare('INSERT INTO clientes (nome, cpf) VALUES (?, ?)').run('Sem CPF', null)).toThrow(/NOT NULL/);
  });
});

// ------------------------------------------------------ regras de valor
describe('Valores monetários em centavos', () => {
  it.each([0, -50])('rejeita valor de diária inválido (%s)', (valor) => {
    expect(() => novoQuarto(301, 'disponivel', valor)).toThrow(/CHECK/);
  });

  it('rejeita valor de diária fracionado (não inteiro)', () => {
    expect(() => novoQuarto(302, 'disponivel', 150.5)).toThrow(/CHECK/);
  });

  it('rejeita valor_total negativo e fracionado', () => {
    const q = novoQuarto();
    const c = novoCliente();
    expect(() => inserirReserva(q, c, '2026-12-01', '2026-12-05', -1)).toThrow(/CHECK/);
    expect(() => inserirReserva(q, c, '2026-12-01', '2026-12-05', 10.5)).toThrow(/CHECK/);
    expect(inserirReserva(q, c, '2026-12-01', '2026-12-05', 0).changes).toBe(1);
  });

  it('rejeita pagamento com valor zero, negativo ou fracionado', () => {
    const reservaId = inserirReserva(novoQuarto(), novoCliente()).lastInsertRowid;

    expect(() => inserirPagamento(reservaId, 0)).toThrow(/CHECK/);
    expect(() => inserirPagamento(reservaId, -10)).toThrow(/CHECK/);
    expect(() => inserirPagamento(reservaId, 10.5)).toThrow(/CHECK/);
    expect(inserirPagamento(reservaId, 100).changes).toBe(1);
  });
});

// ----------------------------------------------------------------- datas
describe('Datas', () => {
  it('rejeita checkout anterior ao check-in', () => {
    const q = novoQuarto();
    const c = novoCliente();
    expect(() => inserirReserva(q, c, '2026-12-10', '2026-12-05')).toThrow(/CHECK/);
  });

  it('rejeita checkout igual ao check-in', () => {
    const q = novoQuarto();
    const c = novoCliente();
    expect(() => inserirReserva(q, c, '2026-12-10', '2026-12-10')).toThrow(/CHECK/);
  });

  it('rejeita check-in e checkout fora do formato ISO ou inexistentes', () => {
    const q = novoQuarto();
    const c = novoCliente();
    expect(() => inserirReserva(q, c, '10/12/2026', '15/12/2026')).toThrow(/CHECK/);
    expect(() => inserirReserva(q, c, '2026-02-30', '2026-03-05')).toThrow(/CHECK/);
  });

  it.each([
    ['formato brasileiro', '01/12/2026'],
    ['data inexistente', '2026-02-30'],
    ['mês inválido', '2026-13-01'],
    ['com horário', '2026-12-01 10:00:00'],
    ['texto livre', 'ontem'],
    ['vazio', ''],
  ])('rejeita data_pagamento inválida (%s)', (_descricao, data) => {
    const reservaId = inserirReserva(novoQuarto(), novoCliente()).lastInsertRowid;
    expect(() => inserirPagamento(reservaId, 100, data)).toThrow(/CHECK/);
  });

  it('aceita data_pagamento real no formato YYYY-MM-DD (inclusive 29/02 em ano bissexto)', () => {
    const reservaId = inserirReserva(novoQuarto(), novoCliente()).lastInsertRowid;
    expect(inserirPagamento(reservaId, 100, '2028-02-29').changes).toBe(1);
    expect(() => inserirPagamento(reservaId, 100, '2027-02-29')).toThrow(/CHECK/);
  });
});

// ---------------------------------------------------------------- status
describe('Status e método de pagamento', () => {
  it.each(['disponivel', 'manutencao'])('aceita status de quarto "%s"', (status) => {
    expect(novoQuarto(400 + status.length, status)).toBeGreaterThan(0);
  });

  it.each(['ocupado', 'DISPONIVEL', ''])('rejeita status de quarto "%s"', (status) => {
    expect(() => novoQuarto(450, status)).toThrow(/CHECK/);
  });

  it.each(['pendente', 'confirmada', 'cancelada', 'concluida'])('aceita status de reserva "%s"', (status) => {
    const q = novoQuarto();
    const c = novoCliente();
    expect(inserirReserva(q, c, '2026-12-01', '2026-12-05', 1000, status).changes).toBe(1);
  });

  it.each(['aprovada', 'CONFIRMADA', ''])('rejeita status de reserva "%s"', (status) => {
    const q = novoQuarto();
    const c = novoCliente();
    expect(() => inserirReserva(q, c, '2026-12-01', '2026-12-05', 1000, status)).toThrow(/CHECK/);
  });

  it.each(['pix', 'dinheiro', 'cartao_credito', 'cartao_debito'])('aceita método de pagamento "%s"', (metodo) => {
    const reservaId = inserirReserva(novoQuarto(), novoCliente()).lastInsertRowid;
    expect(inserirPagamento(reservaId, 100, '2026-12-01', metodo).changes).toBe(1);
  });

  it.each(['boleto', 'PIX', 'cartao', ''])('rejeita método de pagamento "%s"', (metodo) => {
    const reservaId = inserirReserva(novoQuarto(), novoCliente()).lastInsertRowid;
    expect(() => inserirPagamento(reservaId, 100, '2026-12-01', metodo)).toThrow(/CHECK/);
  });
});

// ------------------------------------------------ obrigatoriedade geral
describe('Campos obrigatórios', () => {
  it('rejeita funcionário sem senha_hash', () => {
    expect(() =>
      db.prepare('INSERT INTO funcionarios (nome, cargo, login) VALUES (?, ?, ?)').run('Bob', 'gerente', 'bob')
    ).toThrow(/NOT NULL/);
  });
});

// ----------------------------------------------- integridade referencial
describe('Integridade referencial', () => {
  it('bloqueia reserva com quarto ou cliente inexistente', () => {
    const q = novoQuarto();
    const c = novoCliente();
    expect(() => inserirReserva(999, c)).toThrow(/FOREIGN KEY/);
    expect(() => inserirReserva(q, 999)).toThrow(/FOREIGN KEY/);
  });

  it('bloqueia pagamento com reserva inexistente', () => {
    expect(() => inserirPagamento(999)).toThrow(/FOREIGN KEY/);
  });

  it('impede excluir cliente, quarto ou reserva que possuem registros dependentes', () => {
    const q = novoQuarto();
    const c = novoCliente();
    const r = inserirReserva(q, c).lastInsertRowid;
    inserirPagamento(r);

    expect(() => db.prepare('DELETE FROM clientes WHERE id = ?').run(c)).toThrow(/FOREIGN KEY/);
    expect(() => db.prepare('DELETE FROM quartos WHERE id = ?').run(q)).toThrow(/FOREIGN KEY/);
    expect(() => db.prepare('DELETE FROM reservas WHERE id = ?').run(r)).toThrow(/FOREIGN KEY/);
  });
});

// ------------------------------------------------------------ migrations
describe('Sistema de migrations', () => {
  it('registra as migrations aplicadas e não as executa novamente', () => {
    const registradas = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map((m) => m.name);
    expect(registradas).toEqual(TODAS_MIGRATIONS);

    novoCliente('33333333333');
    expect(runMigrations(db)).toEqual([]);

    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n).toBe(TODAS_MIGRATIONS.length);
    expect(db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n).toBe(1);
  });

  it('aplica a migration 002 somente uma vez, mesmo em execuções repetidas', () => {
    const dir = dirComMigrations(TODAS_MIGRATIONS);
    try {
      const fresh = new Database(':memory:');
      expect(runMigrations(fresh, dir)).toEqual(TODAS_MIGRATIONS);
      fresh.prepare('INSERT INTO clientes (nome, cpf) VALUES (?, ?)').run('João', '44444444444');

      expect(runMigrations(fresh, dir)).toEqual([]);
      expect(runMigrations(fresh, dir)).toEqual([]);

      expect(
        fresh.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name = '002_ajustes_schema.sql'").get().n
      ).toBe(1);
      expect(fresh.prepare('SELECT COUNT(*) AS n FROM clientes').get().n).toBe(1);
      fresh.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('aplica apenas novas migrations preservando os dados existentes', () => {
    const dir = dirComMigrations(TODAS_MIGRATIONS);
    try {
      const fresh = new Database(':memory:');
      expect(runMigrations(fresh, dir)).toEqual(TODAS_MIGRATIONS);
      fresh.prepare('INSERT INTO clientes (nome, cpf) VALUES (?, ?)').run('João', '55555555555');

      fs.writeFileSync(path.join(dir, '003_add_coluna.sql'), 'ALTER TABLE clientes ADD COLUMN observacao TEXT;');
      expect(runMigrations(fresh, dir)).toEqual(['003_add_coluna.sql']);
      expect(runMigrations(fresh, dir)).toEqual([]);

      expect(fresh.prepare('SELECT nome, observacao FROM clientes').get()).toEqual({ nome: 'João', observacao: null });
      fresh.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('desfaz a migration inteira se ela falhar', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    try {
      fs.writeFileSync(path.join(dir, '001_quebrada.sql'), 'CREATE TABLE ok (id INTEGER); CREATE TABLE ok (id INTEGER);');
      const fresh = new Database(':memory:');

      expect(() => runMigrations(fresh, dir)).toThrow();
      expect(fresh.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").get()).toBeUndefined();
      expect(fresh.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n).toBe(0);
      expect(fresh.pragma('foreign_keys', { simple: true })).toBe(1);
      fresh.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('mantém o arquivo da migration 001 intacto (sem colunas _centavos)', () => {
    const sql001 = fs.readFileSync(path.join(MIGRATIONS_DIR, '001_initial_schema.sql'), 'utf8');
    expect(sql001).toContain('valor_diaria REAL NOT NULL');
    expect(sql001).not.toContain('_centavos');
  });
});

// -------------------------------------- migration 002 sobre dados legados
describe('Migration 002 — conversão de dados existentes', () => {
  let dir;
  let legado;

  /** Banco no estado pós-001, com dados no formato antigo (REAL, CPF formatado). */
  beforeEach(() => {
    dir = dirComMigrations(['001_initial_schema.sql']);
    legado = new Database(':memory:');
    expect(runMigrations(legado, dir)).toEqual(['001_initial_schema.sql']);
  });

  afterEach(() => {
    legado.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const aplicar002 = () => {
    fs.copyFileSync(path.join(MIGRATIONS_DIR, '002_ajustes_schema.sql'), path.join(dir, '002_ajustes_schema.sql'));
    return runMigrations(legado, dir);
  };

  const popularLegado = () => {
    legado.prepare('INSERT INTO clientes (id, nome, cpf, telefone, email) VALUES (?, ?, ?, ?, ?)')
      .run(1, 'Maria', '123.456.789-01', '48999990000', 'maria@exemplo.com');
    legado.prepare('INSERT INTO clientes (id, nome, cpf) VALUES (?, ?, ?)').run(2, 'José', '987 654 321-00');

    const quarto = legado.prepare('INSERT INTO quartos (id, numero, tipo, status, valor_diaria) VALUES (?, ?, ?, ?, ?)');
    quarto.run(1, 101, 'solteiro', 'disponivel', 150.5);
    quarto.run(2, 102, 'casal', 'manutencao', 19.99);
    quarto.run(3, 103, 'suite', 'disponivel', 0.125);
    quarto.run(4, 104, 'luxo', 'disponivel', 0.29);

    legado.prepare(
      `INSERT INTO reservas (id, quarto_id, cliente_id, checkin, checkout, valor_total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(1, 1, 1, '2026-12-01', '2026-12-05', 602.0, 'confirmada');
    legado.prepare(
      `INSERT INTO reservas (id, quarto_id, cliente_id, checkin, checkout, valor_total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(2, 2, 2, '2026-12-10', '2026-12-12', 39.98, 'pendente');

    const pag = legado.prepare('INSERT INTO pagamentos (id, reserva_id, valor, data_pagamento, metodo) VALUES (?, ?, ?, ?, ?)');
    pag.run(1, 1, 300.1, '2026-12-01', 'pix');
    pag.run(2, 1, 301.9, '2026-12-05', 'dinheiro');
  };

  it('converte valores em reais (REAL) para centavos (INTEGER) com arredondamento correto', () => {
    popularLegado();
    expect(aplicar002()).toEqual(['002_ajustes_schema.sql']);

    const diarias = legado
      .prepare('SELECT numero, valor_diaria_centavos AS v, typeof(valor_diaria_centavos) AS t FROM quartos ORDER BY id')
      .all();

    expect(diarias).toEqual([
      { numero: 101, v: 15050, t: 'integer' },
      { numero: 102, v: 1999, t: 'integer' }, // 19.99 * 100 = 1998.9999999999998 em ponto flutuante
      { numero: 103, v: 13, t: 'integer' }, // 0.125 (exato em binário) -> meio centavo arredonda para cima
      { numero: 104, v: 29, t: 'integer' }, // 0.29 * 100 = 28.999999999999996
    ]);

    expect(legado.prepare('SELECT id, valor_total_centavos AS v FROM reservas ORDER BY id').all()).toEqual([
      { id: 1, v: 60200 },
      { id: 2, v: 3998 },
    ]);

    expect(legado.prepare('SELECT id, valor_centavos AS v FROM pagamentos ORDER BY id').all()).toEqual([
      { id: 1, v: 30010 },
      { id: 2, v: 30190 },
    ]);
  });

  it('normaliza CPFs existentes e preserva ids, relacionamentos e demais campos', () => {
    popularLegado();
    aplicar002();

    expect(legado.prepare('SELECT id, nome, cpf, telefone, email FROM clientes ORDER BY id').all()).toEqual([
      { id: 1, nome: 'Maria', cpf: '12345678901', telefone: '48999990000', email: 'maria@exemplo.com' },
      { id: 2, nome: 'José', cpf: '98765432100', telefone: null, email: null },
    ]);

    expect(legado.prepare('SELECT id, quarto_id, cliente_id, checkin, checkout, status FROM reservas ORDER BY id').all())
      .toEqual([
        { id: 1, quarto_id: 1, cliente_id: 1, checkin: '2026-12-01', checkout: '2026-12-05', status: 'confirmada' },
        { id: 2, quarto_id: 2, cliente_id: 2, checkin: '2026-12-10', checkout: '2026-12-12', status: 'pendente' },
      ]);

    expect(legado.prepare('SELECT id, reserva_id, data_pagamento, metodo FROM pagamentos ORDER BY id').all()).toEqual([
      { id: 1, reserva_id: 1, data_pagamento: '2026-12-01', metodo: 'pix' },
      { id: 2, reserva_id: 1, data_pagamento: '2026-12-05', metodo: 'dinheiro' },
    ]);

    expect(legado.prepare('SELECT numero, tipo, status FROM quartos ORDER BY id').all()[1]).toEqual({
      numero: 102,
      tipo: 'casal',
      status: 'manutencao',
    });

    expect(legado.pragma('foreign_key_check')).toEqual([]);
    expect(legado.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('mantém as constraints novas funcionando após a conversão', () => {
    popularLegado();
    aplicar002();

    expect(() => legado.prepare('INSERT INTO clientes (nome, cpf) VALUES (?, ?)').run('Dup', '12345678901')).toThrow(
      /UNIQUE/
    );
    expect(() => legado.prepare('DELETE FROM quartos WHERE id = 1').run()).toThrow(/FOREIGN KEY/);
    expect(() =>
      legado.prepare('INSERT INTO pagamentos (reserva_id, valor_centavos, data_pagamento, metodo) VALUES (1, 100, ?, ?)')
        .run('2026-12-01', 'boleto')
    ).toThrow(/CHECK/);
  });

  it('não reexecuta a migration 002 e não perde nem duplica dados', () => {
    popularLegado();
    aplicar002();

    expect(runMigrations(legado, dir)).toEqual([]);
    expect(legado.prepare('SELECT COUNT(*) AS n FROM clientes').get().n).toBe(2);
    expect(legado.prepare('SELECT COUNT(*) AS n FROM quartos').get().n).toBe(4);
    expect(legado.prepare('SELECT COUNT(*) AS n FROM reservas').get().n).toBe(2);
    expect(legado.prepare('SELECT COUNT(*) AS n FROM pagamentos').get().n).toBe(2);
    expect(legado.prepare('SELECT valor_diaria_centavos AS v FROM quartos WHERE id = 1').get().v).toBe(15050);
  });

  it('desfaz tudo e mantém o banco legado intacto se existirem dados incompatíveis', () => {
    popularLegado();
    legado.prepare('INSERT INTO quartos (id, numero, tipo, status, valor_diaria) VALUES (5, 105, ?, ?, 99)')
      .run('simples', 'ocupado'); // status fora da lista permitida

    expect(() => aplicar002()).toThrow(/CHECK/);

    const colunas = legado.pragma('table_info(quartos)').map((c) => c.name);
    expect(colunas).toContain('valor_diaria');
    expect(colunas).not.toContain('valor_diaria_centavos');
    expect(legado.prepare('SELECT COUNT(*) AS n FROM quartos').get().n).toBe(5);
    expect(legado.prepare('SELECT cpf FROM clientes WHERE id = 1').get().cpf).toBe('123.456.789-01');
    expect(legado.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%_new'").all()).toEqual([]);
    expect(legado.prepare('SELECT name FROM schema_migrations').all()).toEqual([{ name: '001_initial_schema.sql' }]);
    expect(legado.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
