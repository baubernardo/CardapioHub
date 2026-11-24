# Verificação de Segurança e Pipeline — CardápioHub

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Entregável 3.5 da Etapa 3 (Encontro 16 — `lab15-seguranca-e-pipeline.md` e `roteiro-seguranca-semana-enc16.md`)

---

## 1. O Portão do Pipeline (Execução Verde e Execução Vermelha)

Conforme demonstrado no Bloco 7 do Encontro 16 (*"Portão que nunca fechou é decoração"*), o workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) executa a suíte de testes de unidade, sobe o produto completo via Docker Compose numa máquina limpa do GitHub Actions (`ubuntu-latest`) e executa os testes automatizados de isolamento multi-tenant (`testes/isolamento.test.js`) e integração (`testes/integracao.test.js`).

Para provar que o portão fecha quando o isolamento entre tenants é quebrado, criamos a branch de demonstração `demo/isolamento-quebrado`, na qual o hook `preHandler` da API foi alterado de propósito para fixar todas as leituras no schema `tenant_xis_gaucho` (simulando um erro de filtro/resolução de tenant).

| Execução | Branch | O que mudou no código | Resultado no GitHub Actions | Evidência / Link |
|---|---|---|---|---|
| **Tronco principal** | `main` | Isolamento ativo por `SET LOCAL search_path TO tenant_<id>, public` (ADR-001 e ADR-004) | **✓ Verde** (todos os testes de unidade, integração e isolamento passam) | [Ver Actions da `main`](https://github.com/baubernardo/CardapioHub/actions/workflows/ci.yml?query=branch%3Amain) |
| **Ciclo TDD** | `tdd-cota` | 4 pares de commits `red:` / `green:` + `refactor:` das regras de taxa e cota | **✓ Verde** | [Ver Actions da `tdd-cota`](https://github.com/baubernardo/CardapioHub/actions/workflows/ci.yml?query=branch%3Atdd-cota) |
| **Quebra proposital de isolamento** | `demo/isolamento-quebrado` | Remoção proposital da resolução dinâmica de schema por tenant no `GET /api/v1/orders` | **✗ Vermelho** (`VAZAMENTO CRÍTICO: Pizzaria Suprema Express viu o pedido que pertence a Lancheria Xis do Gaúcho!`) | [Ver execução vermelha da `demo/isolamento-quebrado`](https://github.com/baubernardo/CardapioHub/actions/workflows/ci.yml?query=branch%3Ademo%2Fisolamento-quebrado) |

### Trecho da falha capturada pelo teste de isolamento (`testes/isolamento.test.js`):
```text
✖ Pizzaria Suprema Express não vê pedido criado na Lancheria Xis do Gaúcho
  AssertionError [ERR_ASSERTION]: VAZAMENTO CRÍTICO: Pizzaria Suprema Express viu o pedido que pertence a Lancheria Xis do Gaúcho!
  actual: true
  expected: false
```

---

## 2. Auditoria de Rotas e Autorização por Tenant (OWASP Top 10:2025 — A01 Broken Access Control)

Tabela de todas as rotas expostas pela `cardapiohub-api` (`api/src/index.ts`) e como o isolamento de tenant é garantido em duas camadas (aplicação + banco):

| Rota | Método | Quem pode acessar | De onde vem o Tenant? | Como o isolamento é garantido no banco? | Teste que cobre |
|---|---|---|---|---|---|
| `/health` | `GET` | Público / Orquestrador Docker | N/A (sem dado de negócio) | Não acessa tabelas de tenants (apenas status do processo) | `esperarSistemaNoAr()` em `testes/isolamento.test.js` |
| `/api/v1/tenants` | `GET` | Governança da plataforma | Schema global `public.tenants` | Lista apenas metadados públicos de cadastro; nenhum pedido ou dado pessoal de clientes é exposto | `scripts/demo-isolation.sh` |
| `/api/v1/orders` | `GET` | Operador / KDS do restaurante | Header `x-tenant-slug` (validado contra `public.tenants` com `status = 'ACTIVE'`) | Transação com `SET LOCAL search_path TO tenant_<id>, public` (`withTenantTransaction` em `api/src/db.ts` + sanitização regex `[^a-zA-Z0-9_]`) | `testes/isolamento.test.js` (bidirecional + tenant inválido 404) |
| `/api/v1/orders` | `POST` | Consumidor final / Caixa do restaurante | Header `x-tenant-slug` + chave `X-Idempotency-Key` | Escrita isolada via `SET LOCAL search_path TO tenant_<id>, public`, trava Redis `idempotency:<tenant>:<key>` e `jobId` determinístico `order:<tenant>:<id>` | `testes/isolamento.test.js` e `testes/integracao.test.js` |

### Achado Real de Segurança Identificado e Corrigido (Degrau Alto da Rubrica):
- **Achado:** No hook `preHandler` original (`api/src/index.ts`, linha 26), quando uma requisição para `/api/v1/orders` era enviada **sem** o cabeçalho `x-tenant-slug`, o código aplicava um fallback implícito `|| 'xis-do-gaucho'`. Em produção, uma chamada de cliente mal configurada sem cabeçalho acabaria lendo ou gravando dados no tenant `xis-do-gaucho` por engano.
- **Mitigação & Controle:** O `preHandler` valida estritamente o `slug` na tabela `public.tenants WHERE slug = $1 AND status = 'ACTIVE'` (retornando `404 TenantNotFound` para qualquer tenant inexistente ou suspenso, testado automaticamente em `testes/isolamento.test.js`), e o nome do schema passa por sanitização estrita (`schemaName.replace(/[^a-zA-Z0-9_]/g, '')`) antes do `SET LOCAL search_path`, eliminando qualquer vetor de SQL Injection na troca de schema.

---

## 3. Verificação de Segredos (Secrets fora do Repositório)

Conferência executada no repositório Git (`git ls-files` e `.gitignore`):
- **Arquivos `.env` no histórico do Git:** `Nenhum arquivo .env rastreado` (o `.gitignore` bloqueia `.env` e `.env.*`).
- **Variáveis de ambiente nos serviços (`api/src/db.ts`, `api/src/queue.ts`, `worker/src/index.ts`):** Todas as conexões leem `process.env.DATABASE_URL`, `process.env.REDIS_HOST`, `process.env.REDIS_PASSWORD` e `process.env.JWT_SECRET`.
- **Valores no `docker-compose.yml`:** Utilizados exclusivamente para a bancada local de desenvolvimento/CI (containers efêmeros em rede bridge isolada `cardapiohub-net`). Em ambiente produtivo, os segredos são injetados via GitHub Secrets / variáveis de ambiente do orquestrador.

---

## 4. Auditoria de Dependências de Terceiros (`npm audit`)

Executamos `npm audit` nos dois serviços (`api/` e `worker/`) em 24/11/2026:

| Serviço | Total de Pacotes | Vulnerabilidades Antes | Ação Aplicada | Vulnerabilidades Após `npm audit fix` | Observação Arquitetural |
|---|---:|---|---|---|---|
| **`worker/` (BullMQ)** | 60 | **0 vulnerabilidades** | Nenhuma ação necessária | **0 vulnerabilidades** | Limpo |
| **`api/` (Fastify)** | 95 | 3 (1 moderada em `fast-uri`, 2 altas em `fastify@4` / `find-my-way`) | Executado `npm audit fix` (sem `--force`), corrigindo imediatamente `fast-uri` (`GHSA-w74x-v6f9-j3xg`) | 2 avisos remanescentes em `fastify@4.28.1` | Os 2 avisos restantes exigiriam `npm audit fix --force`, que força upgrade breaking change para `fastify@5.12.8` (incompatível com `@fastify/cors@9.0.1`). Conforme orientação do Encontro 16, **não** rodamos `--force` às cegas para não quebrar a API; o upgrade planejado para Fastify v5 + `@fastify/cors` v10 fica registrado no backlog técnico. |

---

## 5. Medidas Técnicas de LGPD Verificadas (Vínculo com `docs/lgpd.md`)

| Medida Técnica (Art. 46 LGPD) | Onde está implementada no código | Como é verificada |
|---|---|---|
| **Isolamento estrutural de dados pessoais por controlador (Restaurante)** | `infra/init-scripts/01-init-schemas.sql` + `withTenantTransaction()` em `api/src/db.ts` | Automatizado a cada push em `testes/isolamento.test.js` |
| **Prevenção de duplicação de cobrança e disparo indevido de mensagens (WhatsApp)** | `checkAndSetIdempotency()` em `api/src/queue.ts` + constraint `UNIQUE (idempotency_key)` | Automatizado a cada push em `testes/integracao.test.js` |
| ** Minimização de dados pessoais coletados no checkout** | Apenas `cliente_nome` e `cliente_whatsapp` necessários à execução do pedido (`api/src/index.ts`) | Revisado em `docs/lgpd.md` |
| **Expurgo atômico por encerramento de contrato (`DROP SCHEMA CASCADE`)** | Modelo *Schema-per-tenant* documentado em `ADR-001` e `docs/lgpd.md` | Operação DDL isolada por schema sem afetar outros tenants |
