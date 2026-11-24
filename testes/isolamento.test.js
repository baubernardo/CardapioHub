// ============================================================================
// Teste Automatizado de Isolamento Multi-Tenant (Item 3.2 da Etapa 3)
// Verifica na prática que a Pizzaria Suprema Express nunca vê os pedidos da
// Lancheria Xis do Gaúcho (e vice-versa), nem por listagem nem por injeção.
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3001';

const XIS_GAUCHO = {
  slug: 'xis-do-gaucho',
  schema: 'tenant_xis_gaucho',
  nome: 'Lancheria Xis do Gaúcho',
};

const SUPREMA_EXPRESS = {
  slug: 'suprema-express',
  schema: 'tenant_suprema_express',
  nome: 'Pizzaria Suprema Express',
};

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function httpJson(metodo, caminho, headers = {}, corpo = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + caminho);
    const payload = corpo ? JSON.stringify(corpo) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: metodo,
        headers: reqHeaders,
        timeout: 8000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let dados = null;
          try {
            dados = JSON.parse(raw);
          } catch {
            // resposta sem JSON
          }
          resolve({ status: res.statusCode, dados });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function requisitar(tenantSlug, metodo, caminho, corpo) {
  const headers = {};
  if (tenantSlug) {
    headers['x-tenant-slug'] = tenantSlug;
  }
  return httpJson(metodo, caminho, headers, corpo);
}

async function esperarSistemaNoAr() {
  const limite = Date.now() + 60000;
  while (Date.now() < limite) {
    try {
      const r = await httpJson('GET', '/health');
      if (r.status === 200) return;
    } catch {
      // Aguardando container subir
    }
    await pausa(500);
  }
  throw new Error('A API do CardápioHub não respondeu em /health após 60 segundos');
}

async function conferirIsolamentoBidirecional(dono, vizinho) {
  const marcadorUnico = `ComandaSecreta-${dono.slug}-${Date.now()}`;
  const criado = await requisitar(dono.slug, 'POST', '/api/v1/orders', {
    cliente_nome: marcadorUnico,
    cliente_whatsapp: '+5555991234567',
    valor_total: 79.9,
    numero_comanda: 888,
  });

  assert.equal(
    criado.status,
    201,
    `Falha ao criar pedido no tenant dono (${dono.nome}): ${JSON.stringify(criado.dados)}`
  );
  assert.equal(criado.dados.tenant, dono.slug);
  assert.equal(criado.dados.schema, dono.schema);
  const pedidoId = criado.dados.order.id;

  // 1. O próprio dono enxerga o pedido recém-criado em seu schema isolado
  const listaDono = await requisitar(dono.slug, 'GET', '/api/v1/orders');
  assert.equal(listaDono.status, 200);
  assert.equal(listaDono.dados.tenant, dono.slug);
  assert.equal(listaDono.dados.schema, dono.schema);
  assert.ok(
    listaDono.dados.orders.some((p) => p.id === pedidoId && p.cliente_nome === marcadorUnico),
    `O próprio dono (${dono.nome}) não encontrou seu pedido ${pedidoId}`
  );

  // 2. O tenant vizinho lista seus próprios pedidos e NÃO pode ver o pedido do dono
  const listaVizinho = await requisitar(vizinho.slug, 'GET', '/api/v1/orders');
  assert.equal(listaVizinho.status, 200);
  assert.equal(listaVizinho.dados.tenant, vizinho.slug);
  assert.equal(listaVizinho.dados.schema, vizinho.schema);

  const vazouPorId = listaVizinho.dados.orders.some((p) => p.id === pedidoId);
  assert.equal(
    vazouPorId,
    false,
    `VAZAMENTO CRÍTICO: ${vizinho.nome} viu o pedido ${pedidoId} que pertence a ${dono.nome}!`
  );

  const vazouPorMarcador = JSON.stringify(listaVizinho.dados).includes(marcadorUnico);
  assert.equal(
    vazouPorMarcador,
    false,
    `VAZAMENTO CRÍTICO: Dados de ${dono.nome} (${marcadorUnico}) apareceram na resposta de ${vizinho.nome}!`
  );
}

test('isolamento entre tenants (Schema-per-tenant no PostgreSQL)', async (t) => {
  await esperarSistemaNoAr();

  await t.test('Pizzaria Suprema Express não vê pedido criado na Lancheria Xis do Gaúcho', async () => {
    await conferirIsolamentoBidirecional(XIS_GAUCHO, SUPREMA_EXPRESS);
  });

  await t.test('Lancheria Xis do Gaúcho não vê pedido criado na Pizzaria Suprema Express', async () => {
    await conferirIsolamentoBidirecional(SUPREMA_EXPRESS, XIS_GAUCHO);
  });

  await t.test('Tentativa de acesso a tenant inexistente ou forjado retorna 404 TenantNotFound', async () => {
    const resp = await requisitar('restaurante-fantasma-invasor', 'GET', '/api/v1/orders');
    assert.equal(resp.status, 404);
    assert.equal(resp.dados.error, 'TenantNotFound');
  });
});
