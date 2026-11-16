const Database = require('better-sqlite3');
const path = require('path');

let dbInstance = null;

/**
 * Retorna uma instância singleton da conexão com o SQLite.
 * Em ambiente de teste, utiliza ':memory:' por padrão caso nenhum caminho seja especificado.
 *
 * @param {string} [customPath] Caminho opcional para o banco de dados.
 * @returns {Database.Database} Instância do better-sqlite3
 */
function getDatabase(customPath) {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = customPath || (
    process.env.NODE_ENV === 'test'
      ? ':memory:'
      : path.resolve(__dirname, '../../database.sqlite')
  );

  dbInstance = new Database(resolvedPath);
  dbInstance.pragma('foreign_keys = ON');

  return dbInstance;
}

/**
 * Fecha a conexão ativa com o banco de dados, se houver.
 */
function closeDatabase() {
  if (dbInstance && dbInstance.open) {
    dbInstance.close();
  }
  dbInstance = null;
}

module.exports = {
  getDatabase,
  closeDatabase
};
