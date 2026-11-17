/**
 * Normaliza um CPF removendo pontos, traços e espaços (e qualquer outro
 * caractere não numérico). Deve ser aplicado antes de salvar no banco.
 *
 * @param {string|number|null|undefined} cpf
 * @returns {string} Apenas os dígitos do CPF (string vazia se não houver entrada).
 */
function normalizarCpf(cpf) {
  if (cpf === null || cpf === undefined) return '';
  return String(cpf).replace(/\D/g, '');
}

module.exports = { normalizarCpf };
