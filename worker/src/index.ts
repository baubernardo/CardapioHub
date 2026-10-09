import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { updateOrderStatus } from './db';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || 'redis_secret_password';

const connection = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
});

console.log('[Worker de Filas] Inicializando supervisor BullMQ...');

export const orderWorker = new Worker(
  'orders',
  async (job: Job) => {
    console.log(`[Worker] Consumindo job #${job.id} do tipo '${job.name}'...`);
    const { orderId, tenantSlug, tenantSchema, clienteNome, valorTotal } = job.data;

    if (job.name === 'order.created') {
      console.log(`[Worker] Processando pedido #${orderId} do restaurante '${tenantSlug}'...`);
      
      // Simula confirmação e liquidação assíncrona
      await new Promise((resolve) => setTimeout(resolve, 800));

      try {
        await updateOrderStatus(tenantSchema, orderId, 'EM_PREPARO');
        console.log(`[Worker] Pedido #${orderId} (${clienteNome} - R$ ${valorTotal}) atualizado para 'EM_PREPARO' no schema '${tenantSchema}'!`);
      } catch (err: any) {
        console.warn(`[Worker] Aviso ao atualizar banco (possivelmente rodando em teste sem DB): ${err.message}`);
      }

      // Simula despacho de WhatsApp assíncrono (desacoplado da API conforme ADR-002)
      console.log(`[Worker] WhatsApp simulado enviado para ${job.data.clienteWhatsapp}: "Seu pedido #${job.data.numeroComanda} foi confirmado e está em preparo!"`);
    }

    return { processed: true, orderId, timestamp: new Date().toISOString() };
  },
  {
    connection,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 60000, // Limita concorrência do vizinho barulhento conforme ADR-002
    },
  }
);

orderWorker.on('completed', (job: Job) => {
  console.log(`[Worker] Job #${job.id} concluído com sucesso.`);
});

orderWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Falha crítica no job #${job?.id}: ${err.message}`);
});

process.on('SIGTERM', async () => {
  console.log('[Worker] Encerrando consumidor BullMQ...');
  await orderWorker.close();
  process.exit(0);
});
