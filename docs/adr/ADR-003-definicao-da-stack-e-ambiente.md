# ADR 003: Definição da Stack Tecnológica e Ambiente de Execução Local

* **Status:** Aceito (Accepted)
* **Data:** 08 de Outubro de 2026 (2026-10-08)
* **Autor / Decisor:** Bernardo Gabriel Baú
* **Projeto:** CardápioHub (SaaS de Cardápio Digital, Pedidos e KDS)
* **Contexto da Disciplina:** Arquitetura de Software SAAS — EC7, SETREM 2026-2 (Etapa 2: Item 2.2)

---

## 1. Contexto do Negócio e Forças Arquiteturais

A Etapa 2 do Projeto Integrador exige a entrega de **2+ serviços rodando no ambiente**, demonstrando o isolamento de tenants ao vivo e garantindo paridade com um ambiente de produção em nuvem sem acarretar custos financeiros obrigatórios para a equipe (*"nenhum caminho exige conta paga"*).

Para sustentar os requisitos operacionais do CardápioHub:
1. **Desempenho no Pico:** Atender 150 pedidos/hora na *Pizzaria Suprema Express* com latência p95 < 120 ms no cardápio e < 50 ms no KDS da cozinha.
2. **Baixo Custo Operacional (Unit Economics):** Viabilizar o plano de entrada de R$ 99,00/mês da *Lancheria Xis do Gaúcho*, onde a cota de infraestrutura não pode ultrapassar R$ 3,00/mês por tenant.
3. **Simplicidade e Reprodutibilidade Local:** O ambiente deve subir com um único comando (`docker compose up` ou manifesto Kubernetes no cluster `kind`), permitindo testes automatizados e validação contínua no pipeline.

---

## 2. Alternativas Avaliadas

### Alternativa 1: Monolito Tradicional em Python/Django ou Ruby on Rails
* **Descrição:** Aplicação única centralizando renderização de templates, processamento de tarefas via Celery/Sidekiq e persistência única.
* **Vantagens:** Desenvolvimento inicial rápido; ecossistema maduro.
* **Desvantagens:** Overhead de memória alto por processo (> 120 MB por worker ocioso); baixa eficiência de concorrência com WebSockets simultâneos necessários para as telas KDS; dificuldade de segregar o consumo de recursos entre a API de checkout e o processamento pesado de DDL.
* **Veredito:** **Rejeitada**.

### Alternativa 2: Microserviços Descentralizados com Java/Spring Boot e Kubernetes Gerenciado em Nuvem
* **Descrição:** Múltiplos microserviços granulares rodando em clusters gerenciados pagos (AWS EKS ou GCP GKE).
* **Vantagens:** Alta maturidade corporativa e isolamento extremo de processos.
* **Desvantagens:** Custo mínimo de infraestrutura proibitivo (> R$ 500,00/mês para manter o control plane gerenciado da nuvem); tempo de inicialização lento dos containers (JVM); complexidade acidental desproporcional ao estágio do produto.
* **Veredito:** **Rejeitada**.

### Alternativa 3: Arquitetura Modular em Node.js (Fastify + BullMQ) com PostgreSQL 16, Redis 7 e Orquestração Local em Kind/Docker Compose — [ESCOLHIDA]
* **Descrição:** 
  - **Backend API & WS:** Node.js 20 LTS com **Fastify**, reconhecido pelo baixíssimo overhead de roteamento (~70.000 req/s em benchmarks sintéticos), suporte nativo a schemas JSON e gateway WebSocket integrado.
  - **Worker de Segundo Plano:** Node.js 20 com **BullMQ**, operando o consumo de filas de forma desacoplada da API HTTP.
  - **Frontend:** **Next.js 14** (SSR) para o cardápio público rápido com SEO, e **React + Vite** (SPA) para o painel de gestão e KDS.
  - **Persistência:** **PostgreSQL 16** com suporte a schemas isolados e colunas `JSONB` para complementos flexíveis de cardápio.
  - **Fila e Cache:** **Redis 7 Alpine** para filas BullMQ e travas de idempotência.
  - **Ambiente de Execução:** Orquestração local via **Docker Compose** e cluster Kubernetes local **`kind` (cluster `saas`)**, com paridade de produção e custo R$ 0,00.
* **Veredito:** **Aprovada e Adotada**.

---

## 3. Decisão Arquitetural

Decidimos adotar a stack baseada no ecossistema **TypeScript/Node.js (Fastify + BullMQ)** com **PostgreSQL 16**, **Redis 7** e orquestração local via **Docker Compose** e **`kind`**.

### Especificações dos Ambientes:

1. **Ambiente Local de Desenvolvimento e Demonstração (Etapa 2):**
   - Um arquivo `docker-compose.yml` central orquestra os containers:
     - `cardapiohub-postgres`: PostgreSQL 16 com volume persistente local e inicialização de schemas;
     - `cardapiohub-redis`: Redis 7 Alpine com persistência AOF/RDB habilitada;
     - `cardapiohub-api`: Instância da API Fastify expondo porta `3001` (HTTP e WSS);
     - `cardapiohub-worker`: Instância do Worker BullMQ para processamento em background.
   - Cluster local **`kind` (`saas`)** configurado via manifests YAML para validação de deployments e services Kubernetes com zero custo de provedores em nuvem.

2. **Paridade com Produção e Custo Marginal:**
   - Em produção básica (MVP até 50 tenants), todos os containers rodam em instâncias compartilhadas (ex.: VPS Hetzner / DigitalOcean a ~R$ 45,00/mês), mantendo o custo fixo diluído por tenant em menos de **R$ 1,00/mês**, perfeitamente alinhado com o plano de R$ 99,00 do *Xis do Gaúcho*.

---

## 4. Consequências e Trade-offs

### Consequências Positivas:
* **Custo Zero na Etapa 2:** Todos os serviços sobem e comunicam-se localmente sem necessidade de cartão de crédito ou provedores pagos.
* **Throughput Extremo no KDS:** Conexões persistentes WebSocket no Fastify consomem menos de 2 MB de RAM por 1.000 sockets ociosos, permitindo telas de cozinha permanentemente ativas.
* **Reaproveitamento de Tipos (TypeScript):** Compartilhamento de contratos de DTOs e entidades entre a API, o Worker e o Frontend.

### Consequências Negativas e Mitigações:
* **Event Loop de Thread Única no Node.js:**
  - *Risco:* Processamento intensivo de CPU na API travar requisições de checkout.
  - *Mitigação:* O `API Backend & WS` não executa processamento computacional pesado de arquivos ou migrações; toda a carga DDL de `node-pg-migrate` e disparo de rede externa é delegada exclusivamente ao container `Worker de Filas`.

---

## 5. Histórico e Aprovação

* **08/10/2026:** Decisão formalizada e aceita para a entrega da Etapa 2.
* **Decisor:** Bernardo Gabriel Baú.
* **Status:** Aceito (Accepted).
