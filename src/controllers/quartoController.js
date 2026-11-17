const quartoService = require('../services/quartoService');

/**
 * Lista todos os quartos cadastrados.
 */
function listar(req, res, next) {
  try {
    const quartos = quartoService.listar();
    return res.status(200).json(quartos);
  } catch (error) {
    return next(error);
  }
}

/**
 * Busca um quarto pelo ID informado nos parâmetros da rota.
 */
function buscarPorId(req, res, next) {
  try {
    const quarto = quartoService.buscarPorId(req.params?.id);
    return res.status(200).json(quarto);
  } catch (error) {
    return next(error);
  }
}

/**
 * Cria um novo quarto com os dados recebidos no corpo da requisição.
 */
function criar(req, res, next) {
  try {
    const quarto = quartoService.criar(req.body);
    return res.status(201).json(quarto);
  } catch (error) {
    return next(error);
  }
}

/**
 * Atualiza integralmente um quarto existente.
 */
function atualizar(req, res, next) {
  try {
    const quarto = quartoService.atualizar(req.params?.id, req.body);
    return res.status(200).json(quarto);
  } catch (error) {
    return next(error);
  }
}

/**
 * Exclui um quarto pelo ID e retorna 204 sem corpo.
 */
function excluir(req, res, next) {
  try {
    quartoService.excluir(req.params?.id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  excluir,
};
