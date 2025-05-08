require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('../utils/logger');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynamic-scaling';

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('Connected to MongoDB');
    
    // Check if any users already exist
    const count = await User.countDocuments();
    
    if (count > 0) {
      logger.info('Users already exist. Skipping admin creation.');
      return;
    }
    
    // Create admin user
    const adminUser = new User({
      name: 'Admin User',
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: process.env.ADMIN_PASSWORD || 'adminpassword',
      role: 'admin'
    });
    
    await adminUser.save();
    
    logger.info(`Admin user created successfully: ${adminUser.email}`);
  } catch (error) {
    logger.error(`Error creating admin user: ${error.message}`, { error });
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
};

// Run the script
createAdminUser(); 