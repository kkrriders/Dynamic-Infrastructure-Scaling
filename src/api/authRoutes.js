const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const crypto = require('crypto');

const router = express.Router();

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

/**
 * Generate a random token
 */
const generateRandomToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * Login endpoint
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    
    // Create JWT token
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
    user.addRefreshToken(refreshToken, REFRESH_TOKEN_EXPIRES_IN.replace(/\D/g, '')); // Extract days from format '30d'
    await user.save();

    // Send response
    res.status(200).json({
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error during login' });
  }
});

/**
 * Refresh token endpoint
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }
    
    // Find user with this refresh token
    const user = await User.findOne({ 'refreshTokens.token': refreshToken });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    // Validate the token
    const tokenDoc = user.findRefreshToken(refreshToken);
    if (!tokenDoc) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
    
    // Remove the used refresh token
    user.removeRefreshToken(refreshToken);
    
    // Generate new JWT token
    const newToken = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // Generate new refresh token
    const newRefreshToken = generateRandomToken();
    user.addRefreshToken(newRefreshToken, REFRESH_TOKEN_EXPIRES_IN.replace(/\D/g, ''));
    
    // Save user with the updated refresh tokens
    await user.save();
    
    // Send response
    res.status(200).json({
      token: newToken,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error during token refresh' });
  }
});

/**
 * Logout endpoint
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
  try {
    // Get refresh token from request
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      // Find user with this refresh token
      const user = await User.findOne({ 'refreshTokens.token': refreshToken });
      
      if (user) {
        // Remove the token
        user.removeRefreshToken(refreshToken);
        await user.save();
      }
    }
    
    // JWT is stateless, so we just send a success response
    // Client should remove the tokens from storage
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error during logout' });
  }
});

/**
 * Validate token endpoint
 * GET /api/auth/validate
 */
router.get('/validate', async (req, res) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find user (to ensure they still exist)
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Send user data
    res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    
    logger.error(`Token validation error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error during token validation' });
  }
});

/**
 * Create initial admin user
 * POST /api/auth/setup
 * This should be secured or disabled in production
 */
router.post('/setup', async (req, res) => {
  try {
    // Check if any users exist
    const userCount = await User.countDocuments();
    
    if (userCount > 0) {
      return res.status(400).json({ message: 'Setup has already been completed' });
    }

    // Create admin user
    const adminUser = new User({
      name: 'Admin User',
      email: req.body.email || 'admin@example.com',
      password: req.body.password || 'adminpassword',
      role: 'admin'
    });

    await adminUser.save();
    
    logger.info(`Initial admin user created: ${adminUser.email}`);
    res.status(201).json({ message: 'Admin user created successfully' });
  } catch (error) {
    logger.error(`Setup error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error during setup' });
  }
});

module.exports = router; 