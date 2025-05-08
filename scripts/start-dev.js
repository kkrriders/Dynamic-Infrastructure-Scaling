/**
 * Development Startup Script
 * 
 * This script:
 * 1. Checks MongoDB connection
 * 2. Creates an admin user if none exists
 * 3. Starts the backend server
 * 4. Logs environment configuration
 */

require('dotenv').config();
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { connectToDatabase, disconnectFromDatabase } = require('../src/utils/db');
const logger = require('../src/utils/logger');

// Admin user config
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpassword';

/**
 * Create admin user if none exists
 */
async function ensureAdminUser() {
  try {
    // Check if any admin exists
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (adminExists) {
      logger.info(`Admin user already exists: ${adminExists.email}`);
      return;
    }
    
    // Create admin user
    const adminUser = new User({
      name: 'Admin User',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin'
    });
    
    await adminUser.save();
    logger.info(`Created initial admin user: ${ADMIN_EMAIL}`);
  } catch (error) {
    logger.error(`Error ensuring admin user: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Log environment configuration
 */
function logConfiguration() {
  const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3001,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/dynamic-scaling',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    ADMIN_EMAIL,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
  };
  
  // Mask sensitive values
  const maskedConfig = { ...config };
  if (maskedConfig.ADMIN_PASSWORD) maskedConfig.ADMIN_PASSWORD = '********';
  if (maskedConfig.JWT_SECRET) maskedConfig.JWT_SECRET = '********';
  
  logger.info('Environment configuration:', maskedConfig);
}

/**
 * Start backend server
 */
function startBackend() {
  logger.info('Starting backend server...');
  
  const server = spawn('node', ['src/index.js'], { 
    stdio: 'inherit',
    env: process.env
  });
  
  server.on('error', (error) => {
    logger.error(`Server process error: ${error.message}`, { error });
    process.exit(1);
  });
  
  server.on('close', (code) => {
    logger.info(`Server process exited with code ${code}`);
    process.exit(code);
  });
  
  // Handle shutdown signals
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    server.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    server.kill('SIGTERM');
  });
}

/**
 * Main function
 */
async function main() {
  try {
    // Log configuration
    logConfiguration();
    
    // Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    await connectToDatabase();
    
    // Ensure admin user exists
    await ensureAdminUser();
    
    // Start backend server
    startBackend();
  } catch (error) {
    logger.error(`Startup error: ${error.message}`, { error });
    await disconnectFromDatabase();
    process.exit(1);
  }
}

// Run main function
main(); 