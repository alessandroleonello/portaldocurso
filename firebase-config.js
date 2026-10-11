/**
 * Configuração do Firebase Firestore - Portal do Curso
 * Cole aqui as chaves obtidas no console do Firebase (https://console.firebase.google.com)
 */

export const firebaseConfig = {
  apiKey: "AIzaSyCxzfb4nuAXZxv462DMeazMI6M7eImx1m8",
  authDomain: "portaldocurso-6b415.firebaseapp.com",
  projectId: "portaldocurso-6b415",
  storageBucket: "portaldocurso-6b415.firebasestorage.app",
  messagingSenderId: "200208236930",
  appId: "1:200208236930:web:7f09d44891aa29b94b0f9b"
};

/**
 * REGRAS DE SEGURANÇA RECOMENDADAS PARA O FIRESTORE
 * Copie o código abaixo e cole na aba "Regras" (Security Rules) do Firestore no Firebase Console:
 * 
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /portal_data/{schoolId} {
 *       allow read: if true;
 *       allow write: if request.auth != null || request.time < timestamp.date(2028, 1, 1);
 *     }
 *   }
 * }
 */
