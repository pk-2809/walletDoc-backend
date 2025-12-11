import { Router, Request, Response } from 'express';
import { admin } from '../config/firebase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Example: Get all documents from a collection
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const db = admin.firestore();
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Example: Get a single document by ID
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(id).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: userDoc.id,
        ...userDoc.data()
      }
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Example: Create a new document
router.post('/users', async (req: Request, res: Response) => {
  try {
    const userData = req.body;
    const db = admin.firestore();
    const docRef = await db.collection('users').add({
      ...userData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: docRef.id,
        ...userData
      }
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Example: Update a document
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const db = admin.firestore();
    
    const userRef = db.collection('users').doc(id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await userRef.update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        id,
        ...updateData
      }
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Example: Delete a document
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = admin.firestore();
    const userRef = db.collection('users').doc(id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await userRef.delete();

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Example: Protected route - requires authentication
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: userDoc.id,
        ...userDoc.data()
      }
    });
  } catch (error: any) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

