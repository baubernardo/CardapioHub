# Documentação C4 Model — CardápioHub

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Conformidade:** Item 1.2 da Etapa 1 e Item 2.2 da Etapa 2 do Guia do Projeto Integrador

---

## Estrutura dos Níveis C4

A arquitetura do CardápioHub está documentada em três níveis progressivos de detalhamento:

1. **[Nível 1: Diagrama de Contexto](file:///Users/bernardobau/01-Codes/CardapioHub/docs/c4/nivel-1-contexto.md)**  
   Mapeia o sistema no ecossistema de food service, os atores (*Cliente Final*, *Gestor / Dono*, *Operação KDS*) e os sistemas externos integrados (*Gateway de Pagamento Pix* e *Serviço WhatsApp*).  
   *Visualizador HTML interativo:* [`docs/c4/diagrama.html`](file:///Users/bernardobau/01-Codes/CardapioHub/docs/c4/diagrama.html)

2. **[Nível 2: Diagrama de Containers](file:///Users/bernardobau/01-Codes/CardapioHub/docs/c4/nivel-2-containers.md)**  
   Mapeia a divisão física e lógica dos containers (`Cardápio Web` em Next.js, `Painel Gestão & KDS` em React/Vite, `API Backend & WS` em Fastify/Node.js, `Worker de Filas` em BullMQ/Node.js, `Banco de Dados` PostgreSQL 16 com schemas isolados e `Fila de Mensagens` Redis 7).  
   *Visualizador HTML interativo:* [`docs/c4/Diagrama_C4_Nivel2-Containers.html`](file:///Users/bernardobau/01-Codes/CardapioHub/docs/c4/Diagrama_C4_Nivel2-Containers.html)

3. **[Nível 3: Diagrama de Componentes (Componentes Críticos)](file:///Users/bernardobau/01-Codes/CardapioHub/docs/c4/nivel-3-componentes.md)**  
   Decompõe internamente os dois serviços de backend da Etapa 2 (`API Backend & WS` e `Worker de Filas`), detalhando controllers, interceptors de idempotência, middleware de injeção de `search_path`, processadores de jobs BullMQ e o handler de Dead Letter Queue (DLQ).
