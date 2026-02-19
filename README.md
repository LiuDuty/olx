# Scraper de Imóveis OLX (Barueri - Proprietário Direto)

Este projeto automatiza a extração de informações de imóveis na OLX para a região de Barueri, filtrando apenas por anúncios de **proprietários particulares**.

## O que ele extrai:
- **Link do anúncio**
- **Valor do imóvel**
- **Telefone do proprietário** (Tenta extrair da descrição ou clicando no botão "Ver número")

## Pré-requisitos
- [Node.js](https://nodejs.org/) instalado.
- Navegador Chromium (o script instala automaticamente).

## Como Instalar e Rodar

1.  **Instalar dependências:**
    ```bash
    npm install
    ```

2.  **Garantir que os navegadores do Playwright estão instalados:**
    ```bash
    npx playwright install chromium
    ```

3.  **Executar o scraper:**
    ```bash
    npm start
    ```

## Observações Importantes (⚠️)

1.  **Bloqueio de Robôs:** A OLX possui proteções robustas. O script utiliza um plugin de "stealth" (furtividade), mas ainda assim você pode encontrar bloqueios ou desafios (CAPTCHAs).
2.  **Interface Visual:** O script roda com `headless: false`, o que significa que uma janela do navegador irá abrir. **Isso é intencional** para que você possa resolver algum CAPTCHA manualmente se necessário ou fazer login na sua conta OLX caso o site exija para mostrar o telefone.
3.  **Telefone:** Muitos telefones só são revelados após login. Se o script encontrar muitos como "Requer Login", experimente fazer login manualmente na janela do navegador que se abre no início do processo.
4.  **Paginação:** O script detecta automaticamente o total de páginas e percorre todas elas até o fim.

## Arquivos Gerados
- `imoveis_olx.json`: Dados em formato JSON.
- `imoveis_olx.csv`: Lista pronta para abrir no Excel.
