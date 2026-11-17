/**
 * Erro HTTP operacional da aplicação.
 * Associa um statusCode HTTP específico (ex.: 400, 404, 409) para ser
 * tratado pelo middleware global de erros.
 */
class AppError extends Error {
  /**
   * @param {string} message Mensagem descritiva do erro.
   * @param {number} [statusCode=400] Código de status HTTP de erro (inteiro entre 400 e 599).
   */
  constructor(message, statusCode = 400) {
    if (typeof statusCode !== 'number' || !Number.isInteger(statusCode)) {
      throw new TypeError('statusCode deve ser um número inteiro entre 400 e 599');
    }

    if (statusCode < 400 || statusCode > 599) {
      throw new RangeError('statusCode deve estar entre 400 e 599');
    }

    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = AppError;
