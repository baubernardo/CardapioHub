# Folha de registro — Encontro de 15/10

**Arquitetura de Software SAAS · o CampoConta rodando**

- **Nome:** Bernardo Gabriel Bau
- **Unidade de PI:** Cardápio Hub

**O que é:** o seu registro dos seis experimentos (frente) e o primeiro desenho dos serviços do seu produto (verso). **O que não é:** prova. Os comandos estão em `experimentos.md`, no repositório.

- [x] Frente: a resposta de abertura e as seis previsões, cada uma escrita ANTES de rodar.
- [ ] Verso: as caixas do seu produto e as quatro respostas.
- [ ] Verso fotografado antes de entregar a folha ao professor.

---

## Abertura (2 min, sem consulta)

**O que é um microsserviço? E o que muda nele quando o produto é multi-tenant?**

> é como se fosse uma aplicação dividida em várias partes independentes e no multi-tenant é a mesma coisa porém para atender muitos clientes ao mesmo tempo

---

## Os seis experimentos

*Previsão antes do sinal; "O que saiu", depois de rodar; "O nome disso", com o professor, no fim de cada experimento.*

| Experimento | Minha previsão | O que saiu | O nome disso |
| :--- | :--- | :--- | :--- |
| **1 — Seguir uma requisição** | Atravessa 3 serviços, na ordem: `gateway` → `producao` → `cobranca`. | Sem token: `{"erro":"token ausente ou invalido"}`.<br>Com token `$A`: listou as 2 cotas da Alvorada.<br>No `POST /entregas`, gravou `entrega_id: 3` e `evento_id: 1`. Nos logs apareceram os 3 serviços na ordem:<br>1. `[gateway] POST /entregas -> producao`<br>2. `[producao] entrega 3 gravada + evento 1 na outbox (mesma transacao)`<br>3. `[cobranca] evento 1 -> taxa de R$ 20.00 gerada`<br>4. `[producao/relay] evento 1 entregue a cobranca`.<br>Em `/taxas`: 2 taxas, `total: 80`. | **API Gateway + Propagação de Contexto (`x-tenant-id`) + Transactional Outbox / Eventos Assíncronos** |
| **2 — A Buricá tenta ver o dado da Alvorada** | *Com o filtro no código desligado, a Buricá passa a ver entrega da Alvorada?*<br><br>Não, porque o banco de dados ainda bloqueia o acesso às linhas de outro tenant via política de Row-Level Security (RLS). | `GET /entregas/1` retornou `{"erro":"entrega nao encontrada"}`.<br>Forçar o header `x-tenant-id: alvorada` foi ignorado pelo gateway (mostrou só a entrega 2 da Buricá).<br>Com `filtro-app/off`, continuou mostrando só a entrega 2.<br>Só vazou as entregas 1 e 3 da Alvorada quando desligamos também o RLS (`DISABLE ROW LEVEL SECURITY`) no Postgres. | **Isolamento Multi-tenant / Defesa em Profundidade + Row-Level Security (RLS)** |
| **3 — O relatório da diretoria** | *Um JOIN entre entrega e taxa resolve?*<br><br>Não, pois cada microsserviço possui seu próprio banco de dados isolado (`producao-db` não tem a tabela `taxa`). | O `SELECT ... JOIN taxa` no `producao-db` falhou com: `ERROR: relation "taxa" does not exist`.<br>Já o `GET /relatorio` no gateway funcionou (`total_ms: 6`), juntando via chamadas HTTP o JSON de `producao` (cotas) e `cobranca` (`total: 80`, 2 taxas). | **Database per Service (Um banco por serviço) + API Composition / Agregação no Gateway** |
| **4 — A cobrança sai do ar** | *Com a cobrança parada, o balanceiro consegue registrar uma entrega?*<br><br>Sim, porque a produção grava a entrega e o evento localmente na tabela `outbox` sem depender da cobrança estar no ar. | Os 5 `POST /entregas` funcionaram normalmente (`entrega_id` 4 a 8).<br>`/fila` mostrou `{"pendentes":5}`.<br>`/taxas` retornou `{"erro":"servico indisponivel","total_ms":142}`.<br>`/relatorio` retornou as cotas com `"cobranca":"INDISPONIVEL (relatorio parcial)"` (`total_ms: 5`).<br>Ao religar a cobrança, após 15s `/fila` zerou (`{"pendentes":0}`) e as 5 novas taxas de R$ 5 apareceram em `/taxas` (`total: 105`). | **Desacoplamento Temporal + Degradação Graciosa (Relatório Parcial) + Consistência Eventual (Outbox + Retry/Backoff)** |
| **5 — O mesmo evento chega duas vezes** | *Quantas taxas aparecem para uma entrega de 1000 kg da Buricá, e de quanto cada uma?*<br><br>Com a conferência desligada, aparecerão 2 taxas de R$ 50,00 cada (duplicadas). | Com `relay-duplica/on` e `idempotencia/off`, a entrega 9 (1000 kg) gerou duas taxas de R$ 50 em `/taxas` (`total: 145`).<br>Religando `idempotencia/on`, a entrega 10 (2000 kg) gerou apenas uma taxa de R$ 100 (`total: 245`), e o log mostrou: `[cobranca] evento 8 (tenant=burica) JA PROCESSADO - ignorado`. | **Entrega Pelo Menos Uma Vez (*At-least-once delivery*) + Consumidor Idempotente (Idempotência)** |
| **6 — O vizinho barulhento** | *Quanto a Buricá espera?*<br><br>Sem limite por tenant, vai esperar vários segundos (~6000 ms) na fila atrás dos 60 relatórios pesados da Alvorada. | Com `limite-tenant/off`: Alvorada teve `{ '200': 60 }` e a Buricá esperou `6149 ms`.<br>Com `limite-tenant/on`: Alvorada teve `{ '200': 3, '429': 57 }` (limitada a 3 requisições simultâneas) e a Buricá respondeu em `5 ms` (mediana `6 ms`, maior `69 ms`). | **Noisy Neighbor (Vizinho Barulhento) + Rate Limiting / Controle de Concorrência por Tenant (Bulkhead / Quota)** |

---

## No fim do encontro (2 min) — Reescrita

**Releia a sua resposta de abertura e reescreva:**

> Um microsserviço é um serviço autônomo que possui seu próprio banco de dados isolado (*Database per Service*) e se comunica com outros serviços via HTTP ou eventos assíncronos (*Transactional Outbox* com consumidor idempotente), permitindo continuar operando mesmo quando outro serviço cai. No modelo multi-tenant, para atender vários clientes ao mesmo tempo com segurança e desempenho, o Gateway identifica o tenant pelo token (`x-tenant-id`), o acesso aos dados exige defesa em profundidade (filtro na aplicação + *Row-Level Security* no banco) e aplica-se limite de concorrência por tenant (*Rate Limiting*) para evitar que um "vizinho barulhento" degrade o sistema para os demais.
> **O que mudou:** na abertura pensei apenas na divisão em partes independentes e múltiplos clientes; agora enxergo o banco exclusivo por serviço, a comunicação tolerante a falhas com Outbox/Idempotência, o isolamento por RLS no banco e o controle de concorrência contra vizinho barulhento.

---

## Formato `registro-enc11.md` (Caso precise das Partes 1 a 4 separadas no repositório do PI)

### Parte 1 — Antes de tudo (2 min, sem consulta)

O que é um microsserviço? E o que muda nele quando o produto é multi-tenant?

> é como se fosse uma aplicação dividida em várias partes independentes e no multi-tenant é a mesma coisa porém para atender muitos clientes ao mesmo tempo

### Parte 2 — As seis previsões

| Exp. | Previsão |
|---|---|
| 1 | Atravessa 3 serviços, na ordem: `gateway` → `producao` → `cobranca`. |
| 2 | Não, porque o banco de dados ainda bloqueia o acesso às linhas de outro tenant via política de Row-Level Security (RLS). |
| 3 | Não, pois cada microsserviço possui seu próprio banco de dados isolado (`producao-db` não tem a tabela `taxa`). |
| 4 | Sim, porque a produção grava a entrega e o evento localmente na tabela `outbox` sem depender da cobrança estar no ar. |
| 5 | Com a conferência desligada, aparecerão 2 taxas de R$ 50,00 cada (duplicadas). |
| 6 | Sem limite por tenant, vai esperar vários segundos (~6000 ms) na fila atrás dos 60 relatórios pesados da Alvorada. |

### Parte 3 — O que aconteceu

| Exp. | O que a saída mostrou | Acertei? | O nome disso |
|---|---|---|---|
| 1 | Sem token: `{"erro":"token ausente ou invalido"}`. Com token `$A`: listou as 2 cotas da Alvorada. No `POST /entregas`, gravou `entrega_id: 3` e `evento_id: 1`. Nos logs apareceram os 3 serviços na ordem: `[gateway] POST /entregas -> producao`, `[producao] entrega 3 gravada + evento 1 na outbox`, `[cobranca] evento 1 -> taxa de R$ 20.00 gerada` e `[producao/relay] evento 1 entregue a cobranca`. Em `/taxas`: 2 taxas, `total: 80`. | Sim | API Gateway + Propagação de Contexto (`x-tenant-id`) + Transactional Outbox / Eventos Assíncronos |
| 2 | `GET /entregas/1` retornou `{"erro":"entrega nao encontrada"}`. Forçar o header `x-tenant-id: alvorada` foi ignorado pelo gateway (mostrou só a entrega 2 da Buricá). Com `filtro-app/off`, continuou mostrando só a entrega 2. Só vazou as entregas 1 e 3 da Alvorada quando desligamos também o RLS (`DISABLE ROW LEVEL SECURITY`) no Postgres. | Sim | Isolamento Multi-tenant / Defesa em Profundidade + Row-Level Security (RLS) |
| 3 | O `SELECT ... JOIN taxa` no `producao-db` falhou com: `ERROR: relation "taxa" does not exist`. Já o `GET /relatorio` no gateway funcionou (`total_ms: 6`), juntando via chamadas HTTP o JSON de `producao` (cotas) e `cobranca` (`total: 80`, 2 taxas). | Sim | Database per Service (Um banco por serviço) + API Composition / Agregação no Gateway |
| 4 | Os 5 `POST /entregas` funcionaram normalmente (`entrega_id` 4 a 8). `/fila` mostrou `{"pendentes":5}`. `/taxas` retornou `{"erro":"servico indisponivel","total_ms":142}`. `/relatorio` retornou as cotas com `"cobranca":"INDISPONIVEL (relatorio parcial)"` (`total_ms: 5`). Ao religar a cobrança, após 15s `/fila` zerou (`{"pendentes":0}`) e as 5 novas taxas de R$ 5 apareceram em `/taxas` (`total: 105`). | Sim | Desacoplamento Temporal + Degradação Graciosa (Relatório Parcial) + Consistência Eventual (Outbox + Retry/Backoff) |
| 5 | Com `relay-duplica/on` e `idempotencia/off`, a entrega 9 (1000 kg) gerou duas taxas de R$ 50 em `/taxas` (`total: 145`). Religando `idempotencia/on`, a entrega 10 (2000 kg) gerou apenas uma taxa de R$ 100 (`total: 245`), e o log mostrou: `[cobranca] evento 8 (tenant=burica) JA PROCESSADO - ignorado`. | Sim | Entrega Pelo Menos Uma Vez (*At-least-once delivery*) + Consumidor Idempotente (Idempotência) |
| 6 | Com `limite-tenant/off`: Alvorada teve `{ '200': 60 }` e a Buricá esperou `6149 ms`. Com `limite-tenant/on`: Alvorada teve `{ '200': 3, '429': 57 }` (limitada a 3 requisições simultâneas) e a Buricá respondeu em `5 ms` (mediana `6 ms`, maior `69 ms`). | Sim | Noisy Neighbor (Vizinho Barulhento) + Rate Limiting / Controle de Concorrência por Tenant (Bulkhead / Quota) |
