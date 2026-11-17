const fs = require('fs');
const path = require('path');

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Executa as migrations .sql pendentes (em ordem alfabética do nome do arquivo).
 * Migrations já registradas em `schema_migrations` não são executadas novamente.
 * Cada migration roda dentro de uma transação: se falhar, nada é aplicado.
 *
 * @param {import('better-sqlite3').Database} db Conexão ativa.
 * @param {string} [migrationsDir] Diretório com os arquivos .sql.
 * @returns {string[]} Nomes das migrations aplicadas nesta execução.
 */
function runMigrations(db, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name)
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const insertMigration = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');
  const executed = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // O SQLite exige foreign_keys desligado (fora de transação) para recriar tabelas
    // referenciadas por outras. A integridade é verificada antes do commit.
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(sql);

        const violations = db.pragma('foreign_key_check');
        if (violations.length > 0) {
          throw new Error(
            `Migration ${file} violaria chaves estrangeiras (${violations.length} registro(s)); alterações desfeitas.`
          );
        }

        insertMigration.run(file);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    executed.push(file);
  }

  return executed;
}

module.exports = { runMigrations };
