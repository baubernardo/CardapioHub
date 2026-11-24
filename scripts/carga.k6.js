// ============================================================================
// Roteiro de Teste de Carga com k6 — CardápioHub (Item 3.3 e 3.4 da Etapa 3)
// Compara o desempenho sob pico (10 usuários virtuais por 35s) contra os
// limiares declarados em docs/slo.md (p95 < 120ms e erro < 1%).
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3001';
const CAMINHO = __ENV.CAMINHO || '/api/v1/orders';
const METODO = (__ENV.METODO || 'POST').toUpperCase();
const META_P95 = Number(__ENV.META_P95 || 120);
const USUARIOS = Number(__ENV.USUARIOS || 10);

const TENANTS = ['xis-do-gaucho', 'suprema-express'];

export const options = {
  stages: [
    { duration: '10s', target: USUARIOS }, // rampa de subida
    { duration: '20s', target: USUARIOS }, // sustentação do pico
    { duration: '5s', target: 0 },         // rampa de descida
  ],
  thresholds: {
    http_req_duration: [`p(95)<${META_P95}`], // SLO de latência (docs/slo.md)
    http_req_failed: ['rate<0.01'],           // SLO de erro (< 1%)
  },
};

export default function () {
  const tenant = TENANTS[__VU % TENANTS.length];
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-slug': tenant,
  };

  let res;
  if (METODO === 'POST') {
    const payload = JSON.stringify({
      cliente_nome: `Cliente k6 VU-${__VU}`,
      cliente_whatsapp: '+5555999990000',
      valor_total: 49.9,
      numero_comanda: 100 + (__ITER % 800),
    });
    res = http.post(`${BASE_URL}${CAMINHO}`, payload, { headers });
    check(res, {
      'status 201 Created': (r) => r.status === 201,
    });
  } else {
    res = http.get(`${BASE_URL}${CAMINHO}`, { headers });
    check(res, {
      'status 200 OK': (r) => r.status === 200,
    });
  }

  sleep(1);
}
