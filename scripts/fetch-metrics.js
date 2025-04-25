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
 * Get total memory in bytes for a given VM size
 * @param {string} vmSize - Azure VM size (e.g., 'Standard_D2s_v3')
 * @returns {number} - Total memory in bytes
 */
function getTotalMemory(vmSize) {
  // Enhanced VM size to memory mapping with more sizes
  const vmSizeToMemoryGB = {
    // General purpose
    'Standard_B1s': 1,
    'Standard_B1ms': 2,
    'Standard_B2s': 4,
    'Standard_B2ms': 8,
    'Standard_B4ms': 16,
    'Standard_B8ms': 32,
    'Standard_B12ms': 48,
    'Standard_B16ms': 64,
    'Standard_B20ms': 80,
    // D-series
    'Standard_D2s_v3': 8,
    'Standard_D4s_v3': 16,
    'Standard_D8s_v3': 32,
    'Standard_D16s_v3': 64,
    'Standard_D32s_v3': 128,
    'Standard_D48s_v3': 192,
    'Standard_D64s_v3': 256,
    // E-series (memory optimized)
    'Standard_E2s_v3': 16,
    'Standard_E4s_v3': 32,
    'Standard_E8s_v3': 64,
    'Standard_E16s_v3': 128,
    'Standard_E20s_v3': 160,
    'Standard_E32s_v3': 256,
    'Standard_E48s_v3': 384,
    'Standard_E64s_v3': 432,
    // F-series (compute optimized)
    'Standard_F2s_v2': 4,
    'Standard_F4s_v2': 8,
    'Standard_F8s_v2': 16,
    'Standard_F16s_v2': 32,
    'Standard_F32s_v2': 64,
    'Standard_F48s_v2': 96,
    'Standard_F64s_v2': 128,
    // Fallback defaults by family
    'Standard_D': 8,  // Default for D-series
    'Standard_E': 16, // Default for E-series
    'Standard_F': 4,  // Default for F-series
    'Standard_B': 4   // Default for B-series
  };
  
  if (!vmSize) {
    logger.warn('VM size not provided, using default memory size of 8 GB');
    return 8 * 1024 * 1024 * 1024; // Default 8 GB in bytes
  }
  
  // Try exact match first
  if (vmSizeToMemoryGB[vmSize]) {
    return vmSizeToMemoryGB[vmSize] * 1024 * 1024 * 1024; // Convert GB to bytes
  }
  
  // Try to match by family
  for (const prefix of ['Standard_D', 'Standard_E', 'Standard_F', 'Standard_B']) {
    if (vmSize.startsWith(prefix)) {
      logger.info(`VM size ${vmSize} not in lookup table, using family default of ${vmSizeToMemoryGB[prefix]} GB`);
      return vmSizeToMemoryGB[prefix] * 1024 * 1024 * 1024;
    }
  }
  
  // Fallback default
  logger.warn(`Unknown VM size: ${vmSize}, using default memory size of 8 GB`);
  return 8 * 1024 * 1024 * 1024; // Default 8 GB in bytes
}

/**
 * Normalize and enhance memory metrics
 * @param {Object} memoryAvailableBytes - Raw memory metrics
 * @param {number} totalMemoryBytes - Total VM memory in bytes
 * @returns {Object} - Enhanced memory metrics
 */
function enhanceMemoryMetrics(memoryAvailableBytes, totalMemoryBytes) {
  if (!memoryAvailableBytes || memoryAvailableBytes.error) {
    return {
      error: memoryAvailableBytes?.error || 'Invalid memory metrics'
    };
  }
  
  const result = {
    unit: 'Percent',
    current: null,
    history: [],
    trend: 'stable'
  };
  
  // Process current value
  if (memoryAvailableBytes.current) {
    const availableBytes = memoryAvailableBytes.current.value;
    const usedPercentage = Math.max(0, Math.min(100, 100 - (availableBytes / totalMemoryBytes * 100)));
    result.current = {
      timestamp: memoryAvailableBytes.current.timestamp,
      value: usedPercentage
    };
  }
  
  // Process historical values
  if (memoryAvailableBytes.history && memoryAvailableBytes.history.length > 0) {
    for (const point of memoryAvailableBytes.history) {
      const availableBytes = point.value;
      const usedPercentage = Math.max(0, Math.min(100, 100 - (availableBytes / totalMemoryBytes * 100)));
      result.history.push({
        timestamp: point.timestamp,
        value: usedPercentage
      });
    }
    
    // Calculate trend if we have enough data
    if (result.history.length >= 2) {
      const values = result.history.map(point => point.value);
      
      // Calculate trend as percent change from first half to second half
      const halfPoint = Math.floor(values.length / 2);
      const firstHalf = values.slice(0, halfPoint);
      const secondHalf = values.slice(halfPoint);
      
      const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
      
      if (firstAvg > 0) {
        const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
        
        if (changePercent > 10) {
          result.trend = 'increasing';
        } else if (changePercent < -10) {
          result.trend = 'decreasing';
        } else {
          result.trend = 'stable';
        }
      }
    }
  }
  
  return result;
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
        // Enhanced memory metrics calculation with trend analysis
        processedMetrics.memoryUsedPercentage = enhanceMemoryMetrics(
          processedMetrics.memoryAvailableBytes, 
          totalMemoryBytes
        );
        
        logger.debug('Calculated memory usage percentage with trend analysis');
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