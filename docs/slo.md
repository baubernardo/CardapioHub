# SLO — CardápioHub

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Entregável 3.4 da Etapa 3 (Encontro 16 — 19/11/2026)

---

## 1. Objetivos de Nível de Serviço (SLOs)

Os SLOs abaixo derivam diretamente dos cenários de qualidade estabelecidos na Etapa 1 ([`docs/atributos.md`](atributos.md)) e refletem as metas de operação para os dois tenants de referência da plataforma (*Lancheria Xis do Gaúcho* e *Pizzaria Suprema Express*).

| Métrica | Fórmula | Meta | Justificativa de negócio |
|---|---|---|---|
| **latência de checkout (`POST /api/v1/orders`)** | p95 das respostas | **< 120 ms** | No pico de sexta e sábado à noite, o cliente final aguarda o QR Code Pix no celular e a cozinha precisa receber a comanda imediatamente no KDS; esperas maiores geram cliques repetidos ou desistência da compra. |
| **erro de checkout (`POST /api/v1/orders`)** | requisições com falha / total | **< 1%** | Cada requisição de pedido com falha (HTTP 5xx ou recusa 429) no horário de jantar significa perda direta de faturamento para o restaurante e insatisfação do consumidor faminto. |
| **latência de painel de pedidos (`GET /api/v1/orders`)** | p95 das respostas | **< 100 ms** | Caixas e monitores KDS da cozinha consultam continuamente as comandas do schema do tenant (`tenant_<id>`); manter p95 abaixo de 100 ms garante sensação instantânea (Nielsen, 1993). |
| **isolamento de fila do Worker (`order.created`)** | p95 do tempo em fila para tenant pequeno | **< 3.000 ms** | Quando um tenant grande (*Pizzaria Suprema Express*) enfileira centenas de eventos em lote, o *rate limiter* por tenant evita o efeito vizinho barulhento e garante entrega em até 3 s para a *Lancheria Xis do Gaúcho*. |

---

## 2. Pico

* **Quando ocorre:** Sexta-feira e sábado à noite (das 19h30 às 22h30), janela crítica de jantar e delivery.
* **Volume simultâneo no teste:** **10 usuários virtuais (VUs) simultâneos** realizando requisições contínuas em rampa de 35 segundos (`10s` rampa de subida para 10 VUs, `20s` sustentação no pico de 10 VUs, `5s` rampa de descida).
* **Premissa de negócio:** A *Pizzaria Suprema Express* (tenant grande, 18.000 pedidos/mês) atinge pico de 150 pedidos/hora com até 45 operadores/telas KDS ativos, enquanto a *Lancheria Xis do Gaúcho* (tenant pequeno, 600 pedidos/mês) opera em paralelo na mesma infraestrutura compartilhada. Dez usuários virtuais disparando pedidos a cada segundo (~600 requisições/minuto) simulam uma rajada concentrada superior a 4x o pico horário real da maior operação.

---

## 3. Limiar no k6 (`thresholds`)

Os números das metas 3 e 4 da ficha são codificados diretamente como veredito automático no script de carga do k6 ([`scripts/carga.k6.js`](../scripts/carga.k6.js)):

```javascript
export const options = {
  stages: [
    { duration: '10s', target: 10 }, // rampa de subida
    { duration: '20s', target: 10 }, // sustentação do pico
    { duration: '5s', target: 0 },   // queda
  ],
  thresholds: {
    http_req_duration: ['p(95)<120'], // SLO de latência: p95 abaixo de 120 ms
    http_req_failed: ['rate<0.01'],   // SLO de erro: falhas abaixo de 1%
  },
};
```

> **Notas sobre a evolução em relação à ficha do Encontro 16:**  
> Mantivemos integralmente a meta de `p95 < 120 ms` para o fluxo crítico (`POST /api/v1/orders`) definida desde a Etapa 1 em `docs/atributos.md`, e adicionamos à tabela a métrica de leitura (`GET /api/v1/orders`, `p95 < 100 ms`) e a métrica de fila assíncrona contra vizinho barulhento (`< 3.000 ms`), compondo 4 métricas verificáveis.
