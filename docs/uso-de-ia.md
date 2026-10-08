# Declaração de Uso de Inteligência Artificial — CardápioHub

**Disciplina:** Arquitetura de Software SAAS (8512) · EC7 · SETREM 2026-2  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Seção 3 do Guia do Projeto Integrador 2026-2

---

## Registro por Artefato

| Artefato | Ferramenta de IA | Para quê foi usada | Como foi usada | O que foi aceito | O que foi rejeitado ou corrigido |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ADR 001** (Modelo de Tenancy) | Google Antigravity (Gemini) | Estruturação de prós e contras entre Silo vs Shared Schema vs Schema-per-tenant e documentação do pipeline de provisionamento. | Prompt solicitando matriz comparativa de custos de infraestrutura e viabilidade para R$ 99/mês. | Aceita a estrutura de análise em cinco forças e a recomendação de `node-pg-migrate`. | Rejeitada sugestão inicial de Database-per-tenant por estourar o unit economics do tenant pequeno; corrigidos os limites de schemas por nó do PostgreSQL. |
| **ADR 002** (Estratégia de Comunicação e Idempotência) | Google Antigravity (Gemini) | Análise de trade-offs de comunicação síncrona vs assíncrona, modelagem de resiliência e correlação com o Caso 09 (SafraLog). | Prompt solicitando análise dos gargalos de pico da Pizzaria Suprema (150 ped/h) frente à instabilidade de APIs de WhatsApp e definição de barreiras de idempotência contra duplicatas. | Aceita a decomposição mista (HTTP síncrono para checkout/ACK + WebSockets para KDS + BullMQ no Redis para I/O externo) e política de retry com jitter. | Rejeitada sugestão genérica de cluster Apache Kafka gerenciado (custo de R$ 1.350/mês inviabilizaria o produto para 30-50 tenants); ajustada a chave de idempotência para 3 barreiras práticas (`X-Idempotency-Key`, `SETNX` e `jobId` determinístico). |

---

## Declaração de Responsabilidade

Todas as decisões arquiteturais, estimativas de volume, dimensionamento de SLAs, limites de tenant e validação técnica dos trade-offs foram concebidos, auditados e validados criticamente pelo autor, assegurando total aderência aos requisitos reais do produto CardápioHub e aos padrões do Projeto Integrador.
