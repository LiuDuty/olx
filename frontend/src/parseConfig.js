// Usando a instância global do Parse carregada via CDN no index.html 
// para evitar conflitos de build com o Vite
const Parse = window.Parse;

if (Parse) {
    Parse.initialize(
        "kj4bCzuM3za0ELbjaOQ49fAatHwcTyXIBlPnrpxO", // App ID
        "tJIfRz14LRbzIYJL4feqOVrfEVeqS6WjpslkwiQZ"  // JS Key
    );
    Parse.serverURL = 'https://parseapi.back4app.com/';
} else {
    console.error("Parse SDK não foi carregado corretamente via CDN.");
}

export default Parse;
