const PISO_CENTAVOS = 1000;
const TAXA_POR_UNIDADE = 5;

function calcularTaxaPedido(quantidade) {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new Error('quantidade deve ser inteiro positivo');
  }
  return Math.max(PISO_CENTAVOS, quantidade * TAXA_POR_UNIDADE);
}

class CotaTenant {
  constructor({ tenant, limite, usado = 0 }) {
    this.tenant = tenant;
    this.limite = limite;
    this.usado = usado;
  }

  registrar(quantidade) {
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new Error('quantidade deve ser inteiro positivo');
    }
    const novoTotal = this.usado + quantidade;
    if (novoTotal > this.limite) {
      throw new Error(`pedido estoura a cota do tenant (${novoTotal} > ${this.limite})`);
    }
    this.usado = novoTotal;
  }
}

module.exports = { calcularTaxaPedido, CotaTenant, PISO_CENTAVOS, TAXA_POR_UNIDADE };
