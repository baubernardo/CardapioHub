# CardápioHub 🍔🍕

> **SaaS B2B Multi-tenant de Cardápio Digital, Pedidos e KDS (*Kitchen Display System*) em Tempo Real**

[![Projeto Integrador](https://img.shields.io/badge/Projeto%20Integrador-SETREM%202026--2-blue)](https://setrem.com.br)
[![Disciplina](https://img.shields.io/badge/Disciplina-Arquitetura%20de%20Software%20SAAS%20(8512)-green)](docs/visao.md)
[![Status](https://img.shields.io/badge/Status-Etapa%201%20%26%202%20Conclu%C3%ADdas-success)](docs/)

---

## 1. Visão Geral do Produto

O **CardápioHub** é uma plataforma SaaS desenvolvida para estabelecimentos de alimentação fora do lar (*food service*), permitindo que bares, lanchonetes e pizzarias operem seu próprio canal de autoatendimento digital sem pagar comissões predatórias a marketplaces intermediários (como os 12% a 27% do iFood).

A plataforma oferece cardápio web rápido para o cliente final, checkout automatizado com Pix dinâmico e envio instantâneo de comandas para a tela da cozinha (**KDS**) via WebSockets (< 30 ms), garantindo que estabelecimentos concorrentes da mesma praça tenham seus dados estruturalmente isolados através do modelo **Schema-per-tenant no PostgreSQL**.

---

## 2. Mapa da Documentação (`docs/`)

Toda a documentação arquitetural do projeto está estritamente versionada na pasta [`docs/`](docs/), atendendo integralmente aos critérios do **Guia do Projeto Integrador**:

### 🏛️ Etapa 1 — Proposta de Arquitetura (26/09/2026)
* 📄 **[Visão do Produto (`docs/visao.md`)](docs/visao.md):** Problema, proposta de valor, limites de escopo e dimensionamento dos dois tenants de referência (*Lancheria Xis do Gaúcho* vs. *Pizzaria Suprema Express*).
* 🗺️ **[Diagramas C4 (`docs/c4/`)](docs/c4/):**
  * **[Nível 1: Contexto do Sistema](docs/c4/nivel-1-contexto.md)** ([Visualizador HTML](docs/c4/diagrama.html))
  * **[Nível 2: Containers do Sistema](docs/c4/nivel-2-containers.md)** ([Visualizador HTML](docs/c4/Diagrama_C4_Nivel2-Containers.html))
  * **[Nível 3: Componentes Críticos (API e Worker)](docs/c4/nivel-3-componentes.md)**
* 📐 **[Atributos de Qualidade (`docs/atributos.md`)](docs/atributos.md):** Quatro cenários estímulo-resposta mensuráveis com métricas matemáticas (latência p95 < 120 ms no pico, isolamento de vizinho barulhento, provisionamento em < 15 s e zero duplicatas).
* 🛡️ **[Mapeamento LGPD Preliminar (`docs/lgpd.md`)](docs/lgpd.md):** Inventário de dados pessoais por tenant, bases legais (Art. 7 LGPD), medidas técnicas por camada e protocolo de expurgo atômico.

### ⚙️ Etapa 2 — Núcleo Multi-Tenant (01/10 & 08/10/2026)
* 🧩 **[Mapa de Contextos DDD (`docs/contextos.md`)](docs/contextos.md):** Linguagem ubíqua, 5 Bounded Contexts e Context Map (Upstream/Downstream, Customer/Supplier, Anti-Corruption Layer) alinhados ao Encontro 08.
* 📋 **Architectural Decision Records (ADRs) (`docs/adr/`):**
  * **[ADR 001: Modelo de Tenancy](docs/adr/ADR-001-modelo-de-tenancy.md):** Decisão fundamentada pelo modelo *Schema-per-tenant no PostgreSQL*, comparando Silo Físico vs. Pool Compartilhado com números reais.
  * **[ADR 002: Estratégia de Comunicação entre Serviços](docs/adr/ADR-002-estrategia-de-comunicacao-entre-servicos.md):** Decisão pela comunicação mista (Síncrono HTTP/WS no Core + Filas Redis 7 / BullMQ com barreiras de idempotência em 3 níveis), resolvendo as falhas do Caso 09.
  * **[ADR 003: Stack Tecnológica e Ambiente de Execução](docs/adr/ADR-003-definicao-da-stack-e-ambiente.md):** Definição de Node.js (Fastify + BullMQ), Next.js 14, PostgreSQL 16, Redis 7 e orquestração local em Docker Compose / Kind com custo R$ 0,00.
  * **[ADR 004: Autenticação e Resolução de Tenant](docs/adr/ADR-004-estrategia-de-autenticacao-e-resolucao-de-tenant.md):** Isolamento de runtime via JWT RBAC e injeção dinâmica de `SET LOCAL search_path` por conexão.
* 🤖 **[Declaração de Uso de IA (`docs/uso-de-ia.md`)](docs/uso-de-ia.md):** Transparência do uso de Inteligência Artificial conforme exigência da Seção 3 do Guia.

---

## 3. Os Dois Tenants de Referência

| Campo | Tenant Pequeno (Interior) | Tenant Grande (Capital) |
| :--- | :--- | :--- |
| **Nome Fantasia** | **Lancheria Xis do Gaúcho** | **Pizzaria Suprema Express** |
| **Cidade / UF** | Horizontina - RS | Porto Alegre - RS |
| **Plano Mensal** | Básico (R$ 99,00 / mês) | Pro (R$ 899,00 / mês) |
| **Volume Central** | **600 pedidos / mês** (~20 ped/dia) | **18.000 pedidos / mês** (~600 ped/dia) |
| **Pico Operacional** | Sexta/Sábado: ~12 pedidos/hora | Sexta/Sábado: **150 pedidos/hora** |
| **Usuários** | 3 (1 caixa, 2 cozinheiros) | 45 (múltiplos caixas e telas KDS) |

---

## 4. Como Executar o Ambiente Local (2+ Serviços)

O ambiente da Etapa 2 roda integralmente em containers sem custo de provedor em nuvem:

### Pré-requisitos:
* Docker e Docker Compose instalados.

### Inicialização Rápida:
```bash
# 1. Clone o repositório
git clone https://github.com/baubernardo/CardapioHub.git
cd CardapioHub

# 2. Suba os containers locais
docker compose up -d
```

### Containers em Execução:
1. **`cardapiohub-postgres`:** PostgreSQL 16 com o schema global `public` e schemas isolados dos tenants de teste (`tenant_xis_gaucho` e `tenant_suprema_express`);
2. **`cardapiohub-redis`:** Redis 7 com persistência para enfileiramento BullMQ e idempotência;
3. **`cardapiohub-api`:** Serviço 1 — API Backend e WebSocket Gateway (porta 3001);
4. **`cardapiohub-worker`:** Serviço 2 — Worker de processamento assíncrono BullMQ.

### Verificação do Isolamento de Tenants:
Para comprovar que o Tenant A não enxerga dados do Tenant B:
```bash
# Consulta ao schema do Tenant Pequeno (Xis do Gaúcho)
docker exec -it cardapiohub-postgres psql -U cardapio_admin -d cardapiohub_db -c "SELECT * FROM tenant_xis_gaucho.pedidos;"

# Consulta ao schema do Tenant Grande (Suprema Express)
docker exec -it cardapiohub-postgres psql -U cardapio_admin -d cardapiohub_db -c "SELECT * FROM tenant_suprema_express.pedidos;"
```

---

## 5. Autor e Identificação Acadêmica

* **Estudante / Decisor:** Bernardo Gabriel Baú
* **Contato Institucional:** baubernardo@gmail.com
* **Professor Avaliador:** Prof. Jonas (jonasrpacheco86)
* **Instituição:** Sociedade Educacional Três de Maio (SETREM) — Curso de Engenharia de Computação (EC7)
