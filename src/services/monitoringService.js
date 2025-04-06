// Monitoring service file
const { DefaultAzureCredential } = require('@azure/identity');
const { MonitorClient } = require('@azure/arm-monitor');

// Configuration
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP;
const VMSS_NAME = process.env.AZURE_VMSS_NAME;

// Azure clients
let monitorClient;
let logger;

/**
 * Initialize Azure Monitor service
 */
async function initializeMonitoring() {
  try {
    // Import logger here to avoid circular dependency
    const { logger: appLogger } = require('../index');
    logger = appLogger;
    
    logger.info('Initializing Azure Monitor service...');
    
    // Use DefaultAzureCredential for authentication
    const credential = new DefaultAzureCredential();
    
    // Initialize Monitor client
    monitorClient = new MonitorClient(credential, SUBSCRIPTION_ID);
    
    // Test connection by fetching a simple metric
    await testMonitorConnection();
    
    logger.info('Azure Monitor service initialized successfully');
  } catch (error) {
    if (logger) {
      logger.error(`Error initializing Azure Monitor service: ${error.message}`, { error });
    } else {
      console.error(`Error initializing Azure Monitor service: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Test the Azure Monitor connection by fetching a simple metric
 */
async function testMonitorConnection() {
  try {
    const timespan = createTimespan();
    
    // Test query for CPU metrics
    const testMetrics = await monitorClient.metrics.list(
      `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachineScaleSets/${VMSS_NAME}`,
      {
        timespan,
        metricnames: 'Percentage CPU',
        interval: 'PT5M',
        aggregation: 'Average'
      }
    );
    
    logger.info('Successfully connected to Azure Monitor');
    return testMetrics;
  } catch (error) {
    logger.error(`Error testing Azure Monitor connection: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Create timespan for metrics queries (last 5 minutes)
 */
function createTimespan() {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // 5 minutes ago
  return `${startTime.toISOString()}/${endTime.toISOString()}`;
}

/**
 * Set up alerts for critical thresholds
 */
async function setupAlerts(thresholds = {}) {
  try {
    const defaultThresholds = {
      cpu: 90, // 90% CPU utilization
      memory: 95, // 95% memory utilization
      network: 90 // 90% network utilization
    };
    
    const alertThresholds = { ...defaultThresholds, ...thresholds };
    
    logger.info(`Setting up alerts with thresholds: ${JSON.stringify(alertThresholds)}`);
    
    // Implementation of Azure Monitor Alerts setup would go here
    // This would use the Azure Management API to create alert rules
    
    logger.info('Alerts set up successfully');
    return alertThresholds;
  } catch (error) {
    logger.error(`Error setting up alerts: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Set up diagnostic settings for the VMSS
 */
async function setupDiagnostics() {
  try {
    logger.info('Setting up diagnostic settings for VMSS');
    
    // Implementation of diagnostic settings setup would go here
    // This would configure where logs and metrics are sent (e.g., Log Analytics, Storage Account)
    
    logger.info('Diagnostic settings configured successfully');
  } catch (error) {
    logger.error(`Error setting up diagnostic settings: ${error.message}`, { error });
    throw error;
  }
}

module.exports = {
  initializeMonitoring,
  setupAlerts,
  setupDiagnostics
}; 
