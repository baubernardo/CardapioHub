-- ====================================================================
-- CardápioHub — Script de Inicialização de Schemas Multi-tenant (PostgreSQL)
-- Conformidade: ADR-001 (Tenancy) e ADR-004 (Runtime Isolation)
-- ====================================================================

-- 1. Schema Central de Governança da Plataforma SaaS
CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_fantasia VARCHAR(120) NOT NULL,
    slug VARCHAR(60) UNIQUE NOT NULL,
    plano VARCHAR(30) NOT NULL CHECK (plano IN ('BASICO', 'PRO', 'ENTERPRISE')),
    schema_name VARCHAR(60) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tenant 1 de Referência: Lancheria Xis do Gaúcho (Tenant Pequeno - R$ 99/mês)
INSERT INTO public.tenants (id, nome_fantasia, slug, plano, schema_name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Lancheria Xis do Gaúcho', 'xis-do-gaucho', 'BASICO', 'tenant_xis_gaucho', 'ACTIVE')
ON CONFLICT (slug) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS tenant_xis_gaucho;

CREATE TABLE IF NOT EXISTS tenant_xis_gaucho.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_comanda INT NOT NULL,
    cliente_nome VARCHAR(100) NOT NULL,
    cliente_whatsapp VARCHAR(20) NOT NULL,
    valor_total NUMERIC(10,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_PAGTO' CHECK (status IN ('AGUARDANDO_PAGTO', 'PAGO', 'EM_PREPARO', 'PRONTO', 'DESPACHADO')),
    idempotency_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tenant 2 de Referência: Pizzaria Suprema Express (Tenant Grande - R$ 899/mês)
INSERT INTO public.tenants (id, nome_fantasia, slug, plano, schema_name, status)
VALUES ('00000000-0000-0000-0000-000000000002', 'Pizzaria Suprema Express', 'suprema-express', 'PRO', 'tenant_suprema_express', 'ACTIVE')
ON CONFLICT (slug) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS tenant_suprema_express;

CREATE TABLE IF NOT EXISTS tenant_suprema_express.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_comanda INT NOT NULL,
    cliente_nome VARCHAR(100) NOT NULL,
    cliente_whatsapp VARCHAR(20) NOT NULL,
    valor_total NUMERIC(10,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_PAGTO' CHECK (status IN ('AGUARDANDO_PAGTO', 'PAGO', 'EM_PREPARO', 'PRONTO', 'DESPACHADO')),
    idempotency_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
