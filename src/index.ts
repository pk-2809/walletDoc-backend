import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeFirebase } from './config/firebase';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import documentRoutes from './routes/documents';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = Number(process.env.PORT) || 3000;

// Initialize Firebase
initializeFirebase();

// Middleware
// Allow all origins for development (restrict in production)
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api', apiRoutes);

// Authentication routes
app.use('/api/auth', authRoutes);

// Document routes
app.use('/api/documents', documentRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: Function) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server - listen on all network interfaces
const server = app.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  const protocol = env === 'production' ? 'https' : 'http';
  const host = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.HOST || 'localhost';
  
  if (env === 'production') {
    console.log(`✅ Server is running in production mode`);
    console.log(`🌐 API URL: ${protocol}://${host}`);
    console.log(`📦 Port: ${PORT}`);
  } else {
    console.log(`🚀 Server is running in development mode`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
  }
  console.log(`📝 Environment: ${env}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

