const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const { MonitorClient } = require('@azure/arm-monitor');
const { logger } = require('../index');

// Configuration
const STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP;
const VMSS_NAME = process.env.AZURE_VMSS_NAME;
const COLLECTION_INTERVAL_MS = parseInt(process.env.COLLECTION_INTERVAL_MS || '300000'); // 5 minutes by default

// Azure clients
let blobServiceClient;
let monitorClient;
let containerClient;

/**
 * Initialize Azure clients for data collection
 */
async function initializeClients() {
  try {
    // Use DefaultAzureCredential for authentication
    const credential = new DefaultAzureCredential();
    
    // Initialize Monitor client
    monitorClient = new MonitorClient(credential, SUBSCRIPTION_ID);
    logger.info('Azure Monitor client initialized');
    
    // Initialize Blob Storage client
    blobServiceClient = new BlobServiceClient(
      `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
    
    // Get container client
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    
    // Create container if it doesn't exist
    const containerExists = await containerClient.exists();
    if (!containerExists) {
      logger.info(`Creating container: ${CONTAINER_NAME}`);
      await containerClient.create();
    }
    
    logger.info('Blob Storage client initialized');
  } catch (error) {
    logger.error(`Error initializing Azure clients: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Collect metrics from Azure Monitor
 */
async function collectMetrics() {
  try {
    const timespan = createTimespan();
    
    // Collect CPU metrics
    const cpuMetrics = await monitorClient.metrics.list(
      `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachineScaleSets/${VMSS_NAME}`,
      {
        timespan,
        interval: 'PT5M',
        metricnames: 'Percentage CPU',
        aggregation: 'Average,Maximum'
      }
    );
    
    // Collect memory metrics
    const memoryMetrics = await monitorClient.metrics.list(
      `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachineScaleSets/${VMSS_NAME}`,
      {
        timespan,
        interval: 'PT5M',
        metricnames: 'Available Memory Bytes',
        aggregation: 'Average'
      }
    );
    
    // Collect network metrics
    const networkMetrics = await monitorClient.metrics.list(
      `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachineScaleSets/${VMSS_NAME}`,
      {
        timespan,
        interval: 'PT5M',
        metricnames: 'Network In,Network Out',
        aggregation: 'Total'
      }
    );
    
    // Combine metrics
    const metricsData = {
      timestamp: new Date().toISOString(),
      cpu: cpuMetrics.value,
      memory: memoryMetrics.value,
      network: networkMetrics.value
    };
    
    return metricsData;
  } catch (error) {
    logger.error(`Error collecting metrics: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Store metrics in Azure Blob Storage
 */
async function storeMetrics(metricsData) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const blobName = `metrics_${timestamp}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    const data = JSON.stringify(metricsData, null, 2);
    await blockBlobClient.upload(data, data.length);
    
    logger.info(`Metrics stored in blob: ${blobName}`);
    return blobName;
  } catch (error) {
    logger.error(`Error storing metrics: ${error.message}`, { error });
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
 * Start periodic data collection
 */
async function startDataCollection() {
  try {
    await initializeClients();
    
    // Perform initial collection
    const initialMetrics = await collectMetrics();
    await storeMetrics(initialMetrics);
    
    // Set up interval for periodic collection
    setInterval(async () => {
      try {
        const metrics = await collectMetrics();
        await storeMetrics(metrics);
      } catch (error) {
        logger.error(`Error in periodic metrics collection: ${error.message}`, { error });
      }
    }, COLLECTION_INTERVAL_MS);
    
    logger.info(`Data collection started with interval: ${COLLECTION_INTERVAL_MS}ms`);
  } catch (error) {
    logger.error(`Failed to start data collection: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Retrieve historical metrics for analysis
 * @param {number} days - Number of days of historical data to retrieve
 */
async function getHistoricalMetrics(days = 7) {
  try {
    const metrics = [];
    
    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // List all blobs in the container
    for await (const blob of containerClient.listBlobsFlat()) {
      // Check if blob is a metrics file
      if (blob.name.startsWith('metrics_')) {
        const blobClient = containerClient.getBlobClient(blob.name);
        const downloadResponse = await blobClient.download();
        const content = await streamToString(downloadResponse.readableStreamBody);
        metrics.push(JSON.parse(content));
      }
    }
    
    // Sort metrics by timestamp
    metrics.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return metrics;
  } catch (error) {
    logger.error(`Error retrieving historical metrics: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Convert stream to string
 */
async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data.toString());
    });
    readableStream.on('end', () => {
      resolve(chunks.join(''));
    });
    readableStream.on('error', reject);
  });
}

module.exports = {
  startDataCollection,
  collectMetrics,
  storeMetrics,
  getHistoricalMetrics
}; 