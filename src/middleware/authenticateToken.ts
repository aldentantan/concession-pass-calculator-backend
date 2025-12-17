import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: Function
) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
    }

    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
    }

    // Get Supabase JWT secret from .env
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!jwtSecret) {
      console.error('❌ SUPABASE_JWT_SECRET not configured');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Authentication is not properly configured',
      });
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, jwtSecret) as any;

    // Token is valid, proceed to next middleware/route
    next();

  } catch (error) {
    console.error('JWT verification error:', error);

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.',
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({
        error: 'Invalid token',
        message: 'Authentication token is invalid',
      });
    }

    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred while verifying your authentication',
    });
  }
};