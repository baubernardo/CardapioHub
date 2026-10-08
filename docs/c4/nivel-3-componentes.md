# C4 Model — Nível 3: Diagrama de Componentes (Componentes Críticos)

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Escopo:** Decomposição interna dos dois serviços de backend da Etapa 2 (`API Backend & WS` e `Worker de Filas`)

---

## 1. Componentes da `API Backend & WS` (Node.js / Fastify)

A `API Backend & WS` é o ponto de entrada síncrono para o tráfego HTTP e conexões persistentes WebSocket.

```mermaid
flowchart TD
    subgraph Clients["Entrada Externa"]
        HTTPReq["Requisições HTTP (REST)"]
        WSConn["Conexões WebSocket (WSS)"]
    end

    subgraph APIContainer["Container: API Backend & WS (Node.js / Fastify)"]
        Server["Fastify Server Core"]
        AuthMiddleware["Tenant & Auth Resolver Middleware<br/><i>(Extrai tenant_id do JWT e seta search_path)</i>"]
        IdempotencyInterceptor["Idempotency Interceptor<br/><i>(Verifica chave X-Idempotency-Key no Redis)</i>"]
        
        OrderController["OrderController<br/><i>(Validação de payload e rotas de checkout)</i>"]
        OrderService["OrderService<br/><i>(Regras de negócio, cálculo de totais)</i>"]
        
        WebhookController["PaymentWebhookController<br/><i>(Recepção de webhooks do Gateway)</i>"]
        
        WSGateway["WebSocket Gateway<br/><i>(Broadcast de novos pedidos para telas KDS)</i>"]
        
        QueueProducer["QueueProducer (BullMQ Client)<br/><i>(Enfileira jobs no Redis)</i>"]
        TenantRepository["TenantRepository (PgBouncer/Postgres Pool)<br/><i>(Executa queries qualificadas no schema)</i>"]
    end

    subgraph Infra["Infraestrutura de Dados"]
        Redis["Fila Redis 7"]
        Postgres["PostgreSQL 16"]
    end

    HTTPReq --> Server
    WSConn --> WSGateway
    Server --> AuthMiddleware
    AuthMiddleware --> IdempotencyInterceptor
    IdempotencyInterceptor --> OrderController
    IdempotencyInterceptor --> WebhookController

    OrderController --> OrderService
    OrderService --> TenantRepository
    OrderService --> QueueProducer
    OrderService --> WSGateway

    WebhookController --> QueueProducer

    QueueProducer -->|"Enfileira jobs assíncronos"| Redis
    TenantRepository -->|"SET LOCAL search_path; Queries SQL"| Postgres
    IdempotencyInterceptor -->|"SETNX chave"| Redis
```

### Componentes Internos e Responsabilidades:
1. **`Tenant & Auth Resolver Middleware`:** Intercepta todas as requisições autenticadas, decodifica o JWT, valida a assinatura e extrai o `tenant_id`. No momento de checkout público, resolve o tenant pelo header `X-Tenant-Domain` ou path. Configura na conexão do pool: `SET LOCAL search_path TO tenant_<id>, public;`.
2. **`Idempotency Interceptor`:** Consulta atômica via `SETNX` no Redis. Bloqueia requisições duplicadas de checkout antes de atingir o banco de dados.
3. **`OrderController` & `OrderService`:** Valida a integridade dos itens em relação ao cardápio ativo, calcula adicionais JSONB e persiste a transação.
4. **`WebSocket Gateway`:** Mantém o pool de conexões com os navegadores do KDS na cozinha. Quando um pedido é confirmado, emite um evento no canal do tenant (`room:tenant_<id>:kds`).
5. **`QueueProducer`:** Encapsula a biblioteca BullMQ, inserindo jobs nas filas correspondentes com `jobId` determinístico.

---

## 2. Componentes do `Worker de Filas` (Node.js / BullMQ)

O `Worker de Filas` é a máquina assíncrona responsável pelo processamento pesado, DDL e integrações com terceiros.

```mermaid
flowchart TD
    subgraph QueueSource["Origem de Mensagens"]
        RedisSource["Fila Redis 7 (BullMQ Queues)"]
    end

    subgraph WorkerContainer["Container: Worker de Filas (Node.js)"]
        WorkerManager["BullMQ Worker Supervisor<br/><i>(Gerencia pools de consumidores por fila)</i>"]
        
        subgraph Processors["Processadores Especializados de Jobs"]
            TenantProvisioner["TenantProvisioningProcessor<br/><i>(Roda CREATE SCHEMA e node-pg-migrate)</i>"]
            PaymentProcessor["PaymentSettlementProcessor<br/><i>(Baixa de pedidos e transição de status)</i>"]
            WhatsAppNotifier["WhatsAppNotificationProcessor<br/><i>(Envio de mensagens c/ retry e backoff)</i>"]
            WebhookDispatcher["WebhookDispatcherProcessor<br/><i>(Emissão de webhooks externos - C3)</i>"]
        end

        DLQHandler["Dead Letter Queue (DLQ) Handler<br/><i>(Move falhas após 3 tentativas e alerta)</i>"]
        DBClient["Database DDL/DML Client<br/><i>(Conexão PostgreSQL)</i>"]
    end

    subgraph Destinations["Destinos Externos e Persistência"]
        PostgresTarget["PostgreSQL 16"]
        WppAPI["Evolution API / WhatsApp"]
        ExternalWebhooks["Sistemas dos Restaurantes (Painel de Senhas)"]
    end

    RedisSource --> WorkerManager
    WorkerManager --> TenantProvisioner
    WorkerManager --> PaymentProcessor
    WorkerManager --> WhatsAppNotifier
    WorkerManager --> WebhookDispatcher

    TenantProvisioner -->|"CREATE SCHEMA + DDL migrations"| PostgresTarget
    PaymentProcessor -->|"UPDATE pedidos SET status = 'PAGO'"| PostgresTarget
    WhatsAppNotifier -->|"POST /messages/send (HTTPS)"| WppAPI
    WebhookDispatcher -->|"POST /api/webhook (HTTPS)"| ExternalWebhooks

    WhatsAppNotifier -.->|"Falha após 3 retries"| DLQHandler
    WebhookDispatcher -.->|"Falha após 2 retries"| DLQHandler
```

### Componentes Internos e Responsabilidades:
1. **`TenantProvisioningProcessor`:** Consome o job `tenants.provision`, conecta ao PostgreSQL como superusuário de aplicação e executa:
   - `CREATE SCHEMA tenant_<id>;`
   - Runner do **`node-pg-migrate`** com flag `--schema=tenant_<id>` aplicando todas as migrações DDL isoladas;
   - Script de seed base do catálogo e criação do primeiro usuário administrador.
2. **`PaymentSettlementProcessor`:** Recebe o payload do webhook do Gateway, atualiza o status do pedido para `PAGO` e dispara evento de novo ticket para a cozinha.
3. **`WhatsAppNotificationProcessor`:** Envia mensagens pelo endpoint da Evolution API. Implementa política de retry (3 tentativas) com backoff exponencial e jitter.
4. **`DLQ Handler`:** Encaminha jobs esgotados para a Dead Letter Queue com log detalhado e preservação do payload para auditoria humana no dashboard `Bull-Board`.
