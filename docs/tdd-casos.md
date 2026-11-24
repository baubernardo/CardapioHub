# Tabela de Casos — Ciclo TDD (Encontro 16)

**Regra de negócio testada:** Cálculo de Taxa e Cota de Processamento de Pedidos / Entregas (`calcularTaxaPedido` e `CotaPedidos`).
- Taxa por pedido/entrega: 5 centavos por unidade/peso (`5 * valor`), com **piso mínimo de R$ 10,00 (1000 centavos)**.
- Cota operacional do plano Básico (*Lancheria Xis do Gaúcho*): limite de **600 pedidos/unidades** no ciclo mensal. A soma acumulada nunca pode ultrapassar o limite da cota.

| Caso / Entrada | Saída Esperada | Por que |
|---|---|---|
| `40` unidades/kg | `1000` centavos (R$ 10,00) | `40 × 5 = 200`, abaixo do piso: paga o piso mínimo de R$ 10,00 (1000 centavos) |
| `400` unidades/kg | `2000` centavos (R$ 20,00) | `400 × 5 = 2000` (R$ 20,00), acima do piso: calcula proporcional |
| `200` e `201` (bordas) | `1000` e `1005` centavos | Exatamente no limite do piso (`200 × 5 = 1000`) e 1 unidade acima (`201 × 5 = 1005`) |
| `0`, `-5`, `12.5`, `'100'` | Erro: `quantidade deve ser inteiro positivo` | Valor inválido (zero, negativo, fração ou texto) é recusado |
| Cota com `500/600` recebe `+100` | `entregue = 600` (aceito) | Atinge exatamente o limite de 600 da cota do plano Básico |
| Cota com `600/600` recebe `+1` | Erro: `pedido estoura a cota do plano` e `entregue` permanece `600` | Passou 1 unidade do limite: recusa e mantém estado íntegro |
