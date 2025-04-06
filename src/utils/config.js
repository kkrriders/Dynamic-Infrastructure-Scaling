const logger = require('./logger');

// Required environment variables
const requiredVars = [
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_RESOURCE_GROUP',
  'AZURE_VMSS_NAME',
  'AZURE_STORAGE_ACCOUNT_NAME',
  'AZURE_STORAGE_CONTAINER_NAME'
];

// Optional environment variables with defaults
const optionalVars = {
  'PORT': '3000',
  'COLLECTION_INTERVAL_MS': '300000',
  'PREDICTION_HORIZON': '12',
  'LOOKBACK_WINDOW': '24',
  'CPU_THRESHOLD': '70',
  'MEMORY_THRESHOLD': '80',
  'NETWORK_THRESHOLD': '75',
  'CURRENT_INSTANCES': '2',
  'SCALING_METHOD': 'azure-sdk',
  'TERRAFORM_DIR': './infrastructure/terraform',
  'MODEL_SAVE_PATH': 'file://./models',
  'AZURE_LOCATION': 'eastus',
  'LOG_LEVEL': 'info'
};

// Validate environment variables
function validateEnv() {
  const missingVars = [];
  
  // Check for required vars
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  // Set defaults for optional vars if not present
  for (const [varName, defaultValue] of Object.entries(optionalVars)) {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
      logger.info(`Environment variable ${varName} not set, using default: ${defaultValue}`);
    }
  }
  
  // Check for OpenAI API key if insights are enabled
  if (process.env.ENABLE_INSIGHTS !== 'false' && !process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not set - insight features will not be available');
    process.env.ENABLE_INSIGHTS = 'false';
  }
  
  // If any required vars are missing, log and return false
  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    return false;
  }
  
  // Validate numeric values
  const numericVars = ['PORT', 'COLLECTION_INTERVAL_MS', 'PREDICTION_HORIZON', 'LOOKBACK_WINDOW', 
                       'CPU_THRESHOLD', 'MEMORY_THRESHOLD', 'NETWORK_THRESHOLD', 'CURRENT_INSTANCES'];
  
  for (const varName of numericVars) {
    const value = parseInt(process.env[varName], 10);
    if (isNaN(value)) {
      logger.error(`Environment variable ${varName} must be a number, got: ${process.env[varName]}`);
      return false;
    }
    // Update with parsed int value
    process.env[varName] = value.toString();
  }
  
  logger.info('Environment validation complete - all required variables present');
  return true;
}

// Get config object with all environment variables
function getConfig() {
  return {
    azure: {
      subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP,
      vmssName: process.env.AZURE_VMSS_NAME,
      storageAccount: process.env.AZURE_STORAGE_ACCOUNT_NAME,
      storageContainer: process.env.AZURE_STORAGE_CONTAINER_NAME,
      location: process.env.AZURE_LOCATION
    },
    app: {
      port: parseInt(process.env.PORT, 10),
      collectionIntervalMs: parseInt(process.env.COLLECTION_INTERVAL_MS, 10),
      predictionHorizon: parseInt(process.env.PREDICTION_HORIZON, 10),
      lookbackWindow: parseInt(process.env.LOOKBACK_WINDOW, 10),
      thresholds: {
        cpu: parseInt(process.env.CPU_THRESHOLD, 10),
        memory: parseInt(process.env.MEMORY_THRESHOLD, 10),
        network: parseInt(process.env.NETWORK_THRESHOLD, 10)
      },
      currentInstances: parseInt(process.env.CURRENT_INSTANCES, 10),
      scalingMethod: process.env.SCALING_METHOD,
      terraformDir: process.env.TERRAFORM_DIR,
      modelSavePath: process.env.MODEL_SAVE_PATH,
      enableInsights: process.env.ENABLE_INSIGHTS !== 'false'
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
    }
  };
}

module.exports = {
  validateEnv,
  getConfig
}; 