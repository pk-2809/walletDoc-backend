import { Router, Request, Response } from 'express';
import multer from 'multer';
import { admin } from '../config/firebase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

// Maximum storage quota per user (50MB)
const MAX_STORAGE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

// Configure multer for profile picture uploads
const profilePictureUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for profile pictures
  },
  fileFilter: (_req, file, cb) => {
    // Allow only image types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

const router = Router();

interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
  [key: string]: any;
}

interface LoginRequest {
  email: string;
  password: string;
}

// Register - Create new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName, ...additionalData }: RegisterRequest = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    } catch (error: any) {
      // User doesn't exist, which is what we want
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email.split('@')[0],
      emailVerified: false
    });

    // Store additional user data in Firestore
    const db = admin.firestore();
    const userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      emailVerified: userRecord.emailVerified,
      mobileNumber: additionalData.mobileNumber || '',
      masterPin: additionalData.masterPin || '',
      QR: additionalData.QR || '',
      documents: [],
      totalSize: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...additionalData
    };

    await db.collection('users').doc(userRecord.uid).set(userData);

    // Generate custom token for immediate use
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        token: customToken
      }
    });
  } catch (error: any) {
    console.error('Error registering user:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to register user'
    });
  }
});

// Login - Authenticate existing user
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Get user by email first to check if user exists
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
      throw error;
    }

    // Verify password using Firebase REST API
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: 'Firebase API key not configured'
      });
    }

    try {
      // Use Firebase REST API to verify email/password
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true
          })
        }
      );

      const data: any = await response.json();

      if (!response.ok) {
        // Handle authentication errors
        if (data.error?.message === 'INVALID_PASSWORD' || data.error?.message === 'EMAIL_NOT_FOUND') {
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
          });
        }
        throw new Error(data.error?.message || 'Authentication failed');
      }

      // Password is correct - we have the ID token from Firebase
      const idToken: string = data.idToken;
      
      // Verify the ID token to get user info
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      // Get user data from Firestore
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      // Update last login
      await db.collection('users').doc(decodedToken.uid).update({
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          displayName: userRecord.displayName,
          emailVerified: decodedToken.email_verified,
          token: idToken, // Return the verified ID token
          ...userData
        }
      });
    } catch (authError: any) {
      // Handle password verification errors
      if (authError.message?.includes('INVALID_PASSWORD') || authError.message?.includes('EMAIL_NOT_FOUND')) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
      throw authError;
    }
  } catch (error: any) {
    console.error('Error logging in:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to login'
    });
  }
});

// Verify ID Token (for client-side authentication)
router.post('/verify-token', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'ID token is required'
      });
    }

    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Check if token was revoked by checking user's tokensValidAfterTime
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    
    // If tokensValidAfterTime exists and is after the token's auth_time, token is revoked
    if (userRecord.tokensValidAfterTime) {
      const tokenAuthTime = decodedToken.auth_time * 1000; // Convert to milliseconds
      const revokedTimeValue = userRecord.tokensValidAfterTime as any;
      const revokedTime = revokedTimeValue instanceof Date 
        ? revokedTimeValue.getTime() 
        : new Date(revokedTimeValue).getTime();
      
      if (tokenAuthTime < revokedTime) {
        return res.status(401).json({
          success: false,
          message: 'Token has been revoked. Please login again.'
        });
      }
    }
    
    // Get user data from Firestore
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    return res.status(200).json({
      success: true,
      data: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        ...userData
      }
    });
  } catch (error: any) {
    console.error('Error verifying token:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Logout - Revoke user tokens
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { uid, idToken } = req.body;

    if (!uid && !idToken) {
      return res.status(400).json({
        success: false,
        message: 'User ID or ID token is required'
      });
    }

    let userId = uid;

    // If ID token is provided, verify it and get the UID
    if (idToken && !uid) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        userId = decodedToken.uid;
      } catch (error: any) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
    }

    // Revoke all refresh tokens for the user
    await admin.auth().revokeRefreshTokens(userId);

    // Update last logout in Firestore
    const db = admin.firestore();
    await db.collection('users').doc(userId).update({
      lastLogoutAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: 'Logout successful. All tokens have been revoked.'
    });
  } catch (error: any) {
    console.error('Error logging out:', error);
    
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to logout'
    });
  }
});

// Get current user info
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    // Handle different Bearer token formats
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization format. Expected: Bearer <token>'
      });
    }

    const idToken = bearerMatch[1].trim();

    // Validate token format (JWT should have 3 parts separated by dots)
    if (!idToken || idToken.split('.').length !== 3) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format. Token must be a valid JWT.'
      });
    }
    
    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Get user data from Firestore
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    return res.status(200).json({
      success: true,
      data: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        ...userData
      }
    });
  } catch (error: any) {
    console.error('Error getting user info:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid or missing token'
    });
  }
});

// Update user details (only changed fields)
router.put('/update-profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const userId = req.user.uid;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    const allowedFields = [
      'displayName',
      'mobileNumber',
      'masterPin',
      'QR'
    ];

    // Filter only allowed fields that are provided
    const fieldsToUpdate: any = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined && updateData[field] !== null) {
        fieldsToUpdate[field] = updateData[field];
      }
    }

    // If no valid fields to update
    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update. Allowed fields: displayName, mobileNumber, masterPin, QR'
      });
    }

    // Add updatedAt timestamp
    fieldsToUpdate.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    // Update user document in Firestore
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    
    await userRef.update(fieldsToUpdate);

    // Get updated user data
    const updatedUserDoc = await userRef.get();
    const updatedUserData: any = updatedUserDoc.exists ? updatedUserDoc.data() : {};
    const { email, emailVerified, masterPin, QR, name, totalSize, displayName, mobileNumber, updatedAt, createdAt } = updatedUserData;

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        uid: userId,
        email,
        emailVerified,
        masterPin,
        QR,
        name,
        totalSize,
        displayName,
        mobileNumber,
        updatedAt,
        createdAt
      }
    });
  } catch (error: any) {
    console.error('Error updating profile:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
});

// Update profile picture (upload image file)
router.post('/update-profile-picture', authenticateToken, profilePictureUpload.single('profilePicture'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
    }

    const userId = req.user.uid;
    const file = req.file;

    // Check storage quota before upload
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const currentTotalSize = (userData && userData.totalSize) ? userData.totalSize : 0;
    
    // Get old profile picture size if exists
    let oldProfilePictureSize = 0;
    if (userData && userData.profilePicturePath) {
      try {
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
        const bucket = bucketName 
          ? admin.storage().bucket(bucketName)
          : admin.storage().bucket();
        const oldFile = bucket.file(userData.profilePicturePath as string);
        const [exists] = await oldFile.exists();
        if (exists) {
          const [metadata] = await oldFile.getMetadata();
          const size = metadata.size || metadata.metadata?.size || '0';
          oldProfilePictureSize = typeof size === 'string' ? parseInt(size, 10) : (typeof size === 'number' ? size : 0);
        }
      } catch (error) {
        // If old file doesn't exist or can't be accessed, ignore
        console.log('Could not get old profile picture size:', error);
      }
    }

    // Calculate new total size (subtract old profile picture, add new one)
    const newTotalSize = currentTotalSize - oldProfilePictureSize + file.size;

    // Check if upload would exceed quota
    if (newTotalSize > MAX_STORAGE_SIZE) {
      const usedMB = (currentTotalSize / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_STORAGE_SIZE / (1024 * 1024)).toFixed(0);
      const fileMB = (file.size / (1024 * 1024)).toFixed(2);
      const availableMB = ((MAX_STORAGE_SIZE - currentTotalSize) / (1024 * 1024)).toFixed(2);

      return res.status(413).json({
        success: false,
        message: `Storage quota exceeded. You have used ${usedMB}MB of ${maxMB}MB. This profile picture (${fileMB}MB) would exceed your limit.`,
        error: 'STORAGE_QUOTA_EXCEEDED',
        data: {
          currentSize: currentTotalSize,
          maxSize: MAX_STORAGE_SIZE,
          fileSize: file.size,
          availableSpace: MAX_STORAGE_SIZE - currentTotalSize,
          usedMB: parseFloat(usedMB),
          maxMB: parseFloat(maxMB),
          fileMB: parseFloat(fileMB),
          availableMB: parseFloat(availableMB),
          message: `Please delete some old documents to free up space. You have ${availableMB}MB available.`
        }
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.originalname.split('.').pop() || 'jpg';
    const fileName = `profile-pictures/${userId}/${timestamp}.${fileExtension}`;

    // Upload to Firebase Storage
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    const bucket = bucketName 
      ? admin.storage().bucket(bucketName)
      : admin.storage().bucket();
    
    if (!bucket) {
      return res.status(500).json({
        success: false,
        message: 'Firebase Storage bucket not configured'
      });
    }

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString()
        }
      }
    });

    // Generate signed URL
    const [downloadURL] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    // Update user profile picture and totalSize in Firestore
    await userRef.update({
      profilePicture: downloadURL,
      profilePicturePath: fileName,
      totalSize: newTotalSize, // Update totalSize (old profile picture removed, new one added)
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Delete old profile picture from storage if it exists
    if (userData && userData.profilePicturePath && oldProfilePictureSize > 0) {
      try {
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
        const bucket = bucketName 
          ? admin.storage().bucket(bucketName)
          : admin.storage().bucket();
        const oldFile = bucket.file(userData.profilePicturePath);
        await oldFile.delete();
      } catch (error) {
        // If deletion fails, log but don't fail the request
        console.log('Could not delete old profile picture:', error);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      data: {
        uid: userId,
        profilePicture: downloadURL,
      }
    });
  } catch (error: any) {
    console.error('Error updating profile picture:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile picture'
    });
  }
});

export default router;

