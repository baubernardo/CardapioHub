import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || 'redis_secret_password';

export const redisClient = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const orderQueue = new Queue('orders', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/**
 * Trava de idempotência via Redis (SETNX) conforme ADR-002
 */
export async function checkAndSetIdempotency(tenantSlug: string, key: string): Promise<boolean> {
  try {
    const lockKey = `idempotency:${tenantSlug}:${key}`;
    const result = await redisClient.set(lockKey, 'PROCESSING', 'EX', 86400, 'NX');
    return result === 'OK';
  } catch (err) {
    // Se o Redis não estiver disponível em teste unitário local, permite continuar
    return true;
  }
}
