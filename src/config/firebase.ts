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
    // Option 1: Use service account from base64 encoded string (Railway/Cloud)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      try {
        console.log('🔍 Found FIREBASE_SERVICE_ACCOUNT_BASE64, parsing...');
        const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(serviceAccountJson);
        const storageBucket = process.env.FIREBASE_STORAGE_BUCKET 
          || `${serviceAccount.project_id}.firebasestorage.app`
          || `${serviceAccount.project_id}.appspot.com`;
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: storageBucket
        });
        console.log('✅ Firebase initialized with base64 service account');
        console.log(`📦 Storage bucket: ${storageBucket}`);
        firebaseInitialized = true;
        return;
      } catch (base64Error) {
        console.error('❌ Error parsing base64 service account:', base64Error);
        throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64. Please check the environment variable.');
      }
    }
    // Option 2: Use service account file (local development)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      const serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
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
    // Option 3: Use individual credentials from environment variables
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
    // Option 4: Use default credentials (for Google Cloud environments)
    else {
      // Don't use default credentials - require explicit configuration
      throw new Error(
        'Firebase not configured. Please set one of:\n' +
        '  - FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 encoded service account)\n' +
        '  - FIREBASE_SERVICE_ACCOUNT_PATH (path to service account file)\n' +
        '  - FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL (individual credentials)'
      );
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

