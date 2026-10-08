# C4 Model — Nível 2: Diagrama de Containers

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Visualização Gráfica Interativa:** [Diagrama_C4_Nivel2-Containers.html](file:///Users/bernardobau/01-Codes/CardapioHub/docs/c4/Diagrama_C4_Nivel2-Containers.html)

---

## 1. Diagrama de Containers (Mermaid)

```mermaid
flowchart TD
    subgraph Atores["Usuários"]
        Cliente["👤 Cliente Final"]
        Gestor["👤 Gestor / Dono"]
        Cozinha["👤 Operação KDS"]
    end

    subgraph CardapioHubBoundary["Fronteira do Sistema: CardápioHub"]
        subgraph Frontends["Camada de Interface Web"]
            CardapioWeb["🌐 Cardápio Web<br/><i>[Container: Next.js / SSR]</i><br/>Catálogo público ultra-rápido com SEO e visualização mobile first."]
            PainelGestao["🖥️ Painel Gestão & KDS<br/><i>[Container: React + Vite / SPA]</i><br/>Interface administrativa e tela de produção da cozinha em tempo real."]
        end

        subgraph Backends["Camada de Serviços de Backend (2+ Serviços)"]
            APIBackend["⚙️ API Backend & WS<br/><i>[Container: Node.js / Fastify / WS]</i><br/>Autenticação JWT, resolução multi-tenant de schemas, validação transacional e WebSocket Gateway."]
            WorkerFilas["⚡ Worker de Filas<br/><i>[Container: Node.js / BullMQ]</i><br/>Processador assíncrono: provisionamento de schemas, liquidações, notificações e webhooks."]
        end

        subgraph Armazenamento["Camada de Persistência e Mensageria"]
            PostgreSQL[("🗄️ Banco de Dados<br/><i>[Container: PostgreSQL 16 + JSONB]</i><br/>Schema central 'public' e schemas isolados 'tenant_<id>' para dados operacionais.")]
            RedisQueue[("📦 Fila de Mensagens & Cache<br/><i>[Container: Redis 7]</i><br/>Fila distribuída BullMQ, locks de idempotência e cache temporário.")]
        end
    end

    subgraph Externos["Sistemas Externos"]
        Gateway["💳 Gateway Pagamento<br/><i>[API Pix / Cartão]</i>"]
        WhatsApp["💬 Serviço WhatsApp<br/><i>[Evolution / Twilio API]</i>"]
    end

    %% Relacionamentos
    Cliente -->|"Acessa cardápio e faz pedidos<br/>[HTTPS]"| CardapioWeb
    Gestor -->|"Administra catálogo e planos<br/>[HTTPS]"| PainelGestao
    Cozinha -->|"Recebe comandas e altera status<br/>[WSS]"| PainelGestao

    CardapioWeb -->|"Cria pedidos e consulta catálogo<br/>[HTTPS / REST]"| APIBackend
    PainelGestao -->|"Gerencia dados e conecta WebSocket<br/>[HTTPS / WSS]"| APIBackend

    APIBackend -->|"Lê e escreve dados no schema do tenant<br/>[TCP / SQL]"| PostgreSQL
    APIBackend -->|"Enfileira jobs e valida idempotência (SETNX)<br/>[TCP / RESP]"| RedisQueue

    WorkerFilas -->|"Consome jobs das filas BullMQ<br/>[TCP / RESP]"| RedisQueue
    WorkerFilas -->|"Atualiza pedidos e roda migrações DDL<br/>[TCP / SQL]"| PostgreSQL
    WorkerFilas -->|"Dispara notificações de status<br/>[HTTPS / REST]"| WhatsApp
    WorkerFilas -->|"Emite webhooks de integração (C3)<br/>[HTTPS / POST]"| Gestor

    Gateway -->|"Notifica confirmação de Pix via Webhook<br/>[HTTPS]"| APIBackend
```

---

## 2. Especificação Técnica dos Containers

| Container | Tecnologia | Papel Arquitetural | Estratégia de Isolamento Multi-tenant |
| :--- | :--- | :--- | :--- |
| **Cardápio Web** | Next.js 14 (SSR / React) | Aplicação web pública voltada ao consumidor final. Renderiza o cardápio com baixa latência, suporte a SEO e checkout. | Identifica o restaurante através do subdomínio ou path (`/restaurante-slug`). |
| **Painel Gestão & KDS** | React 18 + Vite (SPA) | Aplicação web administrativa e tela de produção da cozinha. Conecta via WebSockets para feedback em tempo real. | JWT assinado contendo `tenant_id` e permissões de acesso (`ADMIN`, `CAIXA`, `COZINHA`). |
| **API Backend & WS** | Node.js 20 + Fastify + WS | Serviço HTTP REST e WebSocket Gateway. É a porta de entrada síncrona para todas as mutações e leituras. | Middleware Fastify extrai `tenant_id` do JWT e aplica `SET LOCAL search_path = tenant_<id>, public` por requisição. |
| **Worker de Filas** | Node.js 20 + BullMQ | Serviço de segundo plano responsável por drenar filas, provisionar novos tenants (`node-pg-migrate`) e executar I/O bloqueante. | Conecta ao PostgreSQL com privilégios de DDL e executa migrações direcionadas ao schema específico (`--schema=tenant_<id>`). |
| **Banco de Dados** | PostgreSQL 16 + JSONB | Armazenamento relacional e semi-estruturado. Suporta colunas JSONB para itens opcionais dinâmicos. | **Schema-per-tenant:** `public` para governança SaaS; `tenant_<id>` para tabelas operacionais isoladas. |
| **Fila de Mensagens** | Redis 7 Alpine | Gerenciamento de filas BullMQ, cache de idempotência com TTL e pub/sub de eventos internos. | Prefixos de chaves delimitados por tenant (`idempotency:{tenant_id}:{key}`). |

---

## 3. Limites de Tenant e Comunicação (Aderência à Etapa 2)

* **Dois Serviços de Backend Mapeados:** `API Backend & WS` e `Worker de Filas` operam como processos desacoplados, cumprindo o requisito de "2+ serviços" da Etapa 2.
* **Comunicação Justificada:** Conforme formalizado no [ADR-002](file:///Users/bernardobau/01-Codes/CardapioHub/docs/adr/ADR-002-estrategia-de-comunicacao-entre-servicos.md), a comunicação entre eles é assíncrona orientada a filas através do Redis 7 (BullMQ), eliminando o risco de colapso de requisições síncronas observado no Caso 09.
