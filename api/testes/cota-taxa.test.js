const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularTaxaPedido } = require('../cota-taxa');

test('40 unidades paga o piso de 1000 centavos (R$ 10,00)', () => {
  assert.equal(calcularTaxaPedido(40), 1000);
});
