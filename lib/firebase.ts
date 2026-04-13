import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDoqx15Pb6GSHjPBACABkJaqAj6dAOlH_w",
  authDomain: "film-room-b7780.firebaseapp.com",
  databaseURL: "https://film-room-b7780-default-rtdb.firebaseio.com",
  projectId: "film-room-b7780",
  storageBucket: "film-room-b7780.firebasestorage.app",
  messagingSenderId: "750845861116",
  appId: "1:750845861116:web:577ae5d52b942f716e4b79",
  measurementId: "G-0DL3XQXFY1",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const database = getDatabase(app);
