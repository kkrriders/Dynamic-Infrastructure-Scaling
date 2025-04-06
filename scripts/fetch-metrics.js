#!/usr/bin/env node

/**
 * Script for fetching recent VM metrics from Azure
 * Collects CPU, memory, network, and disk metrics for scaling decisions
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MonitorClient } = require('@azure/arm-monitor');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { DefaultAzureCredential } = require('@azure/identity');
const logger = require('../src/utils/logger');

// Parse command line arguments
const args = process.argv.slice(2);
const argOptions = {
  resourceGroup: args.find(arg => arg.startsWith('--resource-group='))?.split('=')[1],
  vmssName: args.find(arg => arg.startsWith('--vmss-name='))?.split('=')[1],
  outputPath: args.find(arg => arg.startsWith('--output-path='))?.split('=')[1],
  interval: args.find(arg => arg.startsWith('--interval='))?.split('=')[1],
  lookbackHours: args.find(arg => arg.startsWith('--lookback='))?.split('=')[1],
  noSave: args.includes('--no-save'),
  stdout: args.includes('--stdout'),
  azureVmSize: args.find(arg => arg.startsWith('--vm-size='))?.split('=')[1]
};

// Configuration from environment variables with command line overrides
const RESOURCE_GROUP = argOptions.resourceGroup || process.env.AZURE_RESOURCE_GROUP;
const VMSS_NAME = argOptions.vmssName || process.env.AZURE_VMSS_NAME;
const OUTPUT_PATH = (argOptions.outputPath || process.env.METRICS_PATH || './data').replace('file://', '');
const TIME_INTERVAL_MIN = parseInt(argOptions.interval || process.env.METRICS_INTERVAL_MIN || '15');
const LOOKBACK_HOURS = parseInt(argOptions.lookbackHours || process.env.METRICS_LOOKBACK_HOURS || '1');
const NO_SAVE = argOptions.noSave;
const STDOUT = argOptions.stdout;
const AZURE_VM_SIZE = argOptions.azureVmSize || process.env.AZURE_VM_SIZE;

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info(`Starting metrics collection for ${VMSS_NAME} in ${RESOURCE_GROUP}`);
    logger.info(`Config: Lookback=${LOOKBACK_HOURS}h, Interval=${TIME_INTERVAL_MIN}min, Output=${NO_SAVE ? 'None' : STDOUT ? 'STDOUT' : OUTPUT_PATH}`);
    
    // Validate environment and parameters
    validateEnvironment();
    
    // Initialize Azure clients
    const credential = new DefaultAzureCredential();
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    
    if (!subscriptionId) {
      throw new Error('AZURE_SUBSCRIPTION_ID environment variable is required');
    }
    
    const monitorClient = new MonitorClient(credential, subscriptionId);
    const computeClient = new ComputeManagementClient(credential, subscriptionId);
    
    // Get VMSS info and resource ID
    let vmss;
    try {
      vmss = await computeClient.virtualMachineScaleSets.get(RESOURCE_GROUP, VMSS_NAME);
      if (!vmss || !vmss.id) {
        throw new Error('VMSS not found or ID missing');
      }
    } catch (error) {
      throw new Error(`Could not retrieve VMSS with name ${VMSS_NAME} in resource group ${RESOURCE_GROUP}: ${error.message}`);
    }
    
    const resourceId = vmss.id;
    const vmSize = AZURE_VM_SIZE || vmss.sku?.name;
    
    // Fetch metrics
    const metrics = await fetchMetrics(monitorClient, resourceId, vmSize);
    
    // Prepare output data
    const metricsData = {
      timestamp: new Date().toISOString(),
      resourceId: resourceId,
      resourceGroup: RESOURCE_GROUP,
      vmssName: VMSS_NAME,
      vmssDetails: {
        capacity: vmss.sku?.capacity || 0,
        location: vmss.location || 'unknown',
        vmSize: vmSize || 'unknown'
      },
      lookbackHours: LOOKBACK_HOURS,
      intervalMinutes: TIME_INTERVAL_MIN,
      metrics: metrics
    };
    
    // Output or save the data
    if (STDOUT) {
      console.log(JSON.stringify(metricsData, null, 2));
      logger.info('Metrics output to STDOUT');
    } else if (!NO_SAVE) {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(OUTPUT_PATH)) {
        logger.info(`Creating output directory: ${OUTPUT_PATH}`);
        fs.mkdirSync(OUTPUT_PATH, { recursive: true });
      }
      
      const metricsFilename = `metrics_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const metricsFilePath = path.join(OUTPUT_PATH, metricsFilename);
      
      try {
        fs.writeFileSync(metricsFilePath, JSON.stringify(metricsData, null, 2));
        logger.info(`Metrics saved to ${metricsFilePath}`);
      } catch (error) {
        throw new Error(`Failed to write metrics file: ${error.message}`);
      }
    } else {
      logger.info('Skipping saving metrics as requested');
    }
    
    logger.info('Metrics collection completed successfully');
  } catch (error) {
    logger.error(`Error in metrics collection: ${error.message}`, { error });
    process.exit(1);
  }
}

/**
 * Validate required environment variables and parameters
 */
function validateEnvironment() {
  const requiredVars = ['AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'AZURE_VMSS_NAME'];
  const missingVars = requiredVars.filter(varName => {
    if (varName === 'AZURE_RESOURCE_GROUP' && RESOURCE_GROUP) return false;
    if (varName === 'AZURE_VMSS_NAME' && VMSS_NAME) return false;
    return !process.env[varName];
  });
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  if (isNaN(TIME_INTERVAL_MIN) || TIME_INTERVAL_MIN < 1 || TIME_INTERVAL_MIN > 60) {
    throw new Error(`Invalid time interval: ${TIME_INTERVAL_MIN}. Must be between 1 and 60 minutes.`);
  }
  
  if (isNaN(LOOKBACK_HOURS) || LOOKBACK_HOURS < 1 || LOOKBACK_HOURS > 24) {
    throw new Error(`Invalid lookback hours: ${LOOKBACK_HOURS}. Must be between 1 and 24 hours.`);
  }
}

/**
 * Fetch recent metrics from Azure Monitor
 */
async function fetchMetrics(monitorClient, resourceId, vmSize) {
  logger.info('Fetching metrics from Azure Monitor...');
  
  // Define time range
  const endTime = new Date();
  const startTime = new Date(endTime);
  startTime.setHours(startTime.getHours() - LOOKBACK_HOURS);
  
  // Define metric definitions to fetch
  const metricDefinitions = [
    { name: 'Percentage CPU', namespace: 'Microsoft.Compute/virtualMachineScaleSets', aggregation: 'Average', key: 'cpuPercentage' },
    { name: 'Available Memory Bytes', namespace: 'Microsoft.Compute/virtualMachineScaleSets', aggregation: 'Average', key: 'memoryAvailableBytes' },
    { name: 'Network In Total', namespace: 'Microsoft.Compute/virtualMachineScaleSets', aggregation: 'Total', key: 'networkInBytes' }, // Use Network In Total
    { name: 'Network Out Total', namespace: 'Microsoft.Compute/virtualMachineScaleSets', aggregation: 'Total', key: 'networkOutBytes' }, // Use Network Out Total
    { name: 'Disk Read Bytes', namespace: 'Microsoft.Compute/virtualMachineScaleSets', aggregation: 'Average', key: 'diskReadBytesPerSec' }, // Disk metrics often reported as rate
    { name: 'Disk Write Bytes', namespace: 'Microsoft.Compute/virtualMachineScaleSets', aggregation: 'Average', key: 'diskWriteBytesPerSec' }
  ];
  
  // Fetch each metric in parallel
  const results = await Promise.all(metricDefinitions.map(async (metricDef) => {
    try {
      logger.debug(`Fetching ${metricDef.name}...`);
      const metrics = await monitorClient.metrics.list(
        resourceId,
        {
          timespan: `${startTime.toISOString()}/${endTime.toISOString()}`,
          interval: `PT${TIME_INTERVAL_MIN}M`,
          metricnames: metricDef.name,
          aggregation: metricDef.aggregation
        }
      );
      
      return { key: metricDef.key, response: metrics, definition: metricDef };
    } catch (error) {
      logger.warn(`Error fetching metric ${metricDef.name}: ${error.message}`);
      return { key: metricDef.key, error: error.message, definition: metricDef };
    }
  }));
  
  // Process results
  const processedMetrics = {};
  for (const result of results) {
    if (result.error) {
      processedMetrics[result.key] = { error: result.error };
      continue;
    }
    
    processedMetrics[result.key] = processMetricResponse(result.response, result.definition);
  }
  
  // Calculate derived metrics (e.g., memory percentage used)
  if (processedMetrics.memoryAvailableBytes && !processedMetrics.memoryAvailableBytes.error) {
    try {
      const totalMemoryBytes = getTotalMemory(vmSize);
      if (totalMemoryBytes > 0) {
        processedMetrics.memoryUsedPercentage = {
          unit: 'Percent',
          current: null,
          history: []
        };
        
        // Convert current value
        if (processedMetrics.memoryAvailableBytes.current) {
          const availableBytes = processedMetrics.memoryAvailableBytes.current.value;
          const usedPercentage = Math.max(0, Math.min(100, 100 - (availableBytes / totalMemoryBytes * 100)));
          processedMetrics.memoryUsedPercentage.current = {
            timestamp: processedMetrics.memoryAvailableBytes.current.timestamp,
            value: usedPercentage
          };
        }
        
        // Convert historical values
        for (const point of processedMetrics.memoryAvailableBytes.history) {
          const availableBytes = point.value;
          const usedPercentage = Math.max(0, Math.min(100, 100 - (availableBytes / totalMemoryBytes * 100)));
          processedMetrics.memoryUsedPercentage.history.push({
            timestamp: point.timestamp,
            value: usedPercentage
          });
        }
        
        logger.debug('Calculated memory usage percentage');
      }
    } catch (error) {
      logger.warn(`Error calculating memory usage percentage: ${error.message}`);
      processedMetrics.memoryUsedPercentage = { error: error.message };
    }
  }
  
  return processedMetrics;
}

/**
 * Process metric response from Azure Monitor API
 */
function processMetricResponse(metrics, metricDef) {
  const result = {
    unit: metrics.value?.[0]?.unit || 'Unknown',
    current: null,
    history: []
  };
  
  try {
    const timeSeries = metrics.value?.[0]?.timeseries?.[0]?.data || [];
    
    if (timeSeries.length === 0) {
      logger.debug(`No time series data found for metric: ${metricDef.name}`);
      return result;
    }
    
    // Process historical data and find the latest valid point
    let latestValidTimestamp = null;
    let latestValidValue = null;
    
    for (const point of timeSeries) {
      const value = point[metricDef.aggregation.toLowerCase()];
      if (value !== undefined && value !== null && !isNaN(value)) {
        const timestamp = new Date(point.timeStamp);
        result.history.push({
          timestamp: timestamp.toISOString(),
          value: value
        });
        
        // Track the latest valid point
        if (!latestValidTimestamp || timestamp > latestValidTimestamp) {
          latestValidTimestamp = timestamp;
          latestValidValue = value;
        }
      }
    }
    
    // Set current value if found
    if (latestValidTimestamp) {
      result.current = {
        timestamp: latestValidTimestamp.toISOString(),
        value: latestValidValue
      };
    }
    
    // Sort history by timestamp (descending for easier use in prompts)
    result.history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return result;
  } catch (error) {
    logger.warn(`Error processing metric response for ${metricDef.name}: ${error.message}`);
    result.error = error.message;
    return result;
  }
}

/**
 * Get total memory for the VM size (simplified)
 */
function getTotalMemory(vmSize) {
  try {
    if (!vmSize) {
      logger.warn('VM size not provided or found, cannot accurately calculate memory percentage. Assuming 8GiB.');
      return 8 * 1024 * 1024 * 1024;
    }
    
    // Simplified map - add more sizes as needed
    const vmSizeMemory = {
      'standard_d2s_v3': 8 * 1024 * 1024 * 1024,
      'standard_d4s_v3': 16 * 1024 * 1024 * 1024,
      'standard_d8s_v3': 32 * 1024 * 1024 * 1024,
      'standard_d16s_v3': 64 * 1024 * 1024 * 1024,
      'standard_ds1_v2': 3.5 * 1024 * 1024 * 1024,
      'standard_ds2_v2': 7 * 1024 * 1024 * 1024,
      'standard_f2s_v2': 4 * 1024 * 1024 * 1024,
      'standard_f4s_v2': 8 * 1024 * 1024 * 1024,
    };
    
    const memory = vmSizeMemory[vmSize.toLowerCase()];
    
    if (!memory) {
      logger.warn(`Unknown VM size: ${vmSize}. Cannot determine memory. Assuming 8GiB.`);
      return 8 * 1024 * 1024 * 1024;
    }
    
    return memory;
  } catch (error) {
    logger.warn(`Error determining VM memory: ${error.message}`);
    return 8 * 1024 * 1024 * 1024; // Default to 8GiB
  }
}

// Display usage information
function printUsage() {
  console.log(`
Usage: node fetch-metrics.js [options]

Collects recent Azure VMSS metrics for analysis.

Options:
  --resource-group=NAME    Azure resource group containing VMSS (Required)
  --vmss-name=NAME         Name of VM Scale Set to monitor (Required)
  --output-path=PATH       Path to save metrics data (default: ./data, use --no-save to disable)
  --interval=MINUTES       Metrics collection interval in minutes (default: ${TIME_INTERVAL_MIN})
  --lookback=HOURS         Hours of historical data to fetch (default: ${LOOKBACK_HOURS})
  --vm-size=STRING         Specify VM size to aid memory calculation (e.g., Standard_D4s_v3)
  --no-save                Do not save metrics to a file
  --stdout                 Output metrics JSON to standard output instead of saving to file
  --help, -h               Show this help message

Environment variables:
  AZURE_SUBSCRIPTION_ID    Azure subscription ID (Required)
  AZURE_RESOURCE_GROUP     Azure resource group (can be overridden by --resource-group)
  AZURE_VMSS_NAME          Name of VM Scale Set (can be overridden by --vmss-name)
  METRICS_PATH             Path to save metrics data (can be overridden by --output-path)
  METRICS_INTERVAL_MIN     Metrics collection interval (can be overridden by --interval)
  METRICS_LOOKBACK_HOURS   Hours of historical data (can be overridden by --lookback)
  AZURE_VM_SIZE            VM size for memory calculation (can be overridden by --vm-size)
  `);
}

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

// Run the script
main(); 