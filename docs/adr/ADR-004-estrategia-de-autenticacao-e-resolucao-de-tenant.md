# ADR 004: Estratégia de Autenticação, Autorização e Resolução de Tenant em Runtime

* **Status:** Aceito (Accepted)
* **Data:** 08 de Outubro de 2026 (2026-10-08)
* **Autor / Decisor:** Bernardo Gabriel Baú
* **Projeto:** CardápioHub (SaaS de Cardápio Digital, Pedidos e KDS)
* **Contexto da Disciplina:** Arquitetura de Software SAAS — EC7, SETREM 2026-2 (Etapa 2: Item 2.3)

---

## 1. Contexto do Negócio e Forças Arquiteturais

Na arquitetura multi-tenant do CardápioHub, a camada de banco de dados utiliza o modelo **Schema-per-tenant no PostgreSQL** ([ADR-001](file:///Users/bernardobau/01-Codes/CardapioHub/docs/adr/ADR-001-modelo-de-tenancy.md)). No entanto, o isolamento estrutural de schemas no banco não é suficiente se a camada de aplicação (`API Backend & WS`) falhar em resolver o contexto do tenant ou se uma sessão de usuário puder forjar o acesso a dados de outro restaurante.

Para a demonstração do núcleo multi-tenant da Etapa 2, é obrigatório garantir:
1. **Isolamento de Runtime na Camada de API:** Uma requisição vinda de um garçom ou gestor da *Lancheria Xis do Gaúcho* (`tenant_01`) jamais pode ler ou gravar no schema da *Pizzaria Suprema Express* (`tenant_02`).
2. **Resolução de Contexto Transparente:** Os desenvolvedores não devem ter que passar o schema manualmente em cada query SQL ou arriscar esquecer filtros de segurança.
3. **Controle de Acesso Baseado em Função (RBAC):** Restringir o acesso a funcionalidades críticas (ex.: relatórios financeiros apenas para `ADMIN`; telas de cozinha restritas a `COZINHA`).
4. **Desempenho:** A validação do tenant e autorização não pode adicionar mais de 5 ms de overhead no ciclo de vida da requisição HTTP Fastify.

---

## 2. Alternativas Avaliadas

### Alternativa 1: Resolução por Parâmetro em Query SQL (Where Tenant ID com Conexão Estática)
* **Descrição:** A API opera com uma única conexão geral e todas as queries utilizam `WHERE tenant_id = :id`.
* **Vantagens:** Abordagem comum em frameworks legados.
* **Desvantagens:** Alto risco de erro humano em queries complexas; não utiliza o isolamento de schemas adotado no ADR-001; vulnerável a vazamentos graves em caso de falha de desenvolvimento.
* **Veredito:** **Rejeitada**.

### Alternativa 2: Múltiplos Pools de Conexão Isolados por Tenant no Node.js
* **Descrição:** A API mantém uma instância separada de pool de banco de dados (`new Pool()`) para cada restaurante cadastrado.
* **Vantagens:** Isolamento rígido de conexões.
* **Desvantagens:** Esgotamento imediato de sockets e conexões no PostgreSQL compartilhado; se 200 tenants estiverem cadastrados, 200 pools com 5 conexões consumiriam 1.000 conexões de banco, esgotando a memória RAM do cluster.
* **Veredito:** **Rejeitada**.

### Alternativa 3: Token JWT Criptográfico + Middleware Fastify com `SET LOCAL search_path` — [ESCOLHIDA]
* **Descrição:** 
  1. A autenticação emite um token JWT (HMAC-SHA256) assinado com segredo do servidor, contendo no payload: `sub` (id do usuário), `tenant_id` (UUID do restaurante) e `role` (`ADMIN`, `OPERADOR`, `COZINHA`).
  2. Um middleware Fastify (`TenantResolverMiddleware`) intercepta cada requisição:
     - Em rotas protegidas (Painel e KDS): decodifica o JWT e valida o `tenant_id`.
     - Em rotas públicas do Cardápio: extrai o tenant através do subdomínio ou cabeçalho `X-Tenant-Slug`.
  3. No momento de adquirir uma conexão do pool compartilhado (`pg.connect()`), a transação executa imediatamente:
     ```sql
     SET LOCAL search_path TO tenant_<id>, public;
     ```
  4. Quaisquer consultas SQL subsequentes daquela transação são automaticamente confinadas ao schema `tenant_<id>`. Ao devolver a conexão ao pool, o `SET LOCAL` é resetado automaticamente pelo PostgreSQL.
* **Veredito:** **Aprovada e Adotada**.

---

## 3. Decisão Arquitetural e Especificações Técnicas

Decidimos adotar a **Resolução Dinâmica de Tenant por Middleware Fastify com Injeção de `search_path` e Autorização RBAC via JWT**.

### 3.1. Estrutura do Payload JWT:
```json
{
  "sub": "usr_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "tenant_id": "tenant_suprema_express",
  "tenant_schema": "tenant_a1b2c3",
  "role": "COZINHA",
  "iat": 1791501600,
  "exp": 1791502500
}
```

### 3.2. Fluxo do Middleware Fastify (`onRequest` Hook):
1. **Verificação de Integridade:** Valida a assinatura do JWT. Se ausente em rota privada, retorna `401 Unauthorized`.
2. **Definição de Contexto:** Injeta o objeto `request.tenant` no escopo da requisição.
3. **Escopo do Banco de Dados:** Todas as operações de leitura/escrita utilizam o helper transacional:
   ```typescript
   await db.transaction(async (client) => {
     await client.query(`SET LOCAL search_path TO ${request.tenant.schema}, public;`);
     return await client.query('SELECT * FROM pedidos WHERE status = $1', ['EM_PREPARO']);
   });
   ```
4. **Isolamento de WebSockets:** No handshake do WebSocket (`wss://`), o token é validado e o socket é ingressado exclusivamente na sala `room:${tenant_id}:kds`. Mensagens emitidas para o tenant A jamais trafegam nos sockets do tenant B.

---

## 4. Consequências e Trade-offs

### Consequências Positivas:
* **Garantia de Isolamento Demonstrável ao Vivo (Etapa 2):** Mesmo que um usuário mal-intencionado force parâmetros de URLs de outro restaurante, o `search_path` ativo no PostgreSQL impede que a consulta encontre registros fora do seu schema.
* **Conexões Eficientes:** O pool de conexões do PostgreSQL permanece enxuto e compartilhado (gerenciado com PgBouncer se necessário), sem o desperdício de pools individuais.
* **Latência Mínima:** A decodificação JWT in-memory consome menos de 0,5 ms de CPU por requisição.

### Consequências Negativas e Ações Mitigadoras:
* **Risco de Vazamento em Conexões Reutilizadas:**
  - *Risco:* Uma conexão retornar ao pool sem resetar o `search_path`, herdando o schema da requisição anterior.
  - *Mitigação:* Uso obrigatório do modificador `LOCAL` (`SET LOCAL search_path`), que faz o PostgreSQL reverter as alterações automaticamente ao término do bloco de transação (`COMMIT` / `ROLLBACK`).

---

## 5. Histórico e Aprovação

* **08/10/2026:** Decisão formalizada para a implementação e defesa técnica do núcleo multi-tenant da Etapa 2.
* **Decisor:** Bernardo Gabriel Baú.
* **Status:** Aceito (Accepted).
