require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

async function createAdminUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynamic-scaling';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Check if any users exist
    const count = await User.countDocuments();
    
    if (count > 0) {
      console.log('Users already exist. Skipping admin creation.');
      return;
    }
    
    // Create admin user
    const adminUser = new User({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'adminpassword',
      role: 'admin'
    });
    
    await adminUser.save();
    
    console.log(`Admin user created successfully: ${adminUser.email}`);
    console.log('You can now log in with:');
    console.log('Email: admin@example.com');
    console.log('Password: adminpassword');
  } catch (error) {
    console.error(`Error creating admin user: ${error.message}`);
    console.error(error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
createAdminUser(); 