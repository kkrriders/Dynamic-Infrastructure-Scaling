require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Import utilities
const logger = require('./utils/logger');
const config = require('./utils/config');
const { errorHandler, requestLogger, rateLimit } = require('./utils/middleware');

// Only import services after config validation
let monitoringService, dataCollectionService, modelService, infrastructureService;

// Import API routes
const predictionRoutes = require('./api/predictionRoutes');
const insightsRoutes = require('./api/insightsRoutes');
const infrastructureRoutes = require('./api/infrastructureRoutes');
const metricsRoutes = require('./api/metricsRoutes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Apply basic middleware
app.use(helmet()); // Security headers
app.use(compression()); // Response compression
app.use(cors()); // CORS handling
app.use(express.json()); // Parse JSON bodies
app.use(requestLogger); // Request logging
app.use(rateLimit({ 
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 300 // 300 requests per 5 minutes
})); // Rate limiting

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Validate environment variables
if (!config.validateEnv()) {
  logger.error('Application startup failed: environment validation failed');
  process.exit(1);
}

// Now import services (after environment validation)
try {
  monitoringService = require('./services/monitoringService');
  dataCollectionService = require('./services/dataCollectionService');
  modelService = require('./services/modelService');
  infrastructureService = require('./services/infrastructureService');
} catch (error) {
  logger.error(`Error importing services: ${error.message}`, { error });
  process.exit(1);
}

// Register API routes
app.use('/api/predictions', predictionRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/infrastructure', infrastructureRoutes);
app.use('/metrics', metricsRoutes);

// Global error handler
app.use(errorHandler);

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.originalUrl} not found` });
});

// Initialize services
async function initializeServices() {
  try {
    logger.info('Initializing services...');
    
    // Initialize metrics with resource group and VMSS name
    const metrics = require('./utils/metrics');
    metrics.initializeMetrics(
      process.env.AZURE_RESOURCE_GROUP,
      process.env.AZURE_VMSS_NAME
    );
    logger.info('Metrics initialized');
    
    // Initialize Azure monitoring
    await monitoringService.initializeMonitoring();
    logger.info('Azure monitoring initialized');
    
    // Start data collection service
    await dataCollectionService.startDataCollection();
    logger.info('Data collection service started');
    
    // Initialize ML model service
    await modelService.initializeModelService();
    logger.info('Model service initialized');
    
    // Setup infrastructure client
    await infrastructureService.setupInfrastructureClient();
    logger.info('Infrastructure client initialized');
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error(`Error initializing services: ${error.message}`, { error });
    process.exit(1);
  }
}

// Start the application
const server = app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  await initializeServices();
});

// Handle graceful shutdown
function shutdown() {
  logger.info('Shutdown signal received, closing HTTP server...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app }; 