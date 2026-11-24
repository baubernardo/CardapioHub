const PISO_CENTAVOS = 1000;
const TAXA_POR_UNIDADE = 5;

function calcularTaxaPedido(quantidade) {
  return Math.max(PISO_CENTAVOS, quantidade * TAXA_POR_UNIDADE);
}

module.exports = { calcularTaxaPedido };
