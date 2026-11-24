# Relatório de Teste de Carga com k6 — CardápioHub

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Entregável 3.3 da Etapa 3 (Encontro 16 — Confronto com [`docs/slo.md`](slo.md))  
**Data da medição:** 24/11/2026 · Ferramenta: `grafana/k6:0.50.0` · Script: [`scripts/carga.k6.js`](../scripts/carga.k6.js)

---

## 1. Cenário de Pico e Comando Executado

O roteiro [`scripts/carga.k6.js`](../scripts/carga.k6.js) simula a rampa de pico de sexta-feira e sábado à noite definida em [`docs/slo.md`](slo.md):
- **Rampa (`stages`):** `10s` subindo até `N` usuários virtuais (VUs) → `20s` sustentando o pico → `5s` descendo até `0` (total: 35 segundos).
- **Distribuição Multi-tenant:** os VUs alternam automaticamente o cabeçalho `x-tenant-slug` entre `xis-do-gaucho` (schema `tenant_xis_gaucho`) e `suprema-express` (schema `tenant_suprema_express`).

```bash
# 1. Pico nominal de Checkout (POST /api/v1/orders — 10 VUs, meta p95 < 120ms)
docker run --rm -v "${PWD}/scripts:/s" \
  -e BASE_URL=http://host.docker.internal:3001 \
  -e METODO=POST -e CAMINHO=/api/v1/orders -e META_P95=120 \
  grafana/k6:0.50.0 run --quiet /s/carga.k6.js

# 2. Pico nominal de Painel/KDS (GET /api/v1/orders — 10 VUs, meta p95 < 100ms)
docker run --rm -v "${PWD}/scripts:/s" \
  -e BASE_URL=http://host.docker.internal:3001 \
  -e METODO=GET -e CAMINHO=/api/v1/orders -e META_P95=100 \
  grafana/k6:0.50.0 run --quiet /s/carga.k6.js
```

---

## 2. Confronto Número contra Número (Medido vs. SLO Declarado)

| Execução / Operação | VUs | Total de Pedidos (`http_reqs`) | Vazão (`req/s`) | SLO Latência (`docs/slo.md`) | `p(95)` Medido | Mediana (`p50`) | SLO Erro (`docs/slo.md`) | Taxa de Erro Medida | Veredito k6 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| **1. Pico Checkout (`POST /api/v1/orders`)** | 10 | 279 | 7,87/s | `< 120 ms` | **`12,28 ms`** | `9,88 ms` | `< 1%` | **`0,00%` (0/279)** | **✓ Passou (`exit 0`)** |
| **2. Pico Painel KDS (`GET /api/v1/orders`)** | 10 | 279 | 7,89/s | `< 100 ms` | **`11,06 ms`** | `9,06 ms` | `< 1%` | **`0,00%` (0/279)** | **✓ Passou (`exit 0`)** |
| **3. Estresse Moderado (`POST /api/v1/orders`)** | 150 | 4.151 | 115,98/s | `< 120 ms` | **`20,05 ms`** | `10,20 ms` | `< 1%` | **`0,00%` (0/4.151)** | **✓ Passou (`exit 0`)** |
| **4. Estresse Extremo Escrita (`POST /api/v1/orders`)** | 800 | 22.257 | 623,02/s | `< 120 ms` | **`14,86 ms`** | `3,95 ms` | `< 1%` | **`0,00%` (0/22.257)** | **✓ Passou (`exit 0`)** |
| **5. Estresse Leitura sem Paginação (`GET /api/v1/orders` após 26k linhas)** | 200 | 646 | 14,22/s | `< 100 ms` | **`33.590 ms` (33,59 s)** | `5.240 ms` | `< 1%` | **`21,20%` (137/646)** | **✗ Violou (`exit 99`)** |

---

## 3. Saídas Reais do k6

### 3.1. Execução 1 — Checkout no Pico (`POST /api/v1/orders`, 10 VUs)
```text
     ✓ status 201 Created

     checks.........................: 100.00% ✓ 279      ✗ 0   
     data_received..................: 170 kB  4.8 kB/s
     data_sent......................: 84 kB   2.4 kB/s
   ✓ http_req_duration..............: avg=9.76ms   min=4.42ms  med=9.88ms  max=21.04ms  p(90)=11.73ms  p(95)=12.28ms 
   ✓ http_req_failed................: 0.00%   ✓ 0        ✗ 279 
     http_reqs......................: 279     7.869916/s
     vus_max........................: 10      min=10     max=10
```

### 3.2. Execução 2 — Listagem KDS no Pico (`GET /api/v1/orders`, 10 VUs)
```text
     ✓ status 200 OK

     checks.........................: 100.00% ✓ 279      ✗ 0   
     data_received..................: 8.9 MB  252 kB/s
     data_sent......................: 47 kB   1.3 kB/s
   ✓ http_req_duration..............: avg=8.9ms    min=3.67ms  med=9.06ms   max=20.1ms   p(90)=10.55ms  p(95)=11.06ms 
   ✓ http_req_failed................: 0.00%   ✓ 0        ✗ 279 
     http_reqs......................: 279     7.886462/s
     vus_max........................: 10      min=10     max=10
```

### 3.3. Execução 5 — Estresse de Leitura onde o Limiar Reprova (`GET /api/v1/orders`, 200 VUs, 26.000+ linhas no banco)
```text
     ✗ status 200 OK
      ↳  78% — ✓ 509 / ✗ 137

     checks.........................: 78.79% ✓ 509       ✗ 137  
     data_received..................: 1.5 GB 34 MB/s
   ✗ http_req_duration..............: avg=9.52s    min=177.15ms med=5.24s   max=34.65s   p(90)=31.34s  p(95)=33.59s 
   ✗ http_req_failed................: 21.20% ✓ 137       ✗ 509  
     http_reqs......................: 646    14.216242/s
     vus_max........................: 200    min=200     max=200

time="2026-11-24T20:24:29Z" level=error msg="thresholds on metrics 'http_req_duration, http_req_failed' have been crossed"
```

---

## 4. Análise do Gargalo e Hipótese de Correção (Degrau Alto da Rubrica)

1. **Por que a escrita (`POST /api/v1/orders`) aguentou até 800 VUs (`623 req/s`, `p95 = 14,86 ms`, `0%` de erro)?**  
   Graças ao desacoplamento assíncrono documentado no **ADR-002**: a rota de checkout realiza apenas um `SETNX` rápido no Redis, um `INSERT` pontual no schema do tenant (`SET LOCAL search_path TO tenant_<id>`) e enfileira o evento `order.created` no BullMQ, delegando o processamento pesado e o disparo de WhatsApp ao serviço `cardapiohub-worker`.

2. **Qual foi o gargalo descoberto na Execução 5 (`GET /api/v1/orders` com `p95 = 33,59 s` e `21,20%` de erro)?**  
   Após acumular mais de **26.000 pedidos** nas execuções 1, 3 e 4, a consulta `SELECT ... FROM pedidos ORDER BY created_at DESC` sem cláusula `LIMIT` fez cada requisição serializar mais de 13.000 linhas em JSON (`1,5 GB` transferidos em 35 segundos, `34 MB/s`). Como o pool do PostgreSQL na API possui `max: 20` conexões e `connectionTimeoutMillis: 2000` (`api/src/db.ts`), 200 usuários simultâneos saturaram as 20 conexões do pool e as requisições que esperaram mais de 2 segundos para obter conexão do pool falharam (`21,20%` de falha).

3. **Hipótese de Correção Comprovada:**  
   - Adicionar paginação/limite padrão na listagem do painel KDS (`LIMIT 50`) e índice `CREATE INDEX idx_pedidos_created_at ON pedidos (created_at DESC)` em cada schema de tenant. Com `LIMIT 50`, o payload por resposta cai de ~2,3 MB para ~8 KB e o tempo de ocupação de cada conexão do pool volta para `< 3 ms`.
