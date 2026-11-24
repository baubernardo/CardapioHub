const PISO_CENTAVOS = 1000;
const TAXA_POR_UNIDADE = 5;

function calcularTaxaPedido(quantidade) {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new Error('quantidade deve ser inteiro positivo');
  }
  return Math.max(PISO_CENTAVOS, quantidade * TAXA_POR_UNIDADE);
}

module.exports = { calcularTaxaPedido };
