#!/usr/bin/env node

/**
 * Fetch recent metrics from cloud providers (Azure or GCP)
 * Saves metrics as JSON files for later processing
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DefaultAzureCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { MonitorClient } = require('@azure/arm-monitor');
const logger = require('../src/utils/logger');
const gcpService = require('../src/services/gcpService');

// Parse command line arguments
const args = process.argv.slice(2);
const argOptions = {
  resourceGroup: args.find(arg => arg.startsWith('--resource-group='))?.split('=')[1],
  vmssName: args.find(arg => arg.startsWith('--vmss-name='))?.split('=')[1],
  instanceGroup: args.find(arg => arg.startsWith('--instance-group='))?.split('=')[1],
  outputPath: args.find(arg => arg.startsWith('--output-path='))?.split('=')[1],
  lookbackHours: args.find(arg => arg.startsWith('--lookback='))?.split('=')[1],
  intervalMinutes: args.find(arg => arg.startsWith('--interval='))?.split('=')[1],
  vmSize: args.find(arg => arg.startsWith('--vm-size='))?.split('=')[1],
  cloud: args.find(arg => arg.startsWith('--cloud='))?.split('=')[1],
  project: args.find(arg => arg.startsWith('--project='))?.split('=')[1],
  zone: args.find(arg => arg.startsWith('--zone='))?.split('=')[1],
  noSave: args.includes('--no-save'),
  stdout: args.includes('--stdout')
};

// Cloud provider selection
const CLOUD_PROVIDER = argOptions.cloud || process.env.CLOUD_PROVIDER || 'azure';

// Azure configuration
const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const AZURE_RESOURCE_GROUP = argOptions.resourceGroup || process.env.AZURE_RESOURCE_GROUP;
const AZURE_VMSS_NAME = argOptions.vmssName || process.env.AZURE_VMSS_NAME;

// GCP configuration
const GCP_PROJECT_ID = argOptions.project || process.env.GCP_PROJECT_ID;
const GCP_INSTANCE_GROUP = argOptions.instanceGroup || process.env.GCP_INSTANCE_GROUP;
const GCP_ZONE = argOptions.zone || process.env.GCP_ZONE;

// Common configuration
const OUTPUT_PATH = argOptions.outputPath || process.env.METRICS_PATH || './data';
const LOOKBACK_HOURS = parseInt(argOptions.lookbackHours || process.env.METRICS_LOOKBACK_HOURS || '1');
const INTERVAL_MINUTES = parseInt(argOptions.intervalMinutes || process.env.METRICS_INTERVAL_MINUTES || '15');
const VM_SIZE = argOptions.vmSize || process.env.VM_SIZE;
const SAVE_TO_FILE = !argOptions.noSave;
const PRINT_TO_STDOUT = argOptions.stdout;

// VM sizes and their approximate memory in GB
// Used for calculating memory percentage when not directly available
const VM_SIZES = {
  'Standard_B1ms': 2,
  'Standard_B2ms': 8,
  'Standard_DS1_v2': 3.5,
  'Standard_DS2_v2': 7,
  'Standard_DS3_v2': 14,
  'Standard_DS4_v2': 28,
  'Standard_D2s_v3': 8,
  'Standard_D4s_v3': 16,
  'Standard_D8s_v3': 32,
  // Add more VM sizes as needed
};

/**
 * Main function to collect metrics
 */
async function collectMetrics() {
  try {
    switch (CLOUD_PROVIDER.toLowerCase()) {
      case 'azure':
        return await collectAzureMetrics();
      case 'gcp':
        return await collectGcpMetrics();
      case 'multi':
        // For multi-cloud, run both in parallel
        const [azureMetrics, gcpMetrics] = await Promise.all([
          collectAzureMetrics(),
          collectGcpMetrics()
        ]);
        return { azure: azureMetrics, gcp: gcpMetrics };
      default:
        throw new Error(`Unknown cloud provider: ${CLOUD_PROVIDER}`);
    }
  } catch (error) {
    logger.error(`Error in metrics collection: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Collect metrics from Azure VMSS
 */
async function collectAzureMetrics() {
  logger.info(`Starting metrics collection for ${AZURE_VMSS_NAME} in ${AZURE_RESOURCE_GROUP}`);
  logger.info(`Config: Lookback=${LOOKBACK_HOURS}h, Interval=${INTERVAL_MINUTES}min, Output=${OUTPUT_PATH}`);
  
  try {
    // Initialize Azure credentials and clients
    const credential = new DefaultAzureCredential();
    const computeClient = new ComputeManagementClient(credential, AZURE_SUBSCRIPTION_ID);
    const monitorClient = new MonitorClient(credential, AZURE_SUBSCRIPTION_ID);
    
    // Get VMSS info
    const vmss = await computeClient.virtualMachineScaleSets.get(
      AZURE_RESOURCE_GROUP,
      AZURE_VMSS_NAME
    );
    
    // Get current capacity and SKU
    const currentCapacity = vmss.sku.capacity;
    const vmSize = VM_SIZE || vmss.sku.name;
    
    // Calculate time range for metrics query
    const now = new Date();
    const startTime = new Date(now.getTime() - (LOOKBACK_HOURS * 60 * 60 * 1000));
    
    // Resource ID for the VMSS
    const resourceId = `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachineScaleSets/${AZURE_VMSS_NAME}`;
    
    // Get metrics (CPU, memory if available, network in/out)
    const cpuMetrics = await monitorClient.metrics.list(
      resourceId,
      {
        timespan: `${startTime.toISOString()}/${now.toISOString()}`,
        interval: `PT${INTERVAL_MINUTES}M`,
        metricnames: 'Percentage CPU',
        aggregation: 'Average'
      }
    );
    
    // Try to get memory metrics, but these might not be available without diagnostics extension
    let memoryMetrics;
    try {
      memoryMetrics = await monitorClient.metrics.list(
        resourceId,
        {
          timespan: `${startTime.toISOString()}/${now.toISOString()}`,
          interval: `PT${INTERVAL_MINUTES}M`,
          metricnames: 'Available Memory Bytes',
          aggregation: 'Average'
        }
      );
    } catch (error) {
      logger.warn('Memory metrics not available, will estimate based on VM size');
    }
    
    // Get network metrics
    const networkInMetrics = await monitorClient.metrics.list(
      resourceId,
      {
        timespan: `${startTime.toISOString()}/${now.toISOString()}`,
        interval: `PT${INTERVAL_MINUTES}M`,
        metricnames: 'Network In',
        aggregation: 'Total'
      }
    );
    
    const networkOutMetrics = await monitorClient.metrics.list(
      resourceId,
      {
        timespan: `${startTime.toISOString()}/${now.toISOString()}`,
        interval: `PT${INTERVAL_MINUTES}M`,
        metricnames: 'Network Out',
        aggregation: 'Total'
      }
    );
    
    // Process metrics into a standardized format
    const formattedCpuMetrics = formatAzureMetrics(cpuMetrics, 'cpu');
    const formattedMemoryMetrics = memoryMetrics ? 
      formatAzureMemoryMetrics(memoryMetrics, vmSize) : [];
    const formattedNetworkInMetrics = formatAzureMetrics(networkInMetrics, 'networkIn');
    const formattedNetworkOutMetrics = formatAzureMetrics(networkOutMetrics, 'networkOut');
    
    // Construct metrics object
    const metricsData = {
      timestamp: now.toISOString(),
      resourceGroup: AZURE_RESOURCE_GROUP,
      vmssName: AZURE_VMSS_NAME,
      vmSize: vmSize,
      currentCapacity: currentCapacity,
      lookbackHours: LOOKBACK_HOURS,
      intervalMinutes: INTERVAL_MINUTES,
      metrics: {
        cpu: formattedCpuMetrics,
        memory: formattedMemoryMetrics,
        networkIn: formattedNetworkInMetrics,
        networkOut: formattedNetworkOutMetrics
      }
    };
    
    // Save or output metrics
    if (SAVE_TO_FILE) {
      const filePath = await saveMetricsToFile(metricsData);
      logger.info(`Metrics saved to ${filePath}`);
    }
    
    if (PRINT_TO_STDOUT) {
      console.log(JSON.stringify(metricsData, null, 2));
    }
    
    return metricsData;
  } catch (error) {
    logger.error(`Error in Azure metrics collection: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Collect metrics from GCP Instance Group
 */
async function collectGcpMetrics() {
  logger.info(`Starting metrics collection for instance group ${GCP_INSTANCE_GROUP} in ${GCP_PROJECT_ID}`);
  logger.info(`Config: Lookback=${LOOKBACK_HOURS}h, Interval=${INTERVAL_MINUTES}min, Output=${OUTPUT_PATH}`);
  
  try {
    // Initialize GCP service
    await gcpService.initializeGcpService();
    
    // Collect instance group metrics
    const metricsData = await gcpService.collectInstanceGroupMetrics(
      GCP_INSTANCE_GROUP, 
      LOOKBACK_HOURS, 
      INTERVAL_MINUTES
    );
    
    // Save or output metrics
    if (SAVE_TO_FILE) {
      const filePath = await gcpService.saveMetricsToFile(metricsData, OUTPUT_PATH);
      logger.info(`GCP metrics saved to ${filePath}`);
    }
    
    if (PRINT_TO_STDOUT) {
      console.log(JSON.stringify(metricsData, null, 2));
    }
    
    return metricsData;
  } catch (error) {
    logger.error(`Error in GCP metrics collection: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Format Azure metrics into a standardized format
 * @param {Object} metricsResult - Azure metrics result
 * @param {string} metricType - Type of metric (cpu, networkIn, networkOut)
 * @returns {Array} Formatted metrics data
 */
function formatAzureMetrics(metricsResult, metricType) {
  if (!metricsResult || !metricsResult.value || metricsResult.value.length === 0 || 
      !metricsResult.value[0].timeseries || metricsResult.value[0].timeseries.length === 0) {
    logger.warn(`No ${metricType} metrics found`);
    return [];
  }
  
  // Get first time series (usually there's only one)
  const timeSeries = metricsResult.value[0].timeseries[0];
  
  // Map data points to standardized format
  return timeSeries.data
    .filter(point => point.average !== null || point.total !== null)
    .map(point => ({
      timestamp: point.timeStamp,
      value: metricType.startsWith('network') ? point.total : point.average
    }));
}

/**
 * Format Azure memory metrics with percentage calculation
 * @param {Object} metricsResult - Azure memory metrics result
 * @param {string} vmSize - VM size for memory conversion
 * @returns {Array} Formatted memory metrics data
 */
function formatAzureMemoryMetrics(metricsResult, vmSize) {
  if (!metricsResult || !metricsResult.value || metricsResult.value.length === 0 || 
      !metricsResult.value[0].timeseries || metricsResult.value[0].timeseries.length === 0) {
    logger.warn('No memory metrics found');
    return [];
  }
  
  // Get first time series
  const timeSeries = metricsResult.value[0].timeseries[0];
  
  // Total memory based on VM size
  const totalMemoryGB = VM_SIZES[vmSize] || 8; // Default to 8GB if unknown
  const totalMemoryBytes = totalMemoryGB * 1024 * 1024 * 1024;
  
  // Map data points and calculate memory percentage
  return timeSeries.data
    .filter(point => point.average !== null)
    .map(point => {
      const availableMemoryBytes = point.average;
      const usedMemoryBytes = totalMemoryBytes - availableMemoryBytes;
      const memoryPercentage = (usedMemoryBytes / totalMemoryBytes) * 100;
      
      return {
        timestamp: point.timeStamp,
        value: Math.min(100, Math.max(0, memoryPercentage)) // Clamp between 0-100
      };
    });
}

/**
 * Save metrics data to a file
 * @param {Object} metricsData - Metrics data object
 * @returns {Promise<string>} Path to saved file
 */
async function saveMetricsToFile(metricsData) {
  if (!fs.existsSync(OUTPUT_PATH)) {
    fs.mkdirSync(OUTPUT_PATH, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const fileName = `metrics_${metricsData.vmssName || 'azure'}_${timestamp}.json`;
  const filePath = path.join(OUTPUT_PATH, fileName);
  
  await fs.promises.writeFile(
    filePath, 
    JSON.stringify(metricsData, null, 2)
  );
  
  return filePath;
}

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node fetch-metrics.js [options]

Fetch recent metrics from Azure VMSS or GCP Instance Groups and save as JSON files.

Common Options:
  --cloud=PROVIDER        Cloud provider to use (azure, gcp, or multi) [default: ${CLOUD_PROVIDER}]
  --output-path=PATH      Path to save metrics files [default: ${OUTPUT_PATH}]
  --lookback=HOURS        Hours of history to fetch [default: ${LOOKBACK_HOURS}]
  --interval=MINUTES      Aggregation interval in minutes [default: ${INTERVAL_MINUTES}]
  --no-save               Don't save metrics to file
  --stdout                Output metrics to stdout
  --help, -h              Show this help

Azure Options:
  --resource-group=NAME   Azure Resource Group name
  --vmss-name=NAME        Azure VMSS name
  --vm-size=SIZE          VM size (if not auto-detected)

GCP Options:
  --project=ID            GCP Project ID
  --instance-group=NAME   GCP Instance Group name
  --zone=ZONE             GCP Zone

Examples:
  # Fetch Azure metrics
  node fetch-metrics.js --cloud=azure --resource-group=mygroup --vmss-name=myvmss
  
  # Fetch GCP metrics
  node fetch-metrics.js --cloud=gcp --project=myproject --instance-group=mygroup
  
  # Fetch metrics and print to stdout
  node fetch-metrics.js --stdout --no-save
  `);
  process.exit(0);
}

// Run the script
collectMetrics().catch(error => {
  console.error(`Error in metrics collection: ${error.message}`);
  process.exit(1);
}); 