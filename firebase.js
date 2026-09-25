import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB6VOYXJLkF8pv6CDCr2GsZs1-WD-X_zq0",
  authDomain: "the-revolution-mma-store.firebaseapp.com",
  projectId: "the-revolution-mma-store",
  storageBucket: "the-revolution-mma-store.firebasestorage.app",
  messagingSenderId: "325981957594",
  appId: "1:325981957594:web:c7546bc127b199b130a4e3",
  measurementId: "G-ZEG7MELRYK"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
