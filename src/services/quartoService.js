const quartoModel = require('../models/quartoModel');
const AppError = require('../utils/AppError');

const STATUS_VALIDOS = ['disponivel', 'manutencao'];

const CODIGOS_UNIQUE = ['SQLITE_CONSTRAINT_UNIQUE'];
const CODIGO_FOREIGN_KEY = 'SQLITE_CONSTRAINT_FOREIGNKEY';

const MSG_NUMERO_DUPLICADO = 'Já existe um quarto cadastrado com este número';
const MSG_COM_RESERVAS =
  'Não é possível excluir o quarto pois existem reservas vinculadas a ele. ' +
  'Altere o status do quarto para "manutencao" caso ele não deva mais receber reservas';

/**
 * Converte qualquer erro lançado pelo Model em um AppError seguro.
 * - AppError (ex.: erros de validação do próprio serviço) é preservado.
 * - Conflitos de UNIQUE/FOREIGN KEY (corridas entre a verificação e a gravação) viram 409.
 * - Qualquer outro erro vira 500 genérico, sem expor mensagens internas do SQLite;
 *   o erro original fica em `cause` para o log do middleware global.
 */
function traduzirErro(err, mensagemForeignKey = MSG_COM_RESERVAS) {
  if (err instanceof AppError) return err;

  if (err && CODIGOS_UNIQUE.includes(err.code)) {
    return new AppError(MSG_NUMERO_DUPLICADO, 409);
  }

  if (err && err.code === CODIGO_FOREIGN_KEY) {
    return new AppError(mensagemForeignKey, 409);
  }

  const erro = new AppError('Erro interno do servidor', 500);
  erro.cause = err;
  return erro;
}

/** Executa `fn` garantindo que somente AppError seguros saiam do serviço. */
function executar(fn, mensagemForeignKey) {
  try {
    return fn();
  } catch (err) {
    throw traduzirErro(err, mensagemForeignKey);
  }
}

/**
 * Valida o identificador recebido (número inteiro positivo ou string apenas com dígitos).
 * @returns {number}
 */
function validarId(id) {
  const valor = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;

  if (!Number.isSafeInteger(valor) || valor <= 0) {
    throw new AppError('ID do quarto inválido: informe um inteiro positivo', 400);
  }

  return valor;
}

function validarInteiroPositivo(valor, campo) {
  if (valor === undefined || valor === null) {
    throw new AppError(`O campo "${campo}" é obrigatório`, 400);
  }

  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) {
    throw new AppError(`O campo "${campo}" deve ser um número inteiro positivo`, 400);
  }

  return valor;
}

/**
 * Valida os quatro campos obrigatórios do quarto e devolve um objeto limpo
 * (campos desconhecidos são descartados; `tipo` é salvo sem espaços nas pontas).
 */
function validarDadosQuarto(dados) {
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new AppError('Corpo da requisição inválido: informe os dados do quarto', 400);
  }

  const numero = validarInteiroPositivo(dados.numero, 'numero');

  if (dados.tipo === undefined || dados.tipo === null) {
    throw new AppError('O campo "tipo" é obrigatório', 400);
  }
  if (typeof dados.tipo !== 'string' || dados.tipo.trim().length === 0) {
    throw new AppError('O campo "tipo" deve ser um texto não vazio', 400);
  }
  const tipo = dados.tipo.trim();

  if (dados.status === undefined || dados.status === null) {
    throw new AppError('O campo "status" é obrigatório', 400);
  }
  if (!STATUS_VALIDOS.includes(dados.status)) {
    throw new AppError(`O campo "status" deve ser um destes valores: ${STATUS_VALIDOS.join(', ')}`, 400);
  }
  const status = dados.status;

  const valorDiariaCentavos = validarInteiroPositivo(dados.valor_diaria_centavos, 'valor_diaria_centavos');

  return { numero, tipo, status, valor_diaria_centavos: valorDiariaCentavos };
}

/**
 * Lista todos os quartos.
 * @returns {Array<object>}
 */
function listar() {
  return executar(() => quartoModel.findAll());
}

/**
 * Busca um quarto pelo ID.
 * @throws {AppError} 400 para ID inválido; 404 se o quarto não existir.
 */
function buscarPorId(id) {
  const idValido = validarId(id);

  return executar(() => {
    const quarto = quartoModel.findById(idValido);

    if (!quarto) {
      throw new AppError('Quarto não encontrado', 404);
    }

    return quarto;
  });
}

/**
 * Cria um quarto após validar os dados e checar duplicidade do número.
 * @throws {AppError} 400 para dados inválidos; 409 se o número já existir.
 */
function criar(dados) {
  const quarto = validarDadosQuarto(dados);

  return executar(() => {
    if (quartoModel.findByNumero(quarto.numero)) {
      throw new AppError(MSG_NUMERO_DUPLICADO, 409);
    }

    return quartoModel.create(quarto);
  });
}

/**
 * Atualização completa (PUT): exige os quatro campos.
 * O próprio número atual do quarto não gera conflito.
 * @throws {AppError} 400 para ID/dados inválidos; 404 se não existir; 409 se o número pertencer a outro quarto.
 */
function atualizar(id, dados) {
  const idValido = validarId(id);
  const quarto = validarDadosQuarto(dados);

  return executar(() => {
    if (!quartoModel.findById(idValido)) {
      throw new AppError('Quarto não encontrado', 404);
    }

    const existente = quartoModel.findByNumero(quarto.numero);
    if (existente && existente.id !== idValido) {
      throw new AppError(MSG_NUMERO_DUPLICADO, 409);
    }

    const atualizado = quartoModel.update(idValido, quarto);

    // O quarto pode ter sido removido entre a verificação e a atualização.
    if (!atualizado) {
      throw new AppError('Quarto não encontrado', 404);
    }

    return atualizado;
  });
}

/**
 * Exclui um quarto. Bloqueia (409) se existir qualquer reserva vinculada,
 * independentemente do status da reserva.
 * @throws {AppError} 400 para ID inválido; 404 se não existir; 409 se houver reservas.
 */
function excluir(id) {
  const idValido = validarId(id);

  executar(() => {
    if (!quartoModel.findById(idValido)) {
      throw new AppError('Quarto não encontrado', 404);
    }

    if (quartoModel.hasReservas(idValido)) {
      throw new AppError(MSG_COM_RESERVAS, 409);
    }

    if (!quartoModel.remove(idValido)) {
      throw new AppError('Quarto não encontrado', 404);
    }
  });
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  excluir,
};
