const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularTaxaPedido } = require('../cota-taxa');

test('40 unidades paga o piso de 1000 centavos (R$ 10,00)', () => {
  assert.equal(calcularTaxaPedido(40), 1000);
});

test('400 unidades paga proporcional acima do piso (2000 centavos)', () => {
  assert.equal(calcularTaxaPedido(400), 2000);
});
