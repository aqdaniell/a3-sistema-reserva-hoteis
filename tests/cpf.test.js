const { normalizarCpf } = require('../src/utils/cpf');

describe('normalizarCpf', () => {
  it.each([
    ['123.456.789-01', '12345678901'],
    ['123 456 789 01', '12345678901'],
    ['  123.456.789-01  ', '12345678901'],
    ['12345678901', '12345678901'],
    [12345678901, '12345678901'],
  ])('normaliza %p para %p', (entrada, esperado) => {
    expect(normalizarCpf(entrada)).toBe(esperado);
  });

  it('retorna string vazia para null ou undefined', () => {
    expect(normalizarCpf(null)).toBe('');
    expect(normalizarCpf(undefined)).toBe('');
  });
});
