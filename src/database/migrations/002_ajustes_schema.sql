-- Migration 002: ajustes de schema apontados na revisão
--   1. Valores monetários: REAL -> INTEGER em centavos (colunas renomeadas com sufixo _centavos)
--   2. CPF: exatamente 11 dígitos numéricos (dados existentes são normalizados)
--   3. pagamentos.data_pagamento: data real no formato YYYY-MM-DD
--   4. Status restritos em quartos e reservas
--   5. pagamentos.metodo restrito a valores conhecidos
--
-- O SQLite não permite alterar constraints nem converter tipos com ALTER TABLE,
-- por isso cada tabela afetada é recriada (tabela nova -> copia dados -> remove antiga -> renomeia).
-- O runner desliga foreign_keys durante a migration e executa PRAGMA foreign_key_check
-- antes do commit. Se algum dado existente violar as novas regras, a migration inteira é desfeita.
--
-- Conversão monetária: CAST(ROUND(ROUND(valor, 2) * 100) AS INTEGER)
-- (arredonda primeiro para 2 casas e depois converte, evitando erros de ponto flutuante como 19.99 * 100 = 1998.9999999999998).

-- ---------------------------------------------------------------- clientes
CREATE TABLE clientes_new (
  id       INTEGER PRIMARY KEY,
  nome     TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  cpf      TEXT NOT NULL UNIQUE CHECK (length(cpf) = 11 AND cpf NOT GLOB '*[^0-9]*'),
  telefone TEXT,
  email    TEXT
);

INSERT INTO clientes_new (id, nome, cpf, telefone, email)
SELECT id, nome, replace(replace(replace(trim(cpf), '.', ''), '-', ''), ' ', ''), telefone, email
FROM clientes;

DROP TABLE clientes;
ALTER TABLE clientes_new RENAME TO clientes;

-- ----------------------------------------------------------------- quartos
CREATE TABLE quartos_new (
  id                   INTEGER PRIMARY KEY,
  numero               INTEGER NOT NULL UNIQUE,
  tipo                 TEXT NOT NULL CHECK (length(trim(tipo)) > 0),
  status               TEXT NOT NULL CHECK (status IN ('disponivel', 'manutencao')),
  valor_diaria_centavos INTEGER NOT NULL
    CHECK (typeof(valor_diaria_centavos) = 'integer' AND valor_diaria_centavos > 0)
);

INSERT INTO quartos_new (id, numero, tipo, status, valor_diaria_centavos)
SELECT id, numero, tipo, status, CAST(ROUND(ROUND(valor_diaria, 2) * 100) AS INTEGER)
FROM quartos;

DROP TABLE quartos;
ALTER TABLE quartos_new RENAME TO quartos;

-- ---------------------------------------------------------------- reservas
CREATE TABLE reservas_new (
  id                  INTEGER PRIMARY KEY,
  quarto_id           INTEGER NOT NULL REFERENCES quartos (id),
  cliente_id          INTEGER NOT NULL REFERENCES clientes (id),
  checkin             TEXT NOT NULL CHECK (date(checkin) IS NOT NULL AND date(checkin) = checkin),
  checkout            TEXT NOT NULL CHECK (date(checkout) IS NOT NULL AND date(checkout) = checkout),
  valor_total_centavos INTEGER NOT NULL
    CHECK (typeof(valor_total_centavos) = 'integer' AND valor_total_centavos >= 0),
  status              TEXT NOT NULL CHECK (status IN ('pendente', 'confirmada', 'cancelada', 'concluida')),
  CHECK (checkout > checkin)
);

INSERT INTO reservas_new (id, quarto_id, cliente_id, checkin, checkout, valor_total_centavos, status)
SELECT id, quarto_id, cliente_id, checkin, checkout, CAST(ROUND(ROUND(valor_total, 2) * 100) AS INTEGER), status
FROM reservas;

DROP TABLE reservas;
ALTER TABLE reservas_new RENAME TO reservas;

CREATE INDEX idx_reservas_quarto_id  ON reservas (quarto_id);
CREATE INDEX idx_reservas_cliente_id ON reservas (cliente_id);

-- -------------------------------------------------------------- pagamentos
CREATE TABLE pagamentos_new (
  id             INTEGER PRIMARY KEY,
  reserva_id     INTEGER NOT NULL REFERENCES reservas (id),
  valor_centavos INTEGER NOT NULL
    CHECK (typeof(valor_centavos) = 'integer' AND valor_centavos > 0),
  data_pagamento TEXT NOT NULL CHECK (date(data_pagamento) IS NOT NULL AND date(data_pagamento) = data_pagamento),
  metodo         TEXT NOT NULL CHECK (metodo IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito'))
);

INSERT INTO pagamentos_new (id, reserva_id, valor_centavos, data_pagamento, metodo)
SELECT id, reserva_id, CAST(ROUND(ROUND(valor, 2) * 100) AS INTEGER), data_pagamento, metodo
FROM pagamentos;

DROP TABLE pagamentos;
ALTER TABLE pagamentos_new RENAME TO pagamentos;

CREATE INDEX idx_pagamentos_reserva_id ON pagamentos (reserva_id);
