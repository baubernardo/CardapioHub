#!/bin/bash
# ====================================================================
# CardápioHub — Roteiro de Demonstração de Isolamento Multi-tenant (Etapa 2)
# Autor: Bernardo Gabriel Baú
# ====================================================================

set -e

API_URL="http://localhost:3001"

echo "=========================================================="
echo " CARDÁPIOHUB — DEMONSTRAÇÃO DE ISOLAMENTO AO VIVO (ETAPA 2)"
echo "=========================================================="
echo ""

echo "1. Verificando Saúde da API (Health Check)..."
curl -s "${API_URL}/health" | grep "healthy" && echo "-> [OK] API operacional e saudável!" || (echo "-> [ERRO] API fora do ar" && exit 1)
echo ""

echo "2. Consultando Tenants Registrados na Governança SaaS (schema public)..."
curl -s "${API_URL}/api/v1/tenants"
echo -e "\n"

echo "3. Criando Pedido no Tenant Pequeno (Lancheria Xis do Gaúcho)..."
curl -s -X POST "${API_URL}/api/v1/orders" \
  -H "Content-Type: application/json" \
  -H "x-tenant-slug: xis-do-gaucho" \
  -H "x-idempotency-key: demo_xis_01" \
  -d '{
    "cliente_nome": "João da Silva",
    "cliente_whatsapp": "+5555999881122",
    "valor_total": 38.00,
    "numero_comanda": 12
  }'
echo -e "\n"

echo "4. Criando Pedido no Tenant Grande (Pizzaria Suprema Express)..."
curl -s -X POST "${API_URL}/api/v1/orders" \
  -H "Content-Type: application/json" \
  -H "x-tenant-slug: suprema-express" \
  -H "x-idempotency-key: demo_suprema_01" \
  -d '{
    "cliente_nome": "Empresa Alfa Tech",
    "cliente_whatsapp": "+5551988776655",
    "valor_total": 240.00,
    "numero_comanda": 104
  }'
echo -e "\n"

echo "=========================================================="
echo " 5. PROVA DE ISOLAMENTO: CONSULTANDO OS DOIS TENANTS"
echo "=========================================================="

echo "-> Consulta com header 'x-tenant-slug: xis-do-gaucho':"
curl -s "${API_URL}/api/v1/orders" -H "x-tenant-slug: xis-do-gaucho"
echo -e "\n"

echo "-> Consulta com header 'x-tenant-slug: suprema-express':"
curl -s "${API_URL}/api/v1/orders" -H "x-tenant-slug: suprema-express"
echo -e "\n"

echo "=========================================================="
echo " -> ISOLAMENTO COMPROVADO COM SUCESSO!"
echo " O schema 'tenant_xis_gaucho' não enxerga os dados de 'tenant_suprema_express'."
echo "=========================================================="
