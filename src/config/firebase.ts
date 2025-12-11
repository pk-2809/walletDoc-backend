import admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

let firebaseInitialized = false;

export const initializeFirebase = (): void => {
  if (firebaseInitialized) {
    console.log('Firebase already initialized');
    return;
  }

  try {
    // Option 1: Use service account file
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(path.resolve(serviceAccountPath));
      // Use custom bucket name from env, or try both common formats
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET 
        || `${serviceAccount.project_id}.firebasestorage.app`
        || `${serviceAccount.project_id}.appspot.com`;
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: storageBucket
      });
      console.log('✅ Firebase initialized with service account file');
      console.log(`📦 Storage bucket: ${storageBucket}`);
    } 
    // Option 2: Use individual credentials from environment variables
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET 
        || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`
        || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        }),
        storageBucket: storageBucket
      });
      console.log('✅ Firebase initialized with environment variables');
      console.log(`📦 Storage bucket: ${storageBucket}`);
    }
    // Option 3: Use default credentials (for Google Cloud environments)
    else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      console.log('✅ Firebase initialized with default credentials');
    }

    firebaseInitialized = true;
  } catch (error) {
    console.error('❌ Error initializing Firebase:', error);
    throw error;
  }
};

export const getFirebaseAdmin = (): admin.app.App => {
  if (!firebaseInitialized) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return admin.app();
};

export { admin };

