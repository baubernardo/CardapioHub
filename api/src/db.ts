import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cardapio_admin:cardapio_secret_password@localhost:5432/cardapiohub_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Resolve o schema do tenant a partir do seu slug consultando a tabela public.tenants
 */
export async function resolveTenantSchema(slug: string): Promise<string | null> {
  const result = await pool.query(
    'SELECT schema_name FROM public.tenants WHERE slug = $1 AND status = $2',
    [slug, 'ACTIVE']
  );
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].schema_name;
}

/**
 * Executa uma operação garantindo o SET LOCAL search_path dentro de uma transação atômica.
 * Ao comitar ou falhar, o PostgreSQL reseta o search_path da conexão do pool automaticamente.
 */
export async function withTenantTransaction<T>(
  schemaName: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Sanitização básica do nome do schema (apenas caracteres alfanuméricos e underscore)
    const safeSchema = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
    await client.query(`SET LOCAL search_path TO ${safeSchema}, public`);
    
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
