const mongoose = require('mongoose');
const logger = require('./logger');

let isConnected = false;

/**
 * Connect to MongoDB
 */
async function connectToDatabase() {
  if (isConnected) {
    logger.info('Already connected to MongoDB');
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynamic-scaling';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectFromDatabase() {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error(`MongoDB disconnection error: ${error.message}`, { error });
    throw error;
  }
}

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  isConnected: () => isConnected
}; 