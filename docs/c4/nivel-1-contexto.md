# C4 Model — Nível 1: Diagrama de Contexto do Sistema

**Projeto:** CardápioHub (SaaS Multi-tenant de Cardápio Digital, Pedidos e KDS)  
**Autor:** Bernardo Gabriel Baú  
**Visualização Gráfica Interativa:** [diagrama.html](file:///Users/bernardobau/01-Codes/CardapioHub/docs/c4/diagrama.html)

---

## 1. Diagrama de Contexto (Mermaid)

```mermaid
flowchart TD
    subgraph Atores["Usuários e Personas"]
        Cliente["👤 Cliente Final<br/><i>[Pessoa]</i><br/>Pede lanches, pizzas e bebidas via navegador"]
        Gestor["👤 Gestor / Dono<br/><i>[Pessoa]</i><br/>Administra cardápio, visualiza métricas e planos"]
        Cozinha["👤 Operação KDS<br/><i>[Pessoa]</i><br/>Equipe da cozinha que visualiza e avança comandas"]
    end

    subgraph CardapioHubSystem["Limite do Sistema"]
        CardapioHub["🏢 CardápioHub<br/><i>[Sistema SaaS Multi-tenant]</i><br/>Plataforma que provê cardápio digital, gestão de pedidos, checkout Pix e KDS em tempo real com isolamento de dados por restaurante."]
    end

    subgraph Externos["Sistemas Externos de Integração"]
        Gateway["💳 Gateway de Pagamento<br/><i>[Sistema Externo / API Pix]</i><br/>Gera QR Code Pix dinâmico e emite webhooks de liquidação imediata"]
        WhatsApp["💬 Serviço WhatsApp<br/><i>[Sistema Externo / Evolution API / Twilio]</i><br/>Dispara notificações de alteração de status do pedido para o cliente"]
    end

    Cliente -->|"Acessa cardápio e faz pedidos<br/>[HTTPS]"| CardapioHub
    Gestor -->|"Gerencia catálogo, preços e relatórios<br/>[HTTPS]"| CardapioHub
    Cozinha -->|"Recebe comandas e altera status de preparo<br/>[WebSockets / HTTPS]"| CardapioHub

    CardapioHub -->|"Requisita cobrança Pix e recebe webhooks de confirmação<br/>[HTTPS / Webhooks]"| Gateway
    CardapioHub -->|"Despacha mensagens de atualização de pedido<br/>[HTTPS REST]"| WhatsApp
```

---

## 2. Descrição das Entidades e Fronteiras

### Usuários (Personas):
* **Cliente Final:** O consumidor do restaurante que acessa a URL pública (ex.: `cardapiohub.com.br/xis-gaucho`) via smartphone no salão ou em casa, sem autenticação prévia, seleciona os pratos, adiciona complementos e realiza o pagamento Pix.
* **Gestor / Dono do Restaurante:** Administrador que assina o plano SaaS, configura horários de funcionamento, cadastra categorias e itens no cardápio, monitora o faturamento em tempo real e visualiza o histórico de pedidos.
* **Operação KDS (Equipe da Cozinha):** Chapeiros, pizzaiolos e montadores que operam telas touchscreen ou monitores na cozinha, acompanhando as comandas ordenadas por tempo de espera e avançando os status de preparo.

### O Sistema CardápioHub:
* Solução central multi-tenant hospedada na nuvem que encapsula toda a regra de negócio de gestão de cardápios, pedidos, comandas, roteamento seguro por tenant e comunicação em tempo real.

### Sistemas Externos:
* **Gateway de Pagamento (Pix / Cartão):** Processador financeiro responsável pela emissão de cobranças Pix do Banco Central e envio de webhooks HTTP assíncronos quando o pagamento é reconhecido.
* **Serviço WhatsApp (Evolution API / Twilio):** Plataforma externa de mensageria responsável por entregar notificações automáticas de confirmação e despacho direto no celular do cliente final.
