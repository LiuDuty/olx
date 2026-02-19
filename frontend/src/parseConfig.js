// Usando a instância global do Parse carregada via CDN no index.html 
// para evitar conflitos de build com o Vite
const Parse = window.Parse;

if (Parse) {
    Parse.initialize(
        "kPphx4UiPzkVLXZbdG6D0ibRi1KQARQ1uMsxWPQr", // App ID
        "bVidsnN1GWSVGnYnMdHvPBxHw39YDcVMwqr5nQlG"  // JS Key
    );
    Parse.serverURL = 'https://parseapi.back4app.com/';
} else {
    console.error("Parse SDK não foi carregado corretamente via CDN.");
}

export default Parse;
