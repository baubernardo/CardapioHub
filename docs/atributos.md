# Atributos de Qualidade — CardápioHub

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Item 1.4 da Etapa 1 e Item 3.4 da Etapa 3 do Guia do Projeto Integrador

---

## 1. Diretriz: "Número Vence Adjetivo"

Conforme preconizado pela disciplina, atributos como *"rápido"*, *"escalável"* e *"seguro"* não possuem valor arquitetural sem metas mensuráveis. Todos os cenários abaixo utilizam o formato canônico: **Fonte → Estímulo → Artefato → Ambiente → Resposta → Medida de Resposta**, baseados nos dados reais dos dois tenants de referência:
* **Tenant Pequeno:** *Lancheria Xis do Gaúcho* (600 pedidos/mês, ~20 pedidos/dia, R$ 99,00/mês);
* **Tenant Grande:** *Pizzaria Suprema Express* (18.000 pedidos/mês, ~600 pedidos/dia, pico de 150 pedidos/hora, R$ 899,00/mês).

---

## 2. Cenários de Qualidade Mensuráveis

### Cenário 1: Desempenho / Latência de Checkout no Horário de Pico
* **Fonte do estímulo:** Clientes finais realizando checkout simultâneo no cardápio web.
* **Estímulo:** Rajada de 150 pedidos/hora na *Pizzaria Suprema Express* na noite de sexta-feira (concentrando até 5 pedidos/minuto em intervalos de rajada de 10 segundos).
* **Artefato afetado:** `API Backend & WS` e schema `tenant_<id>` no PostgreSQL.
* **Ambiente:** Operação normal em regime de pico, conexões persistentes de WebSocket ativas com a cozinha.
* **Resposta do sistema:** O sistema valida itens do cardápio, calcula totais com adicionais JSONB, persiste o pedido no schema do lojista e gera a chave Pix Copia-e-Cola.
* **Medida de Resposta (Métrica Mensurável):**
  - **Latência p95 < 120 ms** e **p99 < 250 ms** para a resposta HTTP `201 Created` entregue ao navegador do cliente;
  - **Taxa de erro HTTP 5xx = 0,0%**.

$$\text{SLO}_{\text{checkout}} = \frac{\text{Requisições de Checkout com } t \le 120\text{ ms}}{\text{Total de Requisições de Checkout válidas}} \ge 99{,}5\%$$

---

### Cenário 2: Resiliência e Isolamento contra "Vizinho Barulhento"
* **Fonte do estímulo:** Tenant de grande porte disparando lote maciço de operações assíncronas.
* **Estímulo:** A *Pizzaria Suprema Express* avança 80 comandas em lote, enfileirando simultaneamente mais de 400 jobs de disparo de WhatsApp e webhooks de painel de senhas no Redis.
* **Artefato afetado:** `Fila de Mensagens` (Redis 7) e `Worker de Filas` (BullMQ).
* **Ambiente:** Dependência externa de WhatsApp (Evolution API) sofrendo lentidão transitória (latência de resposta externa entre 3 e 6 segundos).
* **Resposta do sistema:** O rate-limiter por tenant do BullMQ (`limiter: { max: 100, duration: 60000 }`) restringe a concorrência do tenant grande, reservando capacidade de processamento imediata para os demais tenants.
* **Medida de Resposta (Métrica Mensurável):**
  - Os jobs de notificação da *Lancheria Xis do Gaúcho* são consumidos e despachados em **tempo total de fila < 3,0 segundos para 95% das ocorrências**, sem sofrer represamento pela carga da pizzaria;
  - Utilização de memória do Redis mantida abaixo de 75% da cota configurada (150 MB).

$$\text{Fairness}_{\text{delay}} = t_{\text{consumo (tenant pequeno)}} \le 3{,}0\text{ s em } 95\%\text{ dos jobs}$$

---

### Cenário 3: Elasticidade e Provisionamento Self-Service de Novos Tenants
* **Fonte do estímulo:** Novo gestor de restaurante assinando a plataforma via landing page.
* **Estímulo:** Emissão de webhook HTTP de pagamento aprovado pelo Gateway de Pagamento.
* **Artefato afetado:** `API Backend & WS`, Fila BullMQ `tenants.provision`, `Worker de Filas` e banco PostgreSQL.
* **Ambiente:** Cluster PostgreSQL operando em produção com centenas de schemas já ativos.
* **Resposta do sistema:** O worker consome o job assíncrono, executa `CREATE SCHEMA tenant_<id>`, roda o runner do `node-pg-migrate` com as migrações DDL completas, insere dados iniciais (seed), cria o usuário Gestor Admin e despacha as credenciais via WhatsApp e e-mail.
* **Medida de Resposta (Métrica Mensurável):**
  - Tempo de execução técnica do provisionamento no Worker **menor que 15 segundos** (p95);
  - Tempo total percebido pelo lojista (da tela de checkout até receber o link de primeiro acesso no WhatsApp) **menor que 2 minutos** (120 segundos), sem intervenção humana de suporte técnico.

$$\text{Tempo}_{\text{provisionamento}} = t_{\text{DDL migrations}} \le 15\text{ s}$$

---

### Cenário 4: Integridade e Idempotência contra Reprocessamento
* **Fonte do estímulo:** Cliente final clicando repetidamente no botão "Pagar" durante oscilação de 3G/4G, ou Gateway reenviando o mesmo webhook de pagamento por timeout transitório.
* **Estímulo:** 5 requisições de criação de pedido ou webhooks idênticos chegando com intervalo de milissegundos.
* **Artefato afetado:** Interceptor de Idempotência da `API Backend & WS`, chave `SETNX` no Redis e constraint SQL no PostgreSQL.
* **Ambiente:** Operação concorrente com múltiplas réplicas da API.
* **Resposta do sistema:** Apenas a primeira requisição adquire a trava de processamento; as requisições subsequentes são barradas ou recebem a resposta já consolidada em cache.
* **Medida de Resposta (Métrica Mensurável):**
  - **Zero cobranças Pix duplicadas** (0,0%);
  - **Zero tickets repetidos no KDS da cozinha** (0,0%);
  - **Zero mensagens redundantes no WhatsApp do consumidor** (0,0%), eliminando completamente o erro das 62 duplicatas registrado no Caso 09.

$$\text{Taxa de Duplicação} = \frac{\text{Pedidos ou Tickets Duplicados}}{\text{Total de Transações}} = 0{,}0\%$$

---

## 3. Matriz de Rastreabilidade com os Componentes C4

| Cenário | Atributo Principal | Componentes C4 Críticos | Solução Arquitetural Aplicada |
| :--- | :--- | :--- | :--- |
| **Cenário 1** | Desempenho / Latência | `API Backend & WS`, PostgreSQL | Schema-per-tenant, connection pool Fastify, queries indexadas e JSONB. |
| **Cenário 2** | Resiliência / Disponibilidade | `Worker de Filas`, Redis 7 | BullMQ rate limiting por tenant, desacoplamento assíncrono e Dead Letter Queue (DLQ). |
| **Cenário 3** | Elasticidade / Usabilidade | `Worker de Filas`, `node-pg-migrate` | Automação DDL assíncrona orientada a jobs, eliminando locks síncronos na API. |
| **Cenário 4** | Integridade / Confiabilidade | `API Backend & WS`, Redis, PostgreSQL | `X-Idempotency-Key` (UUID), `SETNX` com TTL no Redis, `UNIQUE constraint` no banco e `jobId` determinístico. |
