import { Request, Response, NextFunction } from 'express';
import { admin } from '../config/firebase';

// Extend Express Request to include user info
export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    [key: string]: any;
  };
}

/**
 * Middleware to verify Firebase ID token
 * Use this to protect routes that require authentication
 */
export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'Authorization token required. Please provide a Bearer token.'
      });
      return;
    }

    // Handle different Bearer token formats (Bearer token, Bearer  token, etc.)
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) {
      res.status(401).json({
        success: false,
        error: 'Invalid authorization format. Expected: Bearer <token>'
      });
      return;
    }

    const idToken = bearerMatch[1].trim();

    // Validate token format (JWT should have 3 parts separated by dots)
    if (!idToken || idToken.split('.').length !== 3) {
      res.status(401).json({
        success: false,
        error: 'Invalid token format. Token must be a valid JWT.'
      });
      return;
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
        res.status(401).json({
          success: false,
          error: 'Token has been revoked. Please login again.'
        });
        return;
      }
    }

    // Attach user info to request object
    req.user = {
      ...decodedToken,
      uid: decodedToken.uid,
      email: decodedToken.email || undefined
    };

    next();
  } catch (error: any) {
    console.error('Error verifying token:', error);

    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({
        success: false,
        error: 'Token has expired. Please login again.'
      });
      return;
    }

    if (error.code === 'auth/id-token-revoked') {
      res.status(401).json({
        success: false,
        error: 'Token has been revoked. Please login again.'
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

/**
 * Optional middleware - doesn't fail if token is missing
 * Useful for routes that work with or without authentication
 */
export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (bearerMatch) {
        const idToken = bearerMatch[1].trim();
        // Only verify if token looks valid (JWT has 3 parts)
        if (idToken && idToken.split('.').length === 3) {
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          req.user = {
            ...decodedToken,
            uid: decodedToken.uid,
            email: decodedToken.email || undefined
          };
        }
      }
    }
  } catch (error) {
    // Silently fail - user is not authenticated but route is still accessible
    console.log('Optional auth failed:', error);
  }

  next();
};

