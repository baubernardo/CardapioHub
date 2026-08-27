# ADR 001: Seleção da Estratégia de Isolamento Multi-tenant (Tenancy)

* **Status:** Aceito (Accepted)
* **Data:** 27 de Agosto de 2026 (2026-08-27)
* **Autor / Decisor:** Bernardo Gabriel Baú
* **Projeto:** CardápioHub (SaaS de Cardápio Digital, Pedidos e KDS)
* **Contexto da Disciplina:** Arquitetura de Software SAAS — EC7, SETREM 2026-2

---

## 1. Contexto do Negócio e Forças Arquiteturais

O **CardápioHub** é uma plataforma SaaS projetada para atender estabelecimentos de alimentação fora do lar (food service), abrangendo desde operações enxutas locais (ex.: *Lancheria Xis do Gaúcho*, faturamento de R$ 99,00/mês e ~600 pedidos/mês) até operações de alta rotatividade e múltiplas praças (ex.: *Pizzaria Suprema Express*, faturamento de R$ 899,00/mês e ~18.000 pedidos/mês).

Para viabilizar o modelo comercial e operacional, o design de persistência precisa equilibrar cinco forças conflitantes:

1. **Isolamento e Segurança de Dados:** Estabelecimentos concorrentes operam na mesma região geográfica. Sob hipótese alguma dados de faturamento, pedidos, clientes ou comandas podem vazar entre restaurantes devido a falhas humanas em consultas SQL.
2. **Unit Economics e Viabilidade Financeira:** Com uma faixa de entrada a R$ 99,00/mês, o custo fixo de infraestrutura por tenant precisa ser marginal (< 5% do ticket). A alocação de instâncias dedicadas de banco para cada cliente inviabilizaria o produto.
3. **Onboarding Self-Service Imediato:** O cliente deve assinar no SPA web e estar com o ambiente operacional em menos de 2 minutos, sem intervenção de DBAs ou tickets manuais de suporte.
4. **Flexibilidade de Catálogo:** Cardápios possuem estruturas altamente dinâmicas (opcionais, tamanhos, ingredientes, regras de bordas recheadas e observações de preparo), demandando suporte robusto a semi-estruturados (`JSONB`).
5. **Conformidade (LGPD) e Manutenção:** Facilidade para realizar backup isolado (`dump`), restauração ou exclusão de dados por demanda legal de um restaurante específico sem afetar o cluster.

---

## 2. Alternativas Avaliadas

### Alternativa 1: Silo Físico (Database-per-tenant / Instance-per-tenant)
* **Descrição:** Cada restaurante cadastrado recebe um banco de dados PostgreSQL individual ou uma instância isolada gerenciada.
* **Vantagens:** Isolamento físico absoluto; risco nulo de vazamento de dados em queries; retenção e restauração de backups independentes; eliminação direta de ruído de vizinho no storage.
* **Desvantagens:** Custo financeiro proibitivo para planos de entrada (R$ 99/mês); consumo excessivo de memória em pools de conexão ociosos; tempo de provisionamento lento (> 5 minutos para criar novos bancos ou instâncias); sobrecarga de manutenção para rodar migrações DDL em centenas de instâncias separadas.
* **Veredito:** **Rejeitada** por inviabilizar o plano pequeno (Xis do Gaúcho).

### Alternativa 2: Pool Compartilhado com Coluna Discriminadora (Shared Database & Shared Schema)
* **Descrição:** Todos os tenants compartilham as mesmas tabelas físicas (`pedidos`, `itens`, `usuarios`), segregadas unicamente por uma coluna `tenant_id` em todas as tabelas.
* **Vantagens:** Menor custo computacional; alta densidade de tenants; provisionamento instantâneo via simples `INSERT` na tabela de tenants; uma única execução de migração DDL no deploy central.
* **Desvantagens:** Alto risco de vazamento de dados por erro de desenvolvimento (esquecimento de `WHERE tenant_id = :id` em queries complexas de KDS ou relatórios); degradação por vizinho barulhento nos mesmos índices compartilhados em noites de sexta-feira; complexidade extrema para expurgar ou restaurar a base de um único cliente que solicite exclusão via LGPD.
* **Veredito:** **Rejeitada** devido ao risco de compliance, segurança e contaminação de vizinho barulhento.

### Alternativa 3: Silo Lógico no Pool (Schema-per-tenant no PostgreSQL) — [ESCOLHIDA]
* **Descrição:** Um único cluster PostgreSQL compartilhado, contendo um schema global de governança (`public` para controle de contas, planos e faturamento) e um schema dedicado para cada restaurante cadastrado (`tenant_<id>` ou `tenant_<slug>`). A aplicação define dinamicamente o `search_path = tenant_<id>, public` por requisição ou utiliza queries qualificadas.
* **Vantagens:**
  - **Isolamento Estrutural:** Cada restaurante opera em seu namespace exclusivo de tabelas operacionais (`pedidos`, `comandas`, `itens_cardapio`, `kds_tickets`). Uma query com falha estrutural jamais acessa dados de outro schema sem qualificação explícita.
  - **Eficiência de Custos:** Múltiplos tenants compartilham o mesmo cluster PostgreSQL e buffer pool, tornando a margem de R$ 99/mês economicamente sustentável.
  - **Flexibilidade JSONB:** Colunas JSONB em esquemas segregados permitem customizações sem poluir tabelas de outros tenants.
  - **Operações Granulares de Backup e LGPD:** Suporte nativo a dumps por schema (`pg_dump -n tenant_123`) para portabilidade ou exclusão completa via `DROP SCHEMA tenant_123 CASCADE`.
  - **Provisionamento Rápido:** Comandos `CREATE SCHEMA` e execução de scripts de migração DDL levam menos de 10 segundos.
* **Desvantagens e Mitigações:**
  - *Sobrecarga de conexões:* Mitigado pelo uso de PgBouncer em modo de transação no cluster PostgreSQL.
  - *Complexidade de Migrações:* Mitigado pela automação de migrações DDL schema a schema utilizando a ferramenta especializada `node-pg-migrate`.

---

## 3. Decisão Arquitetural

Decidimos adotar a estratégia **Schema-per-tenant no PostgreSQL** como modelo oficial de multi-tenancy do **CardápioHub**.

### Especificações Técnicas de Implementação:
1. **Estrutura de Schemas:**
   - `public`: Armazena tabelas compartilhadas da plataforma SaaS (`tenants`, `assinaturas`, `usuarios_globais`, `faturas`).
   - `tenant_<id>`: Armazena tabelas operacionais isoladas (`pedidos`, `itens_cardapio`, `categorias`, `comandas`, `kds_tickets`, `historico_status`).
2. **A Máquina que Provisiona (Automação de Onboarding):**
   - O provisionamento **NÃO** é executado de forma síncrona pelo `API Backend & WS` para evitar lock da requisição HTTP.
   - O evento de confirmação de pagamento do `Gateway Pagamento` gera um job assíncrono `tenant.provision` na fila Redis (BullMQ).
   - O container **`Worker de Filas` (Node.js / BullMQ)** é a máquina responsável por consumir o job e executar:
     1. `CREATE SCHEMA tenant_<id>;` no PostgreSQL.
     2. Execução das migrações DDL via **`node-pg-migrate`** com flag `--schema=tenant_<id>`.
     3. Seed das configurações iniciais e criação do usuário gestor admin.
     4. Envio do link de primeiro acesso via `Serviço WhatsApp` / E-mail.
3. **Isolamento de Runtime nas Requisições:**
   - Cada requisição recebida pelo `API Backend & WS` passa por um middleware Fastify que decodifica o JWT do usuário, extrai o `tenant_id` e atribui a conexão do pool com `SET LOCAL search_path TO tenant_<id>, public`.

---

## 4. Consequências e Trade-offs

### Consequências Positivas:
* **Garantia de Self-service Real:** O provisionamento leva menos de 15 segundos para ser concluído pelo `Worker de Filas`, mantendo a promessa comercial de onboarding em menos de 2 minutos.
* **Defesa contra Vazamento:** Ausência de risco de queries cruzadas entre lojistas.
* **Alinhamento ao C4 Nível 2:** A arquitetura preserva as responsabilidades dos containers definidos no diagrama (API Backend, Worker de Filas, PostgreSQL e Redis).

### Consequências Negativas e Ações Futuras:
* **Volume Máximo de Schemas por Cluster:** Um cluster PostgreSQL único comporta de forma saudável centenas até ~1.500 schemas antes de sofrer pressão no catálogo interno do PostgreSQL (`pg_class`).
* **Estratégia de Expansão Futura (Degrau 4):** Quando a base ultrapassar 1.000 tenants, a arquitetura adotará sharding horizontal (múltiplos clusters PostgreSQL agrupando blocos de schemas com roteamento no catálogo global `public.tenants`).

---

## 5. Histórico e Aprovação

* **27/08/2026:** Elaboração do rascunho de trade-offs de tenancy e aprovação do modelo Schema-per-tenant.
* **Commit Git:** Registrado no repositório em 27/08/2026.
* **Status Atual:** Aprovado e integrado à arquitetura de referência do CardápioHub.
