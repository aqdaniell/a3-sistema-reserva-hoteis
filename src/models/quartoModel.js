const { getDatabase } = require('../database/connection');

const COLUNAS = ['numero', 'tipo', 'status', 'valor_diaria_centavos'];

/**
 * Lista todos os quartos, ordenados por número.
 *
 * @returns {Array<object>}
 */
function findAll() {
  return getDatabase().prepare('SELECT * FROM quartos ORDER BY numero').all();
}

/**
 * @param {number} id
 * @returns {object|null} O quarto ou null caso não exista.
 */
function findById(id) {
  return getDatabase().prepare('SELECT * FROM quartos WHERE id = ?').get(id) ?? null;
}

/**
 * @param {number} numero
 * @returns {object|null} O quarto ou null caso não exista.
 */
function findByNumero(numero) {
  return getDatabase().prepare('SELECT * FROM quartos WHERE numero = ?').get(numero) ?? null;
}

/**
 * Insere um quarto. Valores monetários permanecem em centavos.
 * Violações de constraints do banco são propagadas.
 *
 * @param {{numero: number, tipo: string, status: string, valor_diaria_centavos: number}} data
 * @returns {object} O quarto criado.
 */
function create(data) {
  const db = getDatabase();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO quartos (numero, tipo, status, valor_diaria_centavos)
       VALUES (@numero, @tipo, @status, @valor_diaria_centavos)`
    )
    .run({
      numero: data.numero,
      tipo: data.tipo,
      status: data.status,
      valor_diaria_centavos: data.valor_diaria_centavos,
    });

  return findById(lastInsertRowid);
}

/**
 * Atualiza apenas as colunas informadas em `data` (numero, tipo, status,
 * valor_diaria_centavos). Campos desconhecidos são ignorados.
 * Violações de constraints do banco são propagadas.
 *
 * @param {number} id
 * @param {object} data
 * @returns {object|null} O quarto atualizado ou null caso não exista.
 */
function update(id, data) {
  const colunas = COLUNAS.filter((coluna) => data[coluna] !== undefined);

  if (colunas.length > 0) {
    // Os nomes das colunas vêm da lista fixa COLUNAS; os valores são parametrizados.
    const sets = colunas.map((coluna) => `${coluna} = @${coluna}`).join(', ');
    const params = { id };
    for (const coluna of colunas) params[coluna] = data[coluna];

    const { changes } = getDatabase().prepare(`UPDATE quartos SET ${sets} WHERE id = @id`).run(params);
    if (changes === 0) return null;
  }

  return findById(id);
}

/**
 * Exclui um quarto. Violações de chave estrangeira são propagadas.
 *
 * @param {number} id
 * @returns {boolean} true se um registro foi excluído; false se não existia.
 */
function remove(id) {
  return getDatabase().prepare('DELETE FROM quartos WHERE id = ?').run(id).changes > 0;
}

/**
 * @param {number} id
 * @returns {boolean} true se existir ao menos uma reserva vinculada ao quarto.
 */
function hasReservas(id) {
  return getDatabase().prepare('SELECT 1 FROM reservas WHERE quarto_id = ? LIMIT 1').get(id) !== undefined;
}

module.exports = {
  findAll,
  findById,
  findByNumero,
  create,
  update,
  remove,
  hasReservas,
};
