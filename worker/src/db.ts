import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cardapio_admin:cardapio_secret_password@localhost:5432/cardapiohub_db',
  max: 10,
  idleTimeoutMillis: 30000,
});

/**
 * Atualiza o status do pedido dentro do schema do tenant
 */
export async function updateOrderStatus(
  schemaName: string,
  orderId: string,
  newStatus: string
): Promise<void> {
  const safeSchema = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
  const query = `UPDATE ${safeSchema}.pedidos SET status = $1 WHERE id = $2`;
  await pool.query(query, [newStatus, orderId]);
}
