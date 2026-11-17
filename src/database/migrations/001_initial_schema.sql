-- Migration 001: schema inicial do sistema de reservas de hotéis
-- Datas no formato ISO 8601 (YYYY-MM-DD); a comparação textual equivale à cronológica.

CREATE TABLE clientes (
  id       INTEGER PRIMARY KEY,
  nome     TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  cpf      TEXT NOT NULL UNIQUE CHECK (length(trim(cpf)) > 0),
  telefone TEXT,
  email    TEXT
);

CREATE TABLE quartos (
  id           INTEGER PRIMARY KEY,
  numero       INTEGER NOT NULL UNIQUE,
  tipo         TEXT NOT NULL CHECK (length(trim(tipo)) > 0),
  status       TEXT NOT NULL CHECK (length(trim(status)) > 0),
  valor_diaria REAL NOT NULL CHECK (valor_diaria > 0)
);

CREATE TABLE reservas (
  id          INTEGER PRIMARY KEY,
  quarto_id   INTEGER NOT NULL REFERENCES quartos (id),
  cliente_id  INTEGER NOT NULL REFERENCES clientes (id),
  checkin     TEXT NOT NULL CHECK (date(checkin) IS NOT NULL AND date(checkin) = checkin),
  checkout    TEXT NOT NULL CHECK (date(checkout) IS NOT NULL AND date(checkout) = checkout),
  valor_total REAL NOT NULL CHECK (valor_total >= 0),
  status      TEXT NOT NULL CHECK (length(trim(status)) > 0),
  CHECK (checkout > checkin)
);

CREATE TABLE pagamentos (
  id             INTEGER PRIMARY KEY,
  reserva_id     INTEGER NOT NULL REFERENCES reservas (id),
  valor          REAL NOT NULL CHECK (valor > 0),
  data_pagamento TEXT NOT NULL CHECK (length(trim(data_pagamento)) > 0),
  metodo         TEXT NOT NULL CHECK (length(trim(metodo)) > 0)
);

-- Armazena apenas o hash da senha, nunca a senha em texto puro.
CREATE TABLE funcionarios (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  cargo      TEXT NOT NULL CHECK (length(trim(cargo)) > 0),
  login      TEXT NOT NULL UNIQUE CHECK (length(trim(login)) > 0),
  senha_hash TEXT NOT NULL CHECK (length(trim(senha_hash)) > 0)
);

CREATE INDEX idx_reservas_quarto_id  ON reservas (quarto_id);
CREATE INDEX idx_reservas_cliente_id ON reservas (cliente_id);
CREATE INDEX idx_pagamentos_reserva_id ON pagamentos (reserva_id);
