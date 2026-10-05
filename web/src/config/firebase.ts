import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
};

// Initialize Firebase safely with env variables or fallback
const app = getApps().length === 0
  ? initializeApp(
      isFirebaseConfigured()
        ? firebaseConfig
        : {
            apiKey: 'AIzaSyDemoFallbackKeyOnlyForUiMockup12345',
            authDomain: 'controls-auto.firebaseapp.com',
            projectId: 'controls-auto',
            storageBucket: 'controls-auto.appspot.com',
            messagingSenderId: '1234567890',
            appId: '1:1234567890:web:abcdef123456',
          }
    )
  : getApp();

export const auth = getAuth(app);
