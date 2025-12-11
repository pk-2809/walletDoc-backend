import { Router, Request, Response } from 'express';
import multer from 'multer';
import { admin } from '../config/firebase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, Word, and Excel files are allowed.'));
    }
  }
});

// Upload document
router.post('/upload', authenticateToken, upload.single('document'), async (req: AuthRequest, res: Response) => {
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
        message: 'No file uploaded'
      });
    }

    const userId = req.user.uid;
    const file = req.file;
    const { description } = req.body;
    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}_${file.originalname}`;

    // Upload to Firebase Storage
    // Get bucket - use default or specified bucket name
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    const bucket = bucketName 
      ? admin.storage().bucket(bucketName)
      : admin.storage().bucket();
    
    if (!bucket) {
      return res.status(500).json({
        success: false,
        message: 'Firebase Storage bucket not configured. Please enable Storage in Firebase Console.'
      });
    }

    const fileUpload = bucket.file(fileName);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: userId,
          originalName: file.originalname,
          documentType: file.mimetype,
          uploadedAt: new Date().toISOString()
        }
      }
    });

    // Generate signed URL for private file access (valid for 1 year)
    const [downloadURL] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
    });

    // Create document metadata
    const documentData = {
      userId,
      fileName: file.originalname,
      storagePath: fileName,
      downloadURL,
      fileSize: file.size,
      mimeType: file.mimetype,
      documentType: file.mimetype,
      description: description || '',
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Save document metadata to Firestore
    const db = admin.firestore();
    const docRef = await db.collection('documents').add(documentData);

    // Prepare document details for user's documents array
    // Note: Cannot use serverTimestamp() inside array elements - Firestore restriction
    const docDetails = {
      docId: docRef.id,
      docName: file.originalname,
      docType: file.mimetype,
      docSize: file.size,
      uploadedTime: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      isDocShow: true
    };

    // Update user's document list and totalSize
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const currentTotalSize = (userData && userData.totalSize) ? userData.totalSize : 0;
    const newTotalSize = currentTotalSize + file.size;

    // Update documents array and totalSize first
    await userRef.update({
      documents: admin.firestore.FieldValue.arrayUnion(docDetails),
      totalSize: newTotalSize
    });

    // Update timestamp separately to avoid Firestore conflict
    await userRef.update({
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        documentId: docRef.id,
        fileName: file.originalname,
        fileSize: file.size,
        downloadURL,
        documentType: file.mimetype,
        uploadedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload document'
    });
  }
});

// Get all documents for user (open API - no authentication required)
router.post('/my-documents', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }
    const db = admin.firestore();

    // Get all documents for this user
    // Note: Requires Firestore composite index on (userId, uploadedAt)
    // Create index: https://console.firebase.google.com/project/walletdoc-1f052/firestore/indexes
    let documentsSnapshot;
    try {
      documentsSnapshot = await db.collection('documents')
        .where('userId', '==', userId)
        .orderBy('uploadedAt', 'desc')
        .get();
    } catch (error: any) {
      // If index doesn't exist, get without orderBy and sort in memory
      if (error.message?.includes('index')) {
        documentsSnapshot = await db.collection('documents')
          .where('userId', '==', userId)
          .get();
        
        // Sort in memory by uploadedAt (descending)
        const docs = documentsSnapshot.docs.sort((a: any, b: any) => {
          const aTime = a.data().uploadedAt?.toMillis?.() || 0;
          const bTime = b.data().uploadedAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        
        // Create a new QuerySnapshot-like object
        documentsSnapshot = {
          docs: docs,
          empty: docs.length === 0,
          size: docs.length
        } as any;
      } else {
        throw error;
      }
    }

    // Generate fresh signed URLs for each document
    const bucket = admin.storage().bucket();
    const documents = await Promise.all(
      documentsSnapshot.docs.map(async (doc: any) => {
        const docData = doc.data();
        let downloadURL = docData.downloadURL;

        // Generate fresh signed URL if storage path exists
        if (docData.storagePath) {
          try {
            const file = bucket.file(docData.storagePath);
            const [signedUrl] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
            });
            downloadURL = signedUrl;
          } catch (error) {
            console.error('Error generating signed URL:', error);
            // Keep original URL if signed URL generation fails
          }
        }

        return {
          id: doc.id,
          ...docData,
          downloadURL
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents'
    });
  }
});

// Get single document by ID (open API - no authentication required)
router.get('/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const db = admin.firestore();

    const docSnapshot = await db.collection('documents').doc(documentId).get();

    if (!docSnapshot.exists) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const docData = docSnapshot.data();

    if (!docData) {
      return res.status(404).json({
        success: false,
        message: 'Document data not found'
      });
    }

    // Generate fresh signed URL
    let downloadURL = docData.downloadURL;
    if (docData.storagePath) {
      try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(docData.storagePath);
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        });
        downloadURL = signedUrl;
      } catch (error) {
        console.error('Error generating signed URL:', error);
        // Keep original URL if signed URL generation fails
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        id: docSnapshot.id,
        ...docData,
        downloadURL
      }
    });
  } catch (error: any) {
    console.error('Error fetching document:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch document'
    });
  }
});

// Delete document
router.delete('/:documentId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { documentId } = req.params;
    const userId = req.user.uid;
    const db = admin.firestore();

    const docSnapshot = await db.collection('documents').doc(documentId).get();

    if (!docSnapshot.exists) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const docData = docSnapshot.data();

    // Check if document belongs to the user
    if (docData?.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this document'
      });
    }

    // Delete file from Firebase Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(docData?.storagePath);
    
    try {
      await file.delete();
    } catch (storageError) {
      console.error('Error deleting file from storage:', storageError);
      // Continue even if storage deletion fails
    }

    // Get document size before deleting
    const docSize = docData.fileSize || 0;

    // Delete document metadata from Firestore
    await db.collection('documents').doc(documentId).delete();

    // Remove document from user's document list and update totalSize
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    // Find and remove the document from documents array
    // Handle both old format (string IDs) and new format (objects with docId)
    const documents = (userData && userData.documents) ? userData.documents : [];
    const updatedDocuments = documents.filter((doc: any) => {
      // If doc is a string (old format), compare directly
      if (typeof doc === 'string') {
        return doc !== documentId;
      }
      // If doc is an object (new format), compare docId
      return doc.docId !== documentId;
    });
    
    // Update totalSize
    const currentTotalSize = (userData && userData.totalSize) ? userData.totalSize : 0;
    const newTotalSize = Math.max(0, currentTotalSize - docSize);

    await userRef.update({
      documents: updatedDocuments,
      totalSize: newTotalSize,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document'
    });
  }
});

// Get signed URL for a document
router.get('/:documentId/download-url', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { documentId } = req.params;
    const userId = req.user.uid;
    const db = admin.firestore();

    const docSnapshot = await db.collection('documents').doc(documentId).get();

    if (!docSnapshot.exists) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const docData = docSnapshot.data();

    // Check if document belongs to the user
    if (docData?.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this document'
      });
    }

    // Generate fresh signed URL
    if (!docData?.storagePath) {
      return res.status(400).json({
        success: false,
        message: 'Document storage path not found'
      });
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(docData.storagePath);
    
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    return res.status(200).json({
      success: true,
      data: {
        downloadURL: signedUrl,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error generating download URL:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate download URL'
    });
  }
});

// Open API: Get documents by userId and masterPin (no authentication required)
router.post('/get-documents-by-pin', async (req: Request, res: Response) => {
  try {
    const { userId, pin } = req.body;

    // Validation
    if (!userId || !pin) {
      return res.status(400).json({
        success: false,
        message: 'UserId and Pin are required'
      });
    }

    const db = admin.firestore();

    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Validate masterPin
    if (!userData?.masterPin) {
      return res.status(401).json({
        success: false,
        message: 'Master pin not set for this user'
      });
    }

    if (userData.masterPin !== pin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid pin'
      });
    }

    // Get user's documents from the documents array
    const userDocuments = userData.documents || [];

    // Filter documents where isDocShow is true
    const visibleDocuments = userDocuments.filter((doc: any) => {
      // Handle object format (new) - check isDocShow
      if (typeof doc === 'object' && doc.isDocShow === true) {
        return true;
      }
      return false;
    });

    // Generate fresh signed URLs for each document
    const bucket = admin.storage().bucket();
    const documentsWithUrls = await Promise.all(
      visibleDocuments.map(async (doc: any) => {
        let downloadURL = doc.downloadURL;

        // If document has docId, try to get full document details and signed URL
        if (doc.docId) {
          try {
            const docSnapshot = await db.collection('documents').doc(doc.docId).get();
            if (docSnapshot.exists) {
              const docData = docSnapshot.data();
              if (docData?.storagePath) {
                const file = bucket.file(docData.storagePath);
                const [signedUrl] = await file.getSignedUrl({
                  action: 'read',
                  expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
                });
                downloadURL = signedUrl;
              }
            }
          } catch (error) {
            console.error('Error generating signed URL:', error);
          }
        }

        return {
          ...doc,
          downloadURL: downloadURL || doc.downloadURL
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Documents retrieved successfully',
      data: documentsWithUrls,
      count: documentsWithUrls.length
    });
  } catch (error: any) {
    console.error('Error getting documents by pin:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve documents'
    });
  }
});

// Update document visibility (show/hide) - Authenticated API
router.put('/:documentId/toggle-visibility', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { documentId } = req.params;
    const { isDocShow } = req.body;
    const userId = req.user.uid;

    // Validation
    if (isDocShow === undefined || isDocShow === null) {
      return res.status(400).json({
        success: false,
        message: 'isDocShow is required (true or false)'
      });
    }

    if (typeof isDocShow !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isDocShow must be a boolean value (true or false)'
      });
    }

    const db = admin.firestore();

    // Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();
    const documents = (userData && userData.documents) ? userData.documents : [];

    // Find the document in user's documents array
    const documentIndex = documents.findIndex((doc: any) => {
      if (typeof doc === 'object' && doc.docId) {
        return doc.docId === documentId;
      }
      return doc === documentId; // Old format
    });

    if (documentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Document not found in user documents'
      });
    }

    // Update the document in the array
    const updatedDocuments = [...documents];
    if (typeof updatedDocuments[documentIndex] === 'object') {
      // New format - update isDocShow
      updatedDocuments[documentIndex] = {
        ...updatedDocuments[documentIndex],
        isDocShow: isDocShow
      };
    } else {
      // Old format - convert to new format
      updatedDocuments[documentIndex] = {
        docId: documentId,
        isDocShow: isDocShow
      };
    }

    // Update user's documents array
    await userRef.update({
      documents: updatedDocuments,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: `Document ${isDocShow ? 'shown' : 'hidden'} successfully`,
      data: {
        documentId,
        isDocShow
      }
    });
  } catch (error: any) {
    console.error('Error updating document visibility:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update document visibility'
    });
  }
});

export default router;

