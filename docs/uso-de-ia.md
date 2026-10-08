# Declaração de Uso de Inteligência Artificial — CardápioHub

**Disciplina:** Arquitetura de Software SAAS (8512) · EC7 · SETREM 2026-2  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Seção 3 do Guia do Projeto Integrador 2026-2 (Exigência a partir da Etapa 2)

---

## Registro por Artefato

| Artefato | Ferramenta de IA | Para quê foi usada | Como foi usada | O que foi aceito | O que foi rejeitado ou corrigido |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ADR 001** (Modelo de Tenancy) | Google Antigravity (Gemini) | Estruturação de prós e contras entre Silo vs Shared Schema vs Schema-per-tenant e documentação do pipeline de provisionamento. | Prompt solicitando matriz comparativa de custos de infraestrutura e viabilidade para R$ 99/mês. | Aceita a estrutura de análise em cinco forças e a recomendação de `node-pg-migrate`. | Rejeitada sugestão inicial de Database-per-tenant por estourar o unit economics do tenant pequeno; corrigidos os limites de schemas por nó do PostgreSQL. |
| **ADR 002** (Estratégia de Comunicação e Idempotência) | Google Antigravity (Gemini) | Análise de trade-offs de comunicação síncrona vs assíncrona, modelagem de resiliência e correlação com o Caso 09 (SafraLog). | Prompt solicitando análise dos gargalos de pico da Pizzaria Suprema (150 ped/h) frente à instabilidade de APIs de WhatsApp e definição de barreiras de idempotência contra duplicatas. | Aceita a decomposição mista (HTTP síncrono para checkout/ACK + WebSockets para KDS + BullMQ no Redis para I/O externo) e política de retry com jitter. | Rejeitada sugestão genérica de cluster Apache Kafka gerenciado (custo de R$ 1.350/mês inviabilizaria o produto para 30-50 tenants); ajustada a chave de idempotência para 3 barreiras práticas (`X-Idempotency-Key`, `SETNX` e `jobId` determinístico). |
| **ADR 003** (Stack Tecnológica e Ambiente) | Google Antigravity (Gemini) | Levantamento de opções de runtime e orquestração local com custo R$ 0,00 para a Etapa 2. | Prompt solicitando trade-offs entre frameworks e suporte a WebSockets/concorrência. | Aceita a escolha de Fastify, Next.js, Redis 7 e PostgreSQL 16 com Docker Compose / Kind. | Rejeitada sugestão de serviços gerenciados pagos em nuvem; mantida premissa de custo zero local com paridade de produção. |
| **ADR 004** (Autenticação e Resolução de Tenant) | Google Antigravity (Gemini) | Desenho do fluxo de runtime para isolamento de tenant na API e banco. | Prompt solicitando padrão para injetar `search_path` de forma segura sem vazamento em connection pool. | Aceito o hook `onRequest` com `SET LOCAL search_path` e validação RBAC via JWT. | Rejeitada sugestão de múltiplos pools por tenant (causaria exaustão de conexões no PostgreSQL). |
| **Diagramas C4 (Níveis 1, 2 e 3)** | Google Antigravity (Gemini) | Geração de diagramas visuais em Mermaid e estruturação dos componentes críticos. | Prompts detalhando atores, containers e componentes de backend. | Aceitos os fluxos de containers e decomposição do Worker e API. | Ajustada a semântica de setas síncronas vs assíncronas com base nas decisões do Caso 09. |
| **Mapeamento LGPD e Atributos de Qualidade** | Google Antigravity (Gemini) | Formulação de cenários de qualidade mensuráveis e tabela de dados pessoais por tenant. | Prompts pedindo fórmulas de SLO e mitigação de vazamento horizontal. | Aceitas as métricas mensuráveis com latência p95 e isolamento de tenant. | Removidos termos vagos (*"rápido"*, *"escalável"*), substituindo-os por métricas concretas e metas matemáticas. |
| **Mapa de Contextos DDD (`contextos.md`)** | Google Antigravity (Gemini) | Estruturação de Bounded Contexts e Context Map alinhados ao Encontro 08. | Prompt solicitando linguagem ubíqua e divisão de contextos para SaaS de food service. | Aceita a separação entre Core Domain (Pedidos e KDS) e Generic Subdomain (Notificações). | Corrigido para garantir que catálogo permaneça no schema do tenant e governança no schema `public`. |

---

## Declaração de Responsabilidade

Todas as decisões arquiteturais, estimativas de volume, dimensionamento de SLAs, limites de tenant e validação técnica dos trade-offs foram concebidos, auditados e validados criticamente pelo autor, assegurando total coerência e aderência aos requisitos reais do produto CardápioHub e aos padrões do Projeto Integrador.
