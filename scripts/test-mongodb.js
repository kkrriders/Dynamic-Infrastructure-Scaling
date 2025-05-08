require('dotenv').config();
const mongoose = require('mongoose');

async function testMongoDBConnection() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynamic-scaling';
    console.log(`Attempting to connect to MongoDB at: ${mongoUri}`);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Successfully connected to MongoDB!');
    
    // Test creating a collection
    const db = mongoose.connection.db;
    await db.createCollection('test_collection');
    console.log('✅ Successfully created a test collection');
    
    // Clean up
    await db.dropCollection('test_collection');
    console.log('✅ Successfully cleaned up test collection');
    
    console.log('All MongoDB tests passed!');
  } catch (error) {
    console.error('❌ MongoDB connection test failed!');
    console.error(`Error: ${error.message}`);
    console.error(error);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  }
}

// Run the test
testMongoDBConnection(); 