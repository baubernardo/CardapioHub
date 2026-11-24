# Plano de Testes — CardápioHub

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Entregáveis 3.1 e 3.2 da Etapa 3 (Encontro 16)

---

## 1. Visão Geral da Pirâmide de Testes

A suíte automatizada do **CardápioHub** cobre os três níveis da pirâmide de testes e é executada automaticamente a cada `git push` no pipeline do GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):

| Tipo | O que testa | Precisa do sistema no ar? | Arquivo no Repositório |
|---|---|---|---|
| **Unidade (TDD)** | Regras de negócio de cálculo de taxa com piso e limite de cota por tenant (`calcularTaxaPedido` e `CotaTenant`), sem banco e sem rede | Não (roda em < 100 ms) | [`api/testes/cota-taxa.test.js`](../api/testes/cota-taxa.test.js) |
| **Integração** | Barreira de idempotência no Redis (`SETNX` / HTTP 409) e comunicação assíncrona entre `API` → `Fila BullMQ` → `Worker` atualizando status no schema do tenant (`EM_PREPARO`) | Sim (`docker compose up`) | [`testes/integracao.test.js`](../testes/integracao.test.js) |
| **Ponta a Ponta / Isolamento** | Isolamento bidirecional entre `xis-do-gaucho` (`tenant_xis_gaucho`) e `suprema-express` (`tenant_suprema_express`), garantindo que um restaurante jamais veja pedidos do outro | Sim (`docker compose up`) | [`testes/isolamento.test.js`](../testes/isolamento.test.js) |
| **Carga (k6)** | Latência `p95` e taxa de erro sob pico de 10 e 100 usuários virtuais confrontadas com os limiares de [`docs/slo.md`](slo.md) | Sim (executado com `grafana/k6`) | [`scripts/carga.k6.js`](../scripts/carga.k6.js) e [`docs/carga-enc14.md`](carga-enc14.md) |

---

## 2. Mapa de Casos de Teste

| Tipo | Teste | O que prova | Estado | Nasce por TDD? |
|---|---|---|---|---|
| **Unidade** | Piso mínimo de taxa (40 unidades) | Volume abaixo do piso paga exatamente o piso de 1000 centavos (R$ 10,00) | **Existe:** `api/testes/cota-taxa.test.js` | **Sim** (branch `tdd-cota`, par 1 `red:`/`green:`) |
| **Unidade** | Cálculo proporcional acima do piso (400 unidades) | Volume acima do piso paga proporcionalmente (2000 centavos = R$ 20,00) | **Existe:** `api/testes/cota-taxa.test.js` | **Sim** (branch `tdd-cota`, par 2 `red:`/`green:`) |
| **Unidade** | Quantidades inválidas (`0`, `-5`, `12.5`, `'100'`) | Valores não inteiros ou não positivos são rejeitados com erro explícito | **Existe:** `api/testes/cota-taxa.test.js` | **Sim** (branch `tdd-cota`, par 3 `red:`/`green:`) |
| **Unidade** | Limite de cota do tenant (`CotaTenant`) | Registrar pedidos até o teto de 600 do plano Básico funciona; +1 além do limite lança erro e preserva o saldo anterior | **Existe:** `api/testes/cota-taxa.test.js` | **Sim** (branch `tdd-cota`, par 4 `red:`/`green:`) |
| **Unidade** | Casos de borda do piso (`200` e `201`) | `200` paga `1000` centavos e `201` paga `1005` centavos | **Existe:** `api/testes/cota-taxa.test.js` | **Sim** (`refactor:` na branch `tdd-cota`) |
| **Isolamento (E2E)** | Suprema Express não vê pedido do Xis do Gaúcho | Pedido criado no schema `tenant_xis_gaucho` não aparece no `GET /api/v1/orders` de `suprema-express` | **Existe:** `testes/isolamento.test.js` | Não (trava regressão do isolamento) |
| **Isolamento (E2E)** | Xis do Gaúcho não vê pedido da Suprema Express | Pedido criado no schema `tenant_suprema_express` não aparece no `GET /api/v1/orders` de `xis-do-gaucho` | **Existe:** `testes/isolamento.test.js` | Não |
| **Segurança / Isolamento** | Tenant inexistente ou forjado | Requisição com `x-tenant-slug` inválido é barrada no `preHandler` com HTTP `404 TenantNotFound` | **Existe:** `testes/isolamento.test.js` | Não |
| **Integração** | Idempotência contra duplicação (`X-Idempotency-Key`) | Duas requisições idênticas com a mesma chave retornam `201 Created` na primeira e `409 Conflict` na segunda | **Existe:** `testes/integracao.test.js` | Não |
| **Integração** | Fluxo assíncrono `API` → `Redis BullMQ` → `Worker` | Pedido criado como `AGUARDANDO_PAGTO` é consumido pelo Worker e atualizado para `EM_PREPARO` no schema correto | **Existe:** `testes/integracao.test.js` | Não |

---

## 3. Ordem de Execução no Pipeline (`.github/workflows/ci.yml`)

Seguindo o princípio de custo crescente:
1. **Conferência de existência de arquivos de teste (`ls api/testes/*.test.js testes/*.test.js`):** impede que um `node --test` sem arquivos passe silenciosamente em verde.
2. **Testes de Unidade (`node --test api/testes/*.test.js`):** rodam em menos de 1 segundo, sem subir containers. Se uma regra de negócio quebrar, o pipeline falha imediatamente.
3. **Build & Subida do Produto (`docker compose up -d --build --wait`):** sobe PostgreSQL 16 (com schemas `tenant_xis_gaucho` e `tenant_suprema_express`), Redis 7, API Fastify e Worker BullMQ.
4. **Testes de Isolamento e Integração (`node --test --test-concurrency=1 testes/*.test.js`):** validam o isolamento real no banco e a fila assíncrona.
