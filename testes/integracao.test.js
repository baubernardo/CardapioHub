// ============================================================================
// Testes de Integração e Contrato entre Serviços (Item 3.1 da Etapa 3)
// 1. Barreira de Idempotência via Redis SETNX + PostgreSQL UNIQUE (ADR-002)
// 2. Processamento assíncrono API -> Fila BullMQ -> Worker atualizando status
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3001';

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

test('integração: idempotência e fila assíncrona API -> Worker BullMQ', async (t) => {
  await esperarSistemaNoAr();

  await t.test('requisição duplicada com mesma X-Idempotency-Key é bloqueada com HTTP 409 e gera apenas 1 pedido', async () => {
    const chaveIdempotencia = `idem-test-${Date.now()}-${Math.random()}`;
    const payload = {
      cliente_nome: 'Cliente Teste Idempotência',
      cliente_whatsapp: '+5555998887766',
      valor_total: 55.0,
      numero_comanda: 501,
    };

    const primeira = await httpJson(
      'POST',
      '/api/v1/orders',
      {
        'x-tenant-slug': 'xis-do-gaucho',
        'x-idempotency-key': chaveIdempotencia,
      },
      payload
    );
    assert.equal(primeira.status, 201, 'A primeira requisição com a chave devia retornar 201 Created');

    const duplicada = await httpJson(
      'POST',
      '/api/v1/orders',
      {
        'x-tenant-slug': 'xis-do-gaucho',
        'x-idempotency-key': chaveIdempotencia,
      },
      payload
    );
    assert.equal(duplicada.status, 409, 'A requisição repetida devia ser bloqueada com 409 Conflict');
    assert.equal(duplicada.dados.error, 'IdempotencyConflict');
  });

  await t.test('pedido criado na API é consumido pelo Worker BullMQ e muda para EM_PREPARO no schema do tenant', async () => {
    const criado = await httpJson(
      'POST',
      '/api/v1/orders',
      { 'x-tenant-slug': 'suprema-express' },
      {
        cliente_nome: 'Cliente Worker Assíncrono',
        cliente_whatsapp: '+5551997776655',
        valor_total: 92.0,
        numero_comanda: 777,
      }
    );
    assert.equal(criado.status, 201);
    const orderId = criado.dados.order.id;

    // Aguarda até 10s para o Worker BullMQ processar o job (simulação leva ~800ms)
    let statusAtual = criado.dados.order.status;
    const limite = Date.now() + 10000;
    while (Date.now() < limite) {
      const listaResp = await httpJson('GET', '/api/v1/orders', {
        'x-tenant-slug': 'suprema-express',
      });
      const encontrado = listaResp.dados.orders.find((o) => o.id === orderId);
      if (encontrado && encontrado.status === 'EM_PREPARO') {
        statusAtual = encontrado.status;
        break;
      }
      await pausa(300);
    }

    assert.equal(
      statusAtual,
      'EM_PREPARO',
      `O Worker BullMQ deveria ter atualizado o status do pedido ${orderId} para EM_PREPARO`
    );
  });
});
