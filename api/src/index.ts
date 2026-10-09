import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool, resolveTenantSchema, withTenantTransaction } from './db';
import { orderQueue, checkAndSetIdempotency } from './queue';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' }
    }
  }
});

app.register(cors, { origin: true });

// Health check para monitoramento e CI
app.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Lista os tenants registrados na plataforma (Governança SaaS - schema public)
app.get('/api/v1/tenants', async () => {
  const result = await pool.query('SELECT id, nome_fantasia, slug, plano, schema_name, status FROM public.tenants ORDER BY nome_fantasia');
  return { tenants: result.rows };
});

// Middleware hook para verificar cabeçalho de tenant nas rotas /api/v1/orders
app.addHook('preHandler', async (request, reply) => {
  if (request.url.startsWith('/api/v1/orders')) {
    const tenantSlug = (request.headers['x-tenant-slug'] as string) || 'xis-do-gaucho';
    const schema = await resolveTenantSchema(tenantSlug);
    
    if (!schema) {
      return reply.status(404).send({
        error: 'TenantNotFound',
        message: `Restaurante com slug '${tenantSlug}' não encontrado ou inativo.`
      });
    }

    (request as any).tenant = {
      slug: tenantSlug,
      schema: schema
    };
  }
});

// Listar pedidos do restaurante autenticado/identificado (Demonstração de Isolamento ao Vivo)
app.get('/api/v1/orders', async (request, reply) => {
  const tenant = (request as any).tenant;

  const orders = await withTenantTransaction(tenant.schema, async (client) => {
    // Como o search_path está definido para tenant_<id>, public,
    // a consulta 'FROM pedidos' busca diretamente e isoladamente na tabela deste tenant!
    const res = await client.query(`
      SELECT id, numero_comanda, cliente_nome, cliente_whatsapp, valor_total, status, created_at
      FROM pedidos
      ORDER BY created_at DESC
    `);
    return res.rows;
  });

  return {
    tenant: tenant.slug,
    schema: tenant.schema,
    total_orders: orders.length,
    orders: orders
  };
});

// Criar pedido no restaurante ativo e despachar job assíncrono para o Worker de Filas
app.post('/api/v1/orders', async (request, reply) => {
  const tenant = (request as any).tenant;
  const body = (request.body as any) || {};

  const clienteNome = body.cliente_nome || 'Cliente Anônimo';
  const clienteWhatsapp = body.cliente_whatsapp || '+5555999990000';
  const valorTotal = Number(body.valor_total || 42.50);
  const numeroComanda = Number(body.numero_comanda || Math.floor(Math.random() * 900) + 100);
  const idempotencyKey = (request.headers['x-idempotency-key'] as string) || `req_${Date.now()}_${Math.random()}`;

  // 1. Validação de Idempotência no Redis (evita pedidos duplicados no pico)
  const isUnique = await checkAndSetIdempotency(tenant.slug, idempotencyKey);
  if (!isUnique) {
    return reply.status(409).send({
      error: 'IdempotencyConflict',
      message: 'Requisição em duplicidade interceptada pelo sistema de idempotência.'
    });
  }

  // 2. Transação Síncrona no Schema do Tenant (p95 < 120 ms)
  const order = await withTenantTransaction(tenant.schema, async (client) => {
    const res = await client.query(`
      INSERT INTO pedidos (numero_comanda, cliente_nome, cliente_whatsapp, valor_total, status, idempotency_key)
      VALUES ($1, $2, $3, $4, 'AGUARDANDO_PAGTO', $5)
      RETURNING id, numero_comanda, cliente_nome, valor_total, status, created_at
    `, [numeroComanda, clienteNome, clienteWhatsapp, valorTotal, idempotencyKey]);
    return res.rows[0];
  });

  // 3. Despacho Assíncrono para o Worker de Filas (BullMQ)
  try {
    await orderQueue.add('order.created', {
      orderId: order.id,
      tenantSlug: tenant.slug,
      tenantSchema: tenant.schema,
      numeroComanda: order.numero_comanda,
      clienteNome: order.cliente_nome,
      clienteWhatsapp: clienteWhatsapp,
      valorTotal: order.valor_total
    }, {
      jobId: `order:${tenant.slug}:${order.id}` // jobId determinístico contra duplicação (Caso 09)
    });
  } catch (queueErr) {
    app.log.warn('Aviso: Fila Redis indisponível no momento, o pedido foi salvo no banco.');
  }

  return reply.status(201).send({
    message: 'Pedido criado com sucesso!',
    tenant: tenant.slug,
    schema: tenant.schema,
    order: order,
    pix: {
      qr_code: '00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000',
      chave: 'pix@cardapiohub.com.br'
    }
  });
});

const start = async () => {
  const port = Number(process.env.PORT || 3001);
  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`[API Backend & WS] Rodando na porta ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { app };
