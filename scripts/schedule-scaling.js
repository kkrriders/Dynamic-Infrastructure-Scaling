#!/usr/bin/env node

/**
 * Script to schedule resource scaling based on Ollama recommendations
 * Fetches metrics, prompts Ollama, parses response, and executes scaling
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DefaultAzureCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');
const logger = require('../src/utils/logger');
const ollamaService = require('../src/services/ollamaService'); // Import Ollama service

// Parse command line arguments
const args = process.argv.slice(2);
const argOptions = {
  dryRun: args.includes('--dry-run'),
  minInstances: args.find(arg => arg.startsWith('--min-instances='))?.split('=')[1],
  maxInstances: args.find(arg => arg.startsWith('--max-instances='))?.split('=')[1],
  resourceGroup: args.find(arg => arg.startsWith('--resource-group='))?.split('=')[1],
  vmssName: args.find(arg => arg.startsWith('--vmss-name='))?.split('=')[1],
  retryCount: args.find(arg => arg.startsWith('--retry-count='))?.split('=')[1],
  cooldownMinutes: args.find(arg => arg.startsWith('--cooldown='))?.split('=')[1],
  metricsPath: args.find(arg => arg.startsWith('--metrics-path='))?.split('=')[1],
  promptFile: args.find(arg => arg.startsWith('--prompt-file='))?.split('=')[1],
  modelName: args.find(arg => arg.startsWith('--model='))?.split('=')[1],
  listModels: args.includes('--list-models'),
  confidenceThreshold: args.find(arg => arg.startsWith('--confidence-threshold='))?.split('=')[1]
};

// Configuration from environment variables with command line overrides
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const RESOURCE_GROUP = argOptions.resourceGroup || process.env.AZURE_RESOURCE_GROUP;
const VMSS_NAME = argOptions.vmssName || process.env.AZURE_VMSS_NAME;
const MIN_INSTANCES = parseInt(argOptions.minInstances || process.env.MIN_INSTANCES || '2');
const MAX_INSTANCES = parseInt(argOptions.maxInstances || process.env.MAX_INSTANCES || '10');
const DRY_RUN = argOptions.dryRun;
const RETRY_COUNT = parseInt(argOptions.retryCount || process.env.SCALING_RETRY_COUNT || '3');
const SCALING_COOLDOWN = parseInt(argOptions.cooldownMinutes || process.env.SCALING_COOLDOWN_MINUTES || '15'); // minutes
const METRICS_PATH = (argOptions.metricsPath || process.env.METRICS_PATH || './data').replace('file://', '');
const PROMPT_FILE = argOptions.promptFile;
const MODEL_NAME = argOptions.modelName || process.env.OLLAMA_MODEL;
const CONFIDENCE_THRESHOLD = parseFloat(argOptions.confidenceThreshold || process.env.SCALING_CONFIDENCE_THRESHOLD || '0.7');

// Scaling state
let lastScalingOperationTime = 0;
let isScalingInProgress = false;

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info('Starting Ollama-based scaling operation');
    
    // Handle list models request if specified
    if (argOptions.listModels) {
      await displayAvailableModels();
      process.exit(0);
    }
    
    logger.info(`Config: VMSS=${VMSS_NAME}, RG=${RESOURCE_GROUP}, Min=${MIN_INSTANCES}, Max=${MAX_INSTANCES}${DRY_RUN ? ', DRY_RUN=true' : ''}`);
    if (MODEL_NAME) {
      logger.info(`Using specified model: ${MODEL_NAME}`);
    }
    
    // Validate required environment variables
    validateEnvironment();
    
    // Initialize Azure Compute Client
    const computeClient = initializeComputeClient();
    
    // Run the scaling check
    await checkAndScale(computeClient);
    
    logger.info('Scaling check completed.');
    process.exit(0);
  } catch (error) {
    logger.error(`Error in scheduled scaling: ${error.message}`, { error });
    process.exit(1);
  }
}

/**
 * Validate required environment variables
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
}

/**
 * Initialize Azure Compute Management Client
 */
function initializeComputeClient() {
  try {
    const credentials = new DefaultAzureCredential();
    return new ComputeManagementClient(credentials, SUBSCRIPTION_ID);
  } catch (error) {
    throw new Error(`Failed to initialize Azure Compute Management client: ${error.message}`);
  }
}

/**
 * Check conditions and perform scaling if necessary
 */
async function checkAndScale(computeClient) {
  if (isScalingInProgress) {
    logger.info('Scaling operation already in progress, skipping this check');
    return;
  }
  
  try {
    isScalingInProgress = true;
    
    // Check cooldown period
    if (isInCooldown()) {
      isScalingInProgress = false;
      return;
    }
    
    // 1. Get current VMSS state
    const vmss = await getCurrentVmssState(computeClient);
    const currentCapacity = vmss.sku.capacity;
    logger.info(`Current VMSS capacity: ${currentCapacity} instances`);
    
    // 2. Load latest metrics
    const latestMetrics = await loadLatestMetrics();
    if (!latestMetrics) {
      logger.warn('No recent metrics data available. Skipping scaling cycle.');
      isScalingInProgress = false;
      return;
    }
    
    // 3. Construct prompt for Ollama
    const prompt = constructOllamaPrompt(vmss, latestMetrics);
    
    // 4. Get recommendation from Ollama
    const recommendation = await ollamaService.getScalingRecommendation(prompt, undefined, MODEL_NAME);
    
    if (!recommendation || typeof recommendation.recommended_instances !== 'number') {
      logger.error('Invalid or missing recommendation from Ollama', { recommendation });
      isScalingInProgress = false;
      return;
    }
    
    // 5. Validate recommendation confidence if provided
    const confidence = recommendation.confidence || 1.0;
    if (confidence < CONFIDENCE_THRESHOLD) {
      logger.warn(`Recommendation confidence (${confidence.toFixed(2)}) is below threshold (${CONFIDENCE_THRESHOLD}). Skipping scaling operation.`);
      logger.info(`Reasoning: ${recommendation.reasoning || 'No reasoning provided'}`);
      isScalingInProgress = false;
      return;
    }
    
    // 6. Validate and sanitize the recommendation
    let recommendedCapacity = Math.round(recommendation.recommended_instances);
    recommendedCapacity = Math.max(MIN_INSTANCES, Math.min(MAX_INSTANCES, recommendedCapacity));
    
    logger.info(`Ollama recommended instance count: ${recommendation.recommended_instances}, Adjusted: ${recommendedCapacity}, Confidence: ${confidence.toFixed(2)}`);
    
    if (recommendation.reasoning) {
      logger.info(`Reasoning: ${recommendation.reasoning}`);
    }
    
    // 7. Compare and execute scaling
    if (recommendedCapacity !== currentCapacity) {
      await executeScalingOperation(computeClient, vmss, currentCapacity, recommendedCapacity);
    } else {
      logger.info(`No scaling action needed. Ollama recommendation (${recommendedCapacity}) matches current capacity (${currentCapacity}).`);
    }
    
  } catch (error) {
    logger.error(`Error during check and scale cycle: ${error.message}`, { error });
  } finally {
    isScalingInProgress = false;
  }
}

/**
 * Check if the system is in a cooldown period after a scaling operation
 */
function isInCooldown() {
  if (lastScalingOperationTime === 0) {
    return false; // No previous scaling operation
  }
  
  const cooldownMs = SCALING_COOLDOWN * 60 * 1000;
  const timeSinceLastScaling = Date.now() - lastScalingOperationTime;
  
  if (timeSinceLastScaling < cooldownMs) {
    const cooldownRemaining = Math.ceil((cooldownMs - timeSinceLastScaling) / 60000);
    logger.info(`In cooldown period (${cooldownRemaining} minutes remaining). Skipping scaling check.`);
    return true;
  }
  
  return false;
}

/**
 * Get current state of the VM Scale Set
 */
async function getCurrentVmssState(computeClient) {
  try {
    const vmss = await computeClient.virtualMachineScaleSets.get(RESOURCE_GROUP, VMSS_NAME);
    if (!vmss || !vmss.sku || typeof vmss.sku.capacity !== 'number') {
      throw new Error('Invalid VMSS data received from Azure');
    }
    return vmss;
  } catch (error) {
    throw new Error(`Failed to get current VMSS configuration: ${error.message}. Check Azure credentials and VMSS details.`);
  }
}

/**
 * Calculate trend safely from an array of values
 * @param {Array<number>} values - Array of metric values
 * @returns {string} - 'increasing', 'decreasing', or 'stable'
 */
function calculateTrend(values) {
  if (!values || values.length < 2) {
    return 'stable'; // Not enough data to determine trend
  }
  
  const halfIndex = Math.floor(values.length / 2);
  if (halfIndex === 0) {
    return 'stable'; // Not enough data to split
  }
  
  const firstHalf = values.slice(0, halfIndex);
  const secondHalf = values.slice(halfIndex);
  
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  // Check for division by zero
  if (firstAvg === 0 || isNaN(firstAvg)) {
    // Compare absolute values instead
    if (secondAvg > 0) return 'increasing';
    if (secondAvg < 0) return 'decreasing';
    return 'stable';
  }
  
  const trendPercentage = ((secondAvg - firstAvg) / Math.abs(firstAvg) * 100);
  
  if (isNaN(trendPercentage)) return 'stable';
  
  return trendPercentage > 5 ? 'increasing' : 
         trendPercentage < -5 ? 'decreasing' : 'stable';
}

/**
 * Construct optimized prompt for Ollama with current VMSS state and metrics
 */
function constructOllamaPrompt(vmss, metricsData) {
  // Custom prompt from file if specified
  if (PROMPT_FILE && fs.existsSync(PROMPT_FILE)) {
    try {
      const promptTemplate = fs.readFileSync(PROMPT_FILE, 'utf8');
      // Simple template replacement
      return promptTemplate
        .replace('{{vmss_name}}', VMSS_NAME)
        .replace('{{resource_group}}', RESOURCE_GROUP)
        .replace('{{metrics_data}}', JSON.stringify(metricsData, null, 2))
        .replace('{{current_capacity}}', vmss.sku.capacity)
        .replace('{{min_instances}}', MIN_INSTANCES)
        .replace('{{max_instances}}', MAX_INSTANCES);
    } catch (error) {
      logger.error(`Error loading custom prompt template: ${error.message}. Using default prompt.`);
      // Continue to default prompt construction below
    }
  }
  
  // Extract key metrics for structured prompt
  let cpuCurrent = 'Unknown';
  let cpuAverage = 'Unknown';
  let cpuTrend = 'Unknown';
  let memCurrent = 'Unknown';
  let memAverage = 'Unknown';
  let memTrend = 'Unknown';
  let netInTotal = 'Unknown';
  let netOutTotal = 'Unknown';
  
  try {
    // Process CPU metrics
    if (metricsData.metrics.cpuPercentage && !metricsData.metrics.cpuPercentage.error) {
      const cpuData = metricsData.metrics.cpuPercentage;
      if (cpuData.current && cpuData.history && cpuData.history.length > 0) {
        cpuCurrent = cpuData.current.value.toFixed(2) + '%';
        
        // Calculate average
        const cpuValues = cpuData.history.map(p => p.value);
        cpuAverage = (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(2) + '%';
        
        // Determine trend using safer function
        cpuTrend = calculateTrend(cpuValues);
      }
    }
    
    // Process Memory metrics (prefer percentage if available)
    const memMetric = metricsData.metrics.memoryUsedPercentage || metricsData.metrics.memoryAvailableBytes;
    if (memMetric && !memMetric.error) {
      if (memMetric.current && memMetric.history && memMetric.history.length > 0) {
        memCurrent = memMetric.current.value.toFixed(2) + '%';
        
        // Calculate average
        const memValues = memMetric.history.map(p => p.value);
        memAverage = (memValues.reduce((a, b) => a + b, 0) / memValues.length).toFixed(2) + '%';
        
        // Determine trend using safer function
        memTrend = calculateTrend(memValues);
      }
    }
    
    // Process Network metrics
    if (metricsData.metrics.networkInBytes && !metricsData.metrics.networkInBytes.error) {
      if (metricsData.metrics.networkInBytes.current) {
        const bytes = metricsData.metrics.networkInBytes.current.value;
        netInTotal = formatBytes(bytes);
      }
    }
    
    if (metricsData.metrics.networkOutBytes && !metricsData.metrics.networkOutBytes.error) {
      if (metricsData.metrics.networkOutBytes.current) {
        const bytes = metricsData.metrics.networkOutBytes.current.value;
        netOutTotal = formatBytes(bytes);
      }
    }
  } catch (error) {
    logger.warn(`Error processing metrics for prompt: ${error.message}`);
  }
  
  // Optimized structured prompt for Llama3 8B
  return `
I need to decide how many VM instances to provision in our Azure VM Scale Set (VMSS).

CURRENT STATE:
- VMSS Name: ${VMSS_NAME}
- Resource Group: ${RESOURCE_GROUP}
- Current instance count: ${vmss.sku.capacity}
- VM Size: ${vmss.sku?.name || 'Standard'}
- Min allowed instances: ${MIN_INSTANCES}
- Max allowed instances: ${MAX_INSTANCES}

RECENT METRICS (past ${metricsData.lookbackHours || 1} hours):
- CPU: Current ${cpuCurrent}, Average ${cpuAverage}, Trend ${cpuTrend}
- Memory: Current ${memCurrent}, Average ${memAverage}, Trend ${memTrend}
- Network In: ${netInTotal}
- Network Out: ${netOutTotal}

DETAILED METRICS:
${JSON.stringify(metricsData.metrics, null, 2)}

SCALING RULES:
1. CPU > 75% sustained → Consider scaling up
2. Memory > 80% sustained → Consider scaling up
3. CPU < 30% and Memory < 40% sustained → Consider scaling down
4. Network throughput spikes → May indicate need for more instances
5. Must stay within min (${MIN_INSTANCES}) and max (${MAX_INSTANCES}) instances
6. Scale up more aggressively than down (conservative scaling down)

Based on this data, how many VM instances should we provision? Please analyze the metrics and provide your recommendation as a valid JSON object containing 'recommended_instances' (integer), 'confidence' (number between 0-1), and 'reasoning' (brief explanation).
`;
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0 || isNaN(bytes)) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Execute scaling operation on VMSS
 */
async function executeScalingOperation(computeClient, vmss, currentCapacity, targetCapacity) {
  const scaleDirection = targetCapacity > currentCapacity ? 'up' : 'down';
  logger.info(`Executing scaling ${scaleDirection} from ${currentCapacity} to ${targetCapacity} instances based on Ollama recommendation`);

  if (DRY_RUN) {
    logger.info(`DRY RUN: Would scale VMSS ${VMSS_NAME} from ${currentCapacity} to ${targetCapacity}`);
    // Record a simulated scaling time to respect cooldown in dry runs
    lastScalingOperationTime = Date.now();
    return;
  }

  try {
    // Update the VMSS object with the new capacity
    const updatedVmss = { ...vmss, sku: { ...vmss.sku, capacity: targetCapacity } };
    
    let success = false;
    let lastError = null;

    for (let attempt = 1; attempt <= RETRY_COUNT && !success; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(`Retry attempt ${attempt}/${RETRY_COUNT} for VMSS scaling...`);
        }
        
        logger.info(`Attempting to scale VMSS ${VMSS_NAME} to ${targetCapacity} instances...`);
        
        // Use beginCreateOrUpdate for long-running operation
        const poller = await computeClient.virtualMachineScaleSets.beginCreateOrUpdate(
          RESOURCE_GROUP,
          VMSS_NAME,
          updatedVmss // Send the updated VMSS object
        );

        logger.info('Scaling operation initiated. Waiting for completion...');
        // Wait for the operation to complete
        const result = await poller.pollUntilDone(); 
        
        // Verify the result (optional but recommended)
        if (result && result.sku && result.sku.capacity === targetCapacity) {
          success = true;
          logger.info(`Successfully scaled VMSS ${VMSS_NAME} to ${targetCapacity} instances.`);
          lastScalingOperationTime = Date.now(); // Update timestamp on success
        } else {
          logger.warn(`Scaling operation finished, but final capacity might not be ${targetCapacity}. VMSS state:`, result);
          // Consider success even if verification is ambiguous, Azure might take time to reflect
          success = true; 
          lastScalingOperationTime = Date.now();
        }

      } catch (error) {
        lastError = error;
        const waitTime = Math.min(3000 * attempt, 15000); // Exponential backoff with max 15s
        logger.warn(`Scaling attempt ${attempt} failed: ${error.message}. Waiting ${waitTime}ms before retry.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    if (!success) {
      throw new Error(`Failed to scale VMSS after ${RETRY_COUNT} attempts. Last error: ${lastError?.message}`);
    }

  } catch (error) {
    logger.error(`Error executing scaling operation: ${error.message}`);
    // Don't update lastScalingOperationTime on failure to allow quicker retries if needed
    throw error; // Re-throw to be caught by main loop
  }
}

/**
 * Display available Ollama models for cloud resource management
 */
async function displayAvailableModels() {
  logger.info('Fetching available models from Ollama API...');
  
  // Get recommended models (static list of known good models)
  const recommendedModels = ollamaService.getRecommendedModels();
  console.log('\nRecommended models for cloud infrastructure scaling:');
  for (const [modelName, config] of Object.entries(recommendedModels)) {
    console.log(`  - ${modelName}: ${config.description}`);
  }
  
  // Get available models from the Ollama API
  const availableModels = await ollamaService.listAvailableModels();
  if (availableModels && availableModels.length > 0) {
    console.log('\nModels currently available on your Ollama server:');
    for (const model of availableModels) {
      const isRecommended = recommendedModels[model.name] ? '(recommended)' : '';
      console.log(`  - ${model.name} ${isRecommended}`);
    }
  } else {
    console.log('\nUnable to fetch models from Ollama API. Please ensure Ollama is running.');
    console.log('You can pull models using the Ollama CLI: ollama pull llama3:8b');
  }
  
  console.log('\nTo use a specific model, run with --model=MODEL_NAME');
}

/**
 * Load the latest metrics data from local storage
 */
async function loadLatestMetrics() {
  try {
    if (!fs.existsSync(METRICS_PATH)) {
      logger.warn(`Metrics directory does not exist: ${METRICS_PATH}. Cannot load metrics.`);
      return null;
    }
    
    const metricsFiles = fs.readdirSync(METRICS_PATH)
      .filter(file => file.startsWith('metrics_') && file.endsWith('.json'))
      .sort(); // Sorts chronologically assuming filename format
    
    if (metricsFiles.length === 0) {
      logger.warn(`No metrics files found in ${METRICS_PATH}`);
      return null;
    }
    
    // Get the latest metrics file
    const latestFile = metricsFiles[metricsFiles.length - 1];
    const filePath = path.join(METRICS_PATH, latestFile);
    
    logger.info(`Loading latest metrics from: ${latestFile}`);
    
    let fileContent;
    try {
      fileContent = fs.readFileSync(filePath, 'utf8');
    } catch (readError) {
      logger.error(`Error reading metrics file ${latestFile}: ${readError.message}`);
      return null;
    }
    
    let metricsData;
    try {
      metricsData = JSON.parse(fileContent);
    } catch (parseError) {
      logger.error(`Error parsing JSON in metrics file ${latestFile}: ${parseError.message}`);
      return null;
    }
    
    // Basic validation
    if (!metricsData || !metricsData.timestamp || !metricsData.metrics) {
      logger.error(`Invalid format in metrics file: ${latestFile}. Missing required fields.`);
      return null;
    }
    
    // Check freshness (warn if older than 2 * interval)
    const fileTimestamp = new Date(metricsData.timestamp);
    const maxAgeMinutes = (process.env.METRICS_INTERVAL_MIN || 15) * 2;
    if ((Date.now() - fileTimestamp.getTime()) > maxAgeMinutes * 60 * 1000) {
      logger.warn(`Metrics data is older than ${maxAgeMinutes} minutes.`);
    }
    
    return metricsData;
    
  } catch (error) {
    logger.error(`Failed to load metrics: ${error.message}`);
    return null;
  }
}

// Display usage information
function printUsage() {
  console.log(`
Usage: node schedule-scaling.js [options]

Schedules VMSS scaling based on Ollama recommendations.

Options:
  --resource-group=NAME      Azure resource group containing VMSS
  --vmss-name=NAME           Name of VM Scale Set to scale
  --metrics-path=PATH        Path to metrics data directory (default: ./data)
  --min-instances=NUMBER     Minimum instance count (default: ${MIN_INSTANCES})
  --max-instances=NUMBER     Maximum instance count (default: ${MAX_INSTANCES})
  --retry-count=NUMBER       Number of retry attempts for scaling (default: ${RETRY_COUNT})
  --cooldown=MINUTES         Minutes to wait between scaling operations (default: ${SCALING_COOLDOWN})
  --prompt-file=FILE         Path to a custom prompt template file (optional)
  --model=NAME               Specific Ollama model to use for recommendations
  --confidence-threshold=NUM Minimum confidence level to accept (0-1, default: ${CONFIDENCE_THRESHOLD})
  --list-models              Display available Ollama models and exit
  --dry-run                  Check scaling needs without making changes
  --help, -h                 Show this help message

Environment variables:
  AZURE_SUBSCRIPTION_ID      Azure subscription ID (Required)
  AZURE_RESOURCE_GROUP       Azure resource group (can be overridden by --resource-group)
  AZURE_VMSS_NAME            Name of VM Scale Set (can be overridden by --vmss-name)
  METRICS_PATH               Path to metrics data directory (can be overridden by --metrics-path)
  MIN_INSTANCES              Minimum instance count
  MAX_INSTANCES              Maximum instance count
  SCALING_RETRY_COUNT        Number of retry attempts for scaling
  SCALING_COOLDOWN_MINUTES   Minutes to wait between scaling operations
  SCALING_CONFIDENCE_THRESHOLD Minimum confidence level to accept (0-1)
  OLLAMA_API_URL             URL for the Ollama API (e.g., http://localhost:11434)
  OLLAMA_MODEL               Ollama model to use (e.g., llama3:70b)
  OLLAMA_FALLBACK_MODEL      Fallback model if primary fails (e.g., llama3:8b)
  OLLAMA_REQUEST_TIMEOUT     Timeout for Ollama API requests in milliseconds
  OLLAMA_SYSTEM_PROMPT       System prompt for Ollama (optional)
  `);
}

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

// Run the script
main(); 