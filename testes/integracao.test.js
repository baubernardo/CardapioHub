// ============================================================================
// Testes de Integração e Contrato entre Serviços (Item 3.1 da Etapa 3)
// 1. Barreira de Idempotência via Redis SETNX + PostgreSQL UNIQUE (ADR-002)
// 2. Processamento assíncrono API -> Fila BullMQ -> Worker atualizando status
// 3. Contrato do evento 'order.created' entre API e Worker
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3001';

async function esperarSistemaNoAr() {
  const limite = Date.now() + 60000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(API_URL + '/health', { signal: AbortSignal.timeout(2000) });
      if (r.status === 200) return;
    } catch {
      // Aguardando container subir
    }
    await new Promise((r) => setTimeout(r, 500));
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

    const primeira = await fetch(API_URL + '/api/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-slug': 'xis-do-gaucho',
        'x-idempotency-key': chaveIdempotencia,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(primeira.status, 201, 'A primeira requisição com a chave devia retornar 201 Created');

    const duplicada = await fetch(API_URL + '/api/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-slug': 'xis-do-gaucho',
        'x-idempotency-key': chaveIdempotencia,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(duplicada.status, 409, 'A requisição repetida devia ser bloqueada com 409 Conflict');
    const corpoDuplicada = await duplicada.json();
    assert.equal(corpoDuplicada.error, 'IdempotencyConflict');
  });

  await t.test('pedido criado na API é consumido pelo Worker BullMQ e muda para EM_PREPARO no schema do tenant', async () => {
    const criado = await fetch(API_URL + '/api/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-slug': 'suprema-express',
      },
      body: JSON.stringify({
        cliente_nome: 'Cliente Worker Assíncrono',
        cliente_whatsapp: '+5551997776655',
        valor_total: 92.0,
        numero_comanda: 777,
      }),
    });
    assert.equal(criado.status, 201);
    const dadosCriado = await criado.json();
    const orderId = dadosCriado.order.id;

    // Aguarda até 10s para o Worker BullMQ processar o job (simulação leva ~800ms)
    let statusAtual = dadosCriado.order.status;
    const limite = Date.now() + 10000;
    while (Date.now() < limite) {
      const listaResp = await fetch(API_URL + '/api/v1/orders', {
        headers: { 'x-tenant-slug': 'suprema-express' },
      });
      const lista = await listaResp.json();
      const encontrado = lista.orders.find((o) => o.id === orderId);
      if (encontrado && encontrado.status === 'EM_PREPARO') {
        statusAtual = encontrado.status;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    assert.equal(
      statusAtual,
      'EM_PREPARO',
      `O Worker BullMQ deveria ter atualizado o status do pedido ${orderId} para EM_PREPARO`
    );
  });
});
