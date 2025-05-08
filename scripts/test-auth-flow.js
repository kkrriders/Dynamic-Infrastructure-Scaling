/**
 * Authentication Flow Test Script
 * 
 * This script tests the entire authentication flow:
 * 1. Connects to MongoDB
 * 2. Creates a test user if not exists
 * 3. Simulates a login request
 * 4. Verifies tokens are generated
 * 5. Tests token validation
 * 6. Tests token refresh
 * 7. Tests logout
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../src/models/User');
const { connectToDatabase, disconnectFromDatabase } = require('../src/utils/db');

// Test user credentials
const TEST_USER = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'password123',
  role: 'admin'
};

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

/**
 * Generate random token
 */
const generateRandomToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * Create test user
 */
async function createTestUser() {
  try {
    // Check if user already exists
    let user = await User.findOne({ email: TEST_USER.email });
    
    if (user) {
      console.log('Test user already exists');
      return user;
    }
    
    // Create new user
    user = new User({
      name: TEST_USER.name,
      email: TEST_USER.email,
      password: TEST_USER.password,
      role: TEST_USER.role
    });
    
    await user.save();
    console.log('Test user created successfully');
    return user;
  } catch (error) {
    console.error('Error creating test user:', error);
    throw error;
  }
}

/**
 * Simulate login request
 */
async function simulateLogin(email, password) {
  console.log(`\nTest 1: Login - Simulating login for ${email}`);
  try {
    // Find user
    const user = await User.findOne({ email });
    
    if (!user) {
      console.error('Login failed: User not found');
      return null;
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      console.error('Login failed: Invalid password');
      return null;
    }
    
    // Update last login
    user.lastLogin = new Date();
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // Generate refresh token
    const refreshToken = generateRandomToken();
    user.addRefreshToken(refreshToken, REFRESH_TOKEN_EXPIRES_IN.replace(/\D/g, ''));
    await user.save();
    
    console.log('Login successful');
    return { user, token, refreshToken };
  } catch (error) {
    console.error('Login simulation error:', error);
    return null;
  }
}

/**
 * Test token validation
 */
async function testTokenValidation(token) {
  console.log('\nTest 2: Token Validation - Validating token');
  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.error('Validation failed: User not found');
      return false;
    }
    
    console.log('Token validation successful');
    return true;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

/**
 * Test token refresh
 */
async function testTokenRefresh(userId, refreshToken) {
  console.log('\nTest 3: Token Refresh - Refreshing token');
  try {
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      console.error('Refresh failed: User not found');
      return null;
    }
    
    // Validate refresh token
    const tokenDoc = user.findRefreshToken(refreshToken);
    
    if (!tokenDoc) {
      console.error('Refresh failed: Invalid or expired refresh token');
      return null;
    }
    
    // Remove used refresh token
    user.removeRefreshToken(refreshToken);
    
    // Generate new tokens
    const newToken = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    const newRefreshToken = generateRandomToken();
    user.addRefreshToken(newRefreshToken, REFRESH_TOKEN_EXPIRES_IN.replace(/\D/g, ''));
    await user.save();
    
    console.log('Token refresh successful');
    return { user, token: newToken, refreshToken: newRefreshToken };
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Test logout
 */
async function testLogout(userId, refreshToken) {
  console.log('\nTest 4: Logout - Logging out user');
  try {
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      console.error('Logout failed: User not found');
      return false;
    }
    
    // Remove refresh token
    const removed = user.removeRefreshToken(refreshToken);
    
    if (!removed) {
      console.error('Logout failed: Refresh token not found');
      return false;
    }
    
    await user.save();
    console.log('Logout successful');
    return true;
  } catch (error) {
    console.error('Logout error:', error);
    return false;
  }
}

/**
 * Verify refresh tokens in database
 */
async function verifyRefreshTokensInDB(userId) {
  console.log('\nTest 5: Database Verification - Checking refresh tokens in database');
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      console.error('Verification failed: User not found');
      return;
    }
    
    console.log(`User has ${user.refreshTokens.length} active refresh tokens in database`);
    console.log('Tokens:');
    user.refreshTokens.forEach(token => {
      console.log(`- Token: ${token.token.substring(0, 10)}... expires: ${token.expires}`);
    });
  } catch (error) {
    console.error('Database verification error:', error);
  }
}

/**
 * Run tests
 */
async function runTests() {
  try {
    // Connect to database
    console.log('Connecting to MongoDB...');
    await connectToDatabase();
    
    // Create test user
    const testUser = await createTestUser();
    
    // Test login
    const loginResult = await simulateLogin(TEST_USER.email, TEST_USER.password);
    
    if (!loginResult) {
      console.error('Test failed: Login simulation failed');
      return;
    }
    
    // Test token validation
    const isValid = await testTokenValidation(loginResult.token);
    
    if (!isValid) {
      console.error('Test failed: Token validation failed');
      return;
    }
    
    // Test token refresh
    const refreshResult = await testTokenRefresh(loginResult.user._id, loginResult.refreshToken);
    
    if (!refreshResult) {
      console.error('Test failed: Token refresh failed');
      return;
    }
    
    // Verify refresh tokens in database
    await verifyRefreshTokensInDB(loginResult.user._id);
    
    // Test logout
    const logoutResult = await testLogout(refreshResult.user._id, refreshResult.refreshToken);
    
    if (!logoutResult) {
      console.error('Test failed: Logout failed');
      return;
    }
    
    // Final verification
    await verifyRefreshTokensInDB(loginResult.user._id);
    
    console.log('\n✅ All tests passed! Authentication flow is working correctly.');
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Disconnect from database
    await disconnectFromDatabase();
    process.exit(0);
  }
}

// Run tests
runTests(); 