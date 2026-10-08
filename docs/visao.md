# Visão do Produto — CardápioHub

**Projeto Integrador:** Arquitetura de Software SAAS (8512) · EC7 · SETREM 2026-2  
**Autor:** Bernardo Gabriel Baú  
**Repositório Oficial:** [github.com/baubernardo/CardapioHub](https://github.com/baubernardo/CardapioHub)

---

## 1. Problema e Oportunidade de Mercado

O mercado de alimentação fora do lar (*food service* brasileiro) enfrenta uma dependência asfixiante de marketplaces de entrega (como iFood e Rappi), que cobram comissões predatórias entre **12% e 27% sobre o faturamento bruto** de cada pedido. 

Ao tentar migrar para canais próprios de venda direta (cardápio digital e WhatsApp), os estabelecimentos encontram dois extremos problemáticos:
1. **Soluções improvisadas:** Atendimento manual via mensagens de WhatsApp e comandas de papel, gerando gargalos operacionais no pico de atendimento, erros de anotação de itens opcionais (ex.: bordas recheadas, ingredientes extras) e atrasos de até 40 minutos para a cozinha iniciar o preparo.
2. **Sistemas legados corporativos:** Softwares de PDV engessados, que exigem servidores dedicados locais, cobram implantações caras (> R$ 1.500,00) e não oferecem autoatendimento web ágil nem telas de KDS (*Kitchen Display System*) sincronizadas em tempo real.

O **CardápioHub** nasce para preencher essa lacuna: um SaaS B2B *white-label* de alta performance, autoatendimento e baixo custo fixo, permitindo que bares, lanchonetes e pizzarias operem seu próprio cardápio digital web, recebam pagamentos Pix automatizados com confirmação instantânea e gerenciem a produção da cozinha via tela KDS em tempo real, sem intermediários.

---

## 2. Personas de Tenant e Dimensionamento de Referência

O modelo comercial e arquitetural do CardápioHub foi projetado para acomodar dois extremos de clientes gastronômicos:

| Atributo | Tenant Pequeno (Referência C1) | Tenant Grande (Referência C1) |
| :--- | :--- | :--- |
| **Nome Fantasia (BR)** | **Lancheria Xis do Gaúcho** | **Pizzaria Suprema Express** |
| **Localização** | Horizontina - RS (Interior) | Porto Alegre - RS (Região Metropolitana) |
| **Plano Assinado** | Básico (R$ 99,00 / mês) | Pro / Enterprise (R$ 899,00 / mês) |
| **Volume Mensal** | **600 pedidos / mês** (~20 pedidos/dia) | **18.000 pedidos / mês** (~600 pedidos/dia) |
| **Usuários Operacionais** | 3 usuários (1 operador de caixa, 2 chapeiros) | 45 usuários (caixas, múltiplos KDS por praça e garçons) |
| **Pico de Operação** | Sexta e sábado: ~12 pedidos / hora | Sexta e sábado: **150 pedidos / hora** (rajada de 5 ped/min) |
| **Ticket Médio** | R$ 38,00 | R$ 75,00 |
| **Margem p/ Infraestrutura** | Custo unitário < R$ 3,00 / mês (< 3% da assinatura) | Suporta custos dedicados e webhooks de extensão |
| **Necessidade Crítica** | Simplicidade, baixo custo e facilidade no Pix | Throughput no KDS, separação de praças e zero indisponibilidade |

---

## 3. Proposta de Valor e Diferenciais

1. **Autoatendimento Instantâneo via QR Code e Link Próprio:** O cliente final acessa `cardapiohub.com.br/restaurante` sem precisar baixar aplicativos, escolhe os produtos com personalizações dinâmicas (opcionais, tamanhos e observações) e paga via Pix Copia-e-Cola.
2. **KDS em Tempo Real (Zero Comanda de Papel):** Assim que o Pix é liquidado, a comanda surge instantaneamente na tela da cozinha (`Painel Gestão & KDS`) via WebSocket (< 30 ms), eliminando impressoras térmicas e perdas de pedidos.
3. **Isolamento Rígido Multi-Tenant (Segurança de Dados):** Dados de clientes, faturamento e comandas de concorrentes que operam na mesma cidade são segregados estruturalmente no PostgreSQL (Schema-per-tenant), garantindo conformidade com a LGPD.
4. **Onboarding Self-Service em Menos de 2 Minutos:** O restaurante assina o plano no site e tem seu ambiente operacional provisionado automaticamente pelo `Worker de Filas` em ~8 segundos, sem necessidade de suporte técnico manual.

---

## 4. Limitações de Escopo (O que o CardápioHub NÃO faz)

Para manter o foco no core business e viabilidade operacional do produto, definimos os limites do produto:
* **Não é Marketplace:** O CardápioHub não agrega restaurantes em uma vitrine central concorrente (não é um "novo iFood"). O tráfego e marketing pertencem ao restaurante.
* **Não faz Gestão de Entregadores em Campo:** Não realiza rastreamento GPS de motoboys em tempo real. O sistema apenas avança o status do pedido para "Saiu para Entrega" e despacha a notificação via WhatsApp.
* **Não faz Emissão Fiscal Própria de NF-e/NFC-e:** Não emite notas fiscais diretamente na SEFAZ. O sistema expõe APIs e webhooks para integração com o ERP/PDV fiscal homologado do restaurante.
* **Não integra diretamente com adquirentes locais de cartão exóticas:** O pagamento no cardápio web é padronizado via Pix e Cartão através de Gateway centralizado (conforme regra 3 de customização da Atividade 06).
