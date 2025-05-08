const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const logger = require('../utils/logger');

class AuthService {
  async register(userData) {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new Error('User already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);

      // Create new user
      const user = new User({
        email: userData.email,
        password: hashedPassword,
        role: userData.role || 'user'
      });

      await user.save();
      logger.info(`New user registered: ${userData.email}`);

      // Generate tokens
      const tokens = this.generateTokens(user);
      return { user: this.sanitizeUser(user), ...tokens };
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  async login(email, password) {
    try {
      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        logger.warn(`Login attempt failed: User not found - ${email}`);
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        logger.warn(`Login attempt failed: Invalid password - ${email}`);
        throw new Error('Invalid credentials');
      }

      // Generate tokens
      const tokens = this.generateTokens(user);
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();

      logger.info(`User logged in successfully: ${email}`);
      return { user: this.sanitizeUser(user), ...tokens };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      
      // Find user
      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const tokens = this.generateTokens(user);
      logger.info(`Token refreshed for user: ${user.email}`);
      return tokens;
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw new Error('Invalid refresh token');
    }
  }

  generateTokens(user) {
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  }

  sanitizeUser(user) {
    const sanitized = user.toObject();
    delete sanitized.password;
    return sanitized;
  }

  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      return this.sanitizeUser(user);
    } catch (error) {
      logger.error('Token validation error:', error);
      throw new Error('Invalid token');
    }
  }
}

module.exports = new AuthService(); 