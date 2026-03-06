import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuração do Firebase para o Frontend (Web SDK)
const firebaseConfig = {
    apiKey: "AIzaSyAIJpRhoToj9c4VLhIWkRXiVoO6rtbbvaQ",
    authDomain: "radarweb-ca26c.firebaseapp.com",
    projectId: "radarweb-ca26c",
    storageBucket: "radarweb-ca26c.firebasestorage.app",
    messagingSenderId: "1013431864712",
    appId: "1:1013431864712:web:20475c007704f706fd7e3d",
    measurementId: "G-JDCXQXE42V"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
export default app;
