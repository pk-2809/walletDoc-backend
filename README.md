# Wallet Doc API

A Node.js API project built with TypeScript and Firebase as the backend service.

## Features

- ✅ TypeScript for type safety
- ✅ Express.js for RESTful APIs
- ✅ Firebase Admin SDK for backend services
- ✅ Firebase Authentication (Register, Login, Logout)
- ✅ JWT token-based authentication
- ✅ Protected route middleware
- ✅ CORS enabled
- ✅ Environment variable configuration
- ✅ Example CRUD operations with Firestore

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Firebase project with Firestore enabled
- Firebase service account key (JSON file)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Firebase Configuration

You have three options to configure Firebase:

#### Option 1: Service Account JSON File (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > Service Accounts
4. Click "Generate new private key"
5. Save the JSON file as `firebase-service-account.json` in the project root
6. Add the path to `.env`:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

#### Option 2: Environment Variables

Add these to your `.env` file:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
```

#### Option 3: Default Credentials (Google Cloud)

If running on Google Cloud Platform, Firebase will use default credentials automatically.

### 3. Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3000
NODE_ENV=development
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

### 4. Build the Project

```bash
npm run build
```

### 5. Run the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## API Endpoints

### Health Check
- `GET /health` - Check if server is running

### Authentication Endpoints
- `POST /api/auth/register` - Register a new user
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "displayName": "John Doe"
  }
  ```

- `POST /api/auth/login` - Login existing user
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- `POST /api/auth/logout` - Logout user (revoke tokens)
  ```json
  {
    "uid": "user-uid" // or "idToken": "firebase-id-token"
  }
  ```

- `POST /api/auth/verify-token` - Verify Firebase ID token
  ```json
  {
    "idToken": "firebase-id-token"
  }
  ```

- `GET /api/auth/me` - Get current user info (requires Bearer token)
  ```
  Headers: Authorization: Bearer <firebase-id-token>
  ```

### Example User Endpoints
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create a new user
- `PUT /api/users/:id` - Update a user
- `DELETE /api/users/:id` - Delete a user

## Project Structure

```
walletDoc/
├── src/
│   ├── config/
│   │   └── firebase.ts      # Firebase initialization
│   ├── middleware/
│   │   └── auth.ts          # Authentication middleware
│   ├── routes/
│   │   ├── api.ts          # API routes
│   │   └── auth.ts         # Authentication routes
│   └── index.ts             # Main server file
├── dist/                    # Compiled JavaScript (generated)
├── .env                     # Environment variables (create from .env.example)
├── .env.example             # Example environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Watch Mode

To automatically recompile TypeScript on changes:

```bash
npm run watch
```

### Adding New Routes

1. Create new route files in `src/routes/`
2. Import and use them in `src/index.ts`
3. Use Firebase Admin SDK from `src/config/firebase.ts`

### Protecting Routes

To protect a route with authentication, use the `authenticateToken` middleware:

```typescript
import { authenticateToken, AuthRequest } from '../middleware/auth';

router.get('/protected', authenticateToken, (req: AuthRequest, res: Response) => {
  // req.user contains the authenticated user info
  res.json({ user: req.user });
});
```

### Authentication Flow

1. **Register**: User creates an account → receives a custom token
2. **Login**: User authenticates → receives a custom token (or use Firebase Client SDK to get ID token)
3. **Protected Routes**: Include `Authorization: Bearer <token>` header
4. **Logout**: Revoke all refresh tokens for the user

## Firebase Services

This project uses Firebase Admin SDK, which supports:

- **Firestore** - NoSQL database
- **Authentication** - User management
- **Storage** - File storage
- **Cloud Messaging** - Push notifications
- **Cloud Functions** - Serverless functions

## Security Notes

- ⚠️ Never commit `.env` or `firebase-service-account.json` to version control
- ⚠️ Keep your Firebase service account keys secure
- ⚠️ Use environment variables for sensitive data
- ⚠️ Implement proper authentication and authorization for production APIs

## License

ISC

