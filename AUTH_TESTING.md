# Authentication Flow Testing and Configuration Guide

This guide explains how to test and configure the authentication system for the Dynamic Infrastructure Scaling dashboard.

## Authentication Flow

The authentication system follows this flow:

1. User submits login credentials (email/password) on the login page
2. Frontend (`auth.js`) sends credentials to backend (`/api/auth/login`)
3. Backend validates credentials against MongoDB
4. If valid, backend generates JWT token and refresh token, stores refresh token in MongoDB
5. Backend sends tokens to frontend
6. Frontend stores tokens in both localStorage and cookies
7. User is redirected to dashboard
8. For subsequent requests, JWT token is used for authorization
9. When token expires, refresh token is automatically used to get a new JWT

## Prerequisites

Make sure you have:

- MongoDB installed and running locally on default port (27017)
- Node.js installed (version 18+)
- All project dependencies installed (`npm install`)

## Configuration

### 1. Create `.env` file

Create a `.env` file in the root directory with the following content:

```
# Server Configuration
PORT=3001

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/dynamic-scaling

# Authentication
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d

# Admin User (for initial setup)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=adminpassword

# App Configuration
LOG_LEVEL=info
```

### 2. Frontend Configuration

Ensure the frontend configuration in `Dynamic Infrastructure Scaling dashboard/.env.local` points to the correct backend API URL:

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Testing Authentication Flow

### Method 1: Using Auth Test Script

Run the authentication test script to verify the entire flow:

```bash
npm run test:auth
```

This script:
- Creates a test user if it doesn't exist
- Simulates a login request
- Tests token validation
- Tests token refresh
- Tests logout
- Verifies refresh tokens in the database

### Method 2: Manual Testing

1. **Start the backend server**:
   ```bash
   npm run dev
   ```

2. **Start the frontend dashboard**:
   ```bash
   npm run dashboard
   ```

3. **Create an admin user** (if needed):
   ```bash
   npm run setup:admin
   ```

4. **Test Login Flow**:
   - Open http://localhost:3000/login in your browser
   - Use the admin credentials (default: admin@example.com / adminpassword)
   - You should be redirected to the dashboard upon successful login

5. **Verify Authentication**:
   - Check browser localStorage for `authToken` and `user`
   - Check cookies for `auth_token` and `refresh_token`
   - Try refreshing the page - you should remain logged in
   - Navigate to different pages to ensure authentication persists

## Troubleshooting

### Backend Connection Issues

If the frontend can't connect to the backend:

1. Check if the backend server is running (`npm run dev`)
2. Verify the correct API URL in frontend `.env.local` file
3. Check browser console for CORS errors

### MongoDB Connection Issues

If MongoDB connection fails:

1. Ensure MongoDB is running (`mongod` command)
2. Verify MongoDB connection string in `.env` file
3. Check backend logs for MongoDB connection errors

### Authentication Failures

If login fails:

1. Ensure an admin user exists in the database (`npm run setup:admin`)
2. Check browser console and backend logs for error messages
3. Verify if the login request is reaching the backend (check network tab)
4. Confirm if MongoDB has the user document with correct hashed password

## Monitoring Authentication in Production

For production environments:

1. **Use a robust MongoDB hosting service** (MongoDB Atlas, etc.)
2. **Set strong, random JWT secret keys**
3. **Enable HTTPS** for secure token transmission
4. **Implement rate limiting** to prevent brute-force attempts
5. **Set up authentication logging and monitoring**
6. **Configure JWT expiration** based on security requirements
7. **Store refresh tokens in a secure database**

## Security Considerations

- JWT tokens are stored in localStorage and cookies (cookies for server-side validation)
- Refresh tokens are stored in MongoDB with expiration dates
- Tokens are rotated on refresh for improved security
- Password is hashed using bcrypt before storage
- Limited number of active refresh tokens per user
- Automatic cleanup of expired tokens 