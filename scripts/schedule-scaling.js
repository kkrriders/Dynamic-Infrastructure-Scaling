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
const ollamaService = require('../src/services/ollamaService');
const gcpService = require('../src/services/gcpService');

// Parse command line arguments
const args = process.argv.slice(2);
const argOptions = {
  dryRun: args.includes('--dry-run'),
  minInstances: args.find(arg => arg.startsWith('--min-instances='))?.split('=')[1],
  maxInstances: args.find(arg => arg.startsWith('--max-instances='))?.split('=')[1],
  resourceGroup: args.find(arg => arg.startsWith('--resource-group='))?.split('=')[1],
  vmssName: args.find(arg => arg.startsWith('--vmss-name='))?.split('=')[1],
  instanceGroup: args.find(arg => arg.startsWith('--instance-group='))?.split('=')[1],
  project: args.find(arg => arg.startsWith('--project='))?.split('=')[1],
  zone: args.find(arg => arg.startsWith('--zone='))?.split('=')[1],
  retryCount: args.find(arg => arg.startsWith('--retry-count='))?.split('=')[1],
  cooldownMinutes: args.find(arg => arg.startsWith('--cooldown='))?.split('=')[1],
  metricsPath: args.find(arg => arg.startsWith('--metrics-path='))?.split('=')[1],
  promptFile: args.find(arg => arg.startsWith('--prompt-file='))?.split('=')[1],
  modelName: args.find(arg => arg.startsWith('--model='))?.split('=')[1],
  listModels: args.includes('--list-models'),
  confidenceThreshold: args.find(arg => arg.startsWith('--confidence-threshold='))?.split('=')[1],
  cloud: args.find(arg => arg.startsWith('--cloud='))?.split('=')[1]
};

// Cloud provider selection
const CLOUD_PROVIDER = argOptions.cloud || process.env.CLOUD_PROVIDER || 'azure';

// Azure Configuration
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const RESOURCE_GROUP = argOptions.resourceGroup || process.env.AZURE_RESOURCE_GROUP;
const VMSS_NAME = argOptions.vmssName || process.env.AZURE_VMSS_NAME;

// GCP Configuration
const GCP_PROJECT_ID = argOptions.project || process.env.GCP_PROJECT_ID;
const GCP_INSTANCE_GROUP = argOptions.instanceGroup || process.env.GCP_INSTANCE_GROUP;
const GCP_ZONE = argOptions.zone || process.env.GCP_ZONE;

// Common Configuration
const MIN_INSTANCES = parseInt(argOptions.minInstances || process.env.MIN_INSTANCES || '2');
const MAX_INSTANCES = parseInt(argOptions.maxInstances || process.env.MAX_INSTANCES || '10');
const DRY_RUN = argOptions.dryRun;
const RETRY_COUNT = parseInt(argOptions.retryCount || process.env.SCALING_RETRY_COUNT || '3');
const COOLDOWN_MINUTES = parseInt(argOptions.cooldownMinutes || process.env.SCALING_COOLDOWN_MINUTES || '15');
const METRICS_PATH = argOptions.metricsPath || process.env.METRICS_PATH || './data';
const PROMPT_FILE = argOptions.promptFile || process.env.OLLAMA_PROMPT_FILE;
const MODEL_NAME = argOptions.modelName || process.env.OLLAMA_MODEL;
const CONFIDENCE_THRESHOLD = parseFloat(argOptions.confidenceThreshold || process.env.SCALING_CONFIDENCE_THRESHOLD || '0.7');

// State management
let isScalingInProgress = false;
let lastScalingTimestamp = null;

/**
 * Main execution
 */
async function main() {
  if (argOptions.listModels) {
    await displayAvailableModels();
    return;
  }
  
  logger.info('Starting Ollama-based scaling operation');
  
  try {
    // Initialize cloud provider client
    let cloudClient;
    if (CLOUD_PROVIDER.toLowerCase() === 'azure') {
      // Azure configuration check
      if (!SUBSCRIPTION_ID || !RESOURCE_GROUP || !VMSS_NAME) {
        logger.error('Missing required Azure configuration. Check AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, and AZURE_VMSS_NAME');
        process.exit(1);
      }
      
      logger.info(`Config: VMSS=${VMSS_NAME}, RG=${RESOURCE_GROUP}, Min=${MIN_INSTANCES}, Max=${MAX_INSTANCES}, DRY_RUN=${DRY_RUN}`);
      
      // Initialize Azure client
      const credential = new DefaultAzureCredential();
      cloudClient = new ComputeManagementClient(credential, SUBSCRIPTION_ID);
    } else if (CLOUD_PROVIDER.toLowerCase() === 'gcp') {
      // GCP configuration check
      if (!GCP_PROJECT_ID || !GCP_INSTANCE_GROUP) {
        logger.error('Missing required GCP configuration. Check GCP_PROJECT_ID and GCP_INSTANCE_GROUP');
        process.exit(1);
      }
      
      logger.info(`Config: InstanceGroup=${GCP_INSTANCE_GROUP}, Project=${GCP_PROJECT_ID}, Min=${MIN_INSTANCES}, Max=${MAX_INSTANCES}, DRY_RUN=${DRY_RUN}`);
      
      // Initialize GCP service
      await gcpService.initializeGcpService();
      cloudClient = gcpService; // Use the GCP service as the client
    } else {
      logger.error(`Unsupported cloud provider: ${CLOUD_PROVIDER}`);
      process.exit(1);
    }
    
    if (MODEL_NAME) {
      logger.info(`Using specified model: ${MODEL_NAME}`);
    }
    
    await checkAndScale(cloudClient);
    
    logger.info('Scaling check completed.');
  } catch (error) {
    logger.error(`Error in scaling operation: ${error.message}`, { error });
    process.exit(1);
  }
}

/**
 * Check if we're within the cooldown period
 */
function isInCooldown() {
  if (!lastScalingTimestamp) {
    return false;
  }
  
  const now = new Date();
  const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
  const timeSinceLastScaling = now - lastScalingTimestamp;
  
  if (timeSinceLastScaling < cooldownMs) {
    const remainingMinutes = Math.ceil((cooldownMs - timeSinceLastScaling) / 60000);
    logger.info(`In cooldown period, ${remainingMinutes} minute(s) remaining before next scaling action allowed`);
    return true;
  }
  
  return false;
}

/**
 * Check conditions and perform scaling if necessary
 */
async function checkAndScale(cloudClient) {
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
    
    // 1. Get current cloud infrastructure state
    let currentState;
    if (CLOUD_PROVIDER.toLowerCase() === 'azure') {
      currentState = await getCurrentVmssState(cloudClient);
    } else if (CLOUD_PROVIDER.toLowerCase() === 'gcp') {
      currentState = await cloudClient.getInstanceGroupState();
    }
    
    const currentCapacity = CLOUD_PROVIDER.toLowerCase() === 'azure' 
      ? currentState.sku.capacity 
      : currentState.targetSize;
      
    logger.info(`Current ${CLOUD_PROVIDER} capacity: ${currentCapacity} instances`);
    
    // 2. Load latest metrics
    const latestMetrics = await loadLatestMetrics();
    if (!latestMetrics) {
      logger.warn('No recent metrics data available. Skipping scaling cycle.');
      isScalingInProgress = false;
      return;
    }
    
    // 3. Construct prompt for Ollama
    const prompt = constructOllamaPrompt(currentState, latestMetrics);
    
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
      await executeScalingOperation(cloudClient, currentState, currentCapacity, recommendedCapacity);
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
 * Get the current VMSS state from Azure
 */
async function getCurrentVmssState(computeClient) {
  try {
    logger.info(`Retrieving current VMSS state for ${VMSS_NAME} in ${RESOURCE_GROUP}`);
    
    const vmss = await computeClient.virtualMachineScaleSets.get(
      RESOURCE_GROUP,
      VMSS_NAME
    );
    
    if (!vmss || !vmss.sku) {
      throw new Error('Failed to get valid VMSS data from Azure');
    }
    
    return vmss;
  } catch (error) {
    logger.error(`Failed to get current VMSS configuration: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Load the latest metrics file from the metrics directory
 */
async function loadLatestMetrics() {
  try {
    // Check if metrics directory exists
    if (!fs.existsSync(METRICS_PATH)) {
      logger.warn(`Metrics directory ${METRICS_PATH} does not exist`);
      return null;
    }
    
    // Determine pattern based on cloud provider
    const filePattern = CLOUD_PROVIDER.toLowerCase() === 'azure'
      ? /^metrics_.*\.json$/
      : /^gcp_metrics_.*\.json$/;
    
    // Get all metric files and sort by timestamp (newest first)
    const metricFiles = fs.readdirSync(METRICS_PATH)
      .filter(file => filePattern.test(file))
      .sort()
      .reverse();
    
    if (metricFiles.length === 0) {
      logger.warn(`No metric files found in ${METRICS_PATH}`);
      return null;
    }
    
    // Use the most recent file
    const latestFile = metricFiles[0];
    const filePath = path.join(METRICS_PATH, latestFile);
    logger.info(`Loading latest metrics from ${filePath}`);
    
    const metricsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Simple validation
    if (!metricsData.metrics) {
      logger.warn(`Invalid metrics file format in ${filePath}`);
      return null;
    }
    
    return metricsData;
  } catch (error) {
    logger.error(`Error loading metrics data: ${error.message}`, { error });
    return null;
  }
}

/**
 * Execute scaling operation to adjust instance count
 */
async function executeScalingOperation(cloudClient, currentState, currentCapacity, targetCapacity) {
  const scalingDirection = targetCapacity > currentCapacity ? 'up' : 'down';
  const scalingType = CLOUD_PROVIDER.toLowerCase() === 'azure' ? 'VMSS' : 'Instance Group';
  
  logger.info(`Executing scaling operation: ${scalingDirection} from ${currentCapacity} to ${targetCapacity} instances ${DRY_RUN ? '(DRY RUN)' : ''}`);
  
  try {
    if (DRY_RUN) {
      logger.info('Dry run mode - not making actual changes');
      return { success: true, dryRun: true };
    }
    
    let result;
    if (CLOUD_PROVIDER.toLowerCase() === 'azure') {
      // Azure VMSS scaling
      const updateParams = {
        sku: {
          ...currentState.sku,
          capacity: targetCapacity
        }
      };
      
      result = await cloudClient.virtualMachineScaleSets.beginUpdateAndWait(
        RESOURCE_GROUP,
        VMSS_NAME,
        updateParams
      );
      
      logger.info(`Successfully scaled ${VMSS_NAME} to ${targetCapacity} instances`);
    } else if (CLOUD_PROVIDER.toLowerCase() === 'gcp') {
      // GCP Instance Group scaling
      result = await cloudClient.scaleInstanceGroup(
        GCP_INSTANCE_GROUP,
        targetCapacity,
        false
      );
      
      logger.info(`Successfully scaled ${GCP_INSTANCE_GROUP} to ${targetCapacity} instances`);
    }
    
    // Update last scaling timestamp
    lastScalingTimestamp = new Date();
    
    return { success: true, result };
  } catch (error) {
    logger.error(`Error executing scaling operation: ${error.message}`, { error });
    throw new Error(`Failed to scale ${scalingType}: ${error.message}`);
  }
}

/**
 * Construct optimized prompt for Ollama with current cloud state and metrics
 */
function constructOllamaPrompt(currentState, metricsData) {
  // Custom prompt from file if specified
  if (PROMPT_FILE && fs.existsSync(PROMPT_FILE)) {
    try {
      const promptTemplate = fs.readFileSync(PROMPT_FILE, 'utf8');
      
      // Different replacements based on cloud provider
      if (CLOUD_PROVIDER.toLowerCase() === 'azure') {
        // Template replacement for Azure
        return promptTemplate
          .replace('{{vmss_name}}', VMSS_NAME)
          .replace('{{resource_group}}', RESOURCE_GROUP)
          .replace('{{metrics_data}}', JSON.stringify(metricsData, null, 2))
          .replace('{{current_capacity}}', currentState.sku.capacity)
          .replace('{{min_instances}}', MIN_INSTANCES)
          .replace('{{max_instances}}', MAX_INSTANCES)
          .replace('{{cloud_provider}}', 'Azure');
      } else {
        // Template replacement for GCP
        return promptTemplate
          .replace('{{instance_group}}', GCP_INSTANCE_GROUP)
          .replace('{{project}}', GCP_PROJECT_ID)
          .replace('{{metrics_data}}', JSON.stringify(metricsData, null, 2))
          .replace('{{current_capacity}}', currentState.targetSize)
          .replace('{{min_instances}}', MIN_INSTANCES)
          .replace('{{max_instances}}', MAX_INSTANCES)
          .replace('{{cloud_provider}}', 'GCP');
      }
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
    // Extract CPU metrics
    const cpuMetrics = metricsData.metrics?.cpu || [];
    if (cpuMetrics.length > 0) {
      const values = cpuMetrics.map(point => point.value).filter(val => !isNaN(val));
      if (values.length > 0) {
        cpuCurrent = `${values[0].toFixed(1)}%`;
        
        // Calculate average
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        cpuAverage = `${avg.toFixed(1)}%`;
        
        // Calculate trend
        if (values.length >= 3) {
          // Split into two halves and compare
          const halfIndex = Math.floor(values.length / 2);
          const firstHalf = values.slice(halfIndex);
          const secondHalf = values.slice(0, halfIndex);
          
          if (firstHalf.length > 0 && secondHalf.length > 0) {
            const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
            
            const changePct = firstAvg !== 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
            
            if (changePct > 10) {
              cpuTrend = 'Increasing';
            } else if (changePct < -10) {
              cpuTrend = 'Decreasing';
            } else {
              cpuTrend = 'Stable';
            }
          }
        }
      }
    }
    
    // Extract Memory metrics
    const memMetrics = metricsData.metrics?.memory || [];
    if (memMetrics.length > 0) {
      const values = memMetrics.map(point => point.value).filter(val => !isNaN(val));
      if (values.length > 0) {
        memCurrent = `${values[0].toFixed(1)}%`;
        
        // Calculate average
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        memAverage = `${avg.toFixed(1)}%`;
        
        // Calculate trend
        if (values.length >= 3) {
          // Split into two halves and compare
          const halfIndex = Math.floor(values.length / 2);
          const firstHalf = values.slice(halfIndex);
          const secondHalf = values.slice(0, halfIndex);
          
          if (firstHalf.length > 0 && secondHalf.length > 0) {
            const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
            
            const changePct = firstAvg !== 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
            
            if (changePct > 10) {
              memTrend = 'Increasing';
            } else if (changePct < -10) {
              memTrend = 'Decreasing';
            } else {
              memTrend = 'Stable';
            }
          }
        }
      }
    }
    
    // Extract Network metrics
    const netInMetrics = metricsData.metrics?.networkIn || [];
    const netOutMetrics = metricsData.metrics?.networkOut || [];
    
    if (netInMetrics.length > 0) {
      const values = netInMetrics.map(point => point.value).filter(val => !isNaN(val));
      if (values.length > 0) {
        const totalBytes = values.reduce((sum, val) => sum + val, 0);
        // Convert to MB for readability
        netInTotal = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
      }
    }
    
    if (netOutMetrics.length > 0) {
      const values = netOutMetrics.map(point => point.value).filter(val => !isNaN(val));
      if (values.length > 0) {
        const totalBytes = values.reduce((sum, val) => sum + val, 0);
        // Convert to MB for readability
        netOutTotal = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
      }
    }
  } catch (error) {
    logger.warn(`Error processing metrics for prompt: ${error.message}`);
  }
  
  // Different prompt format based on cloud provider
  if (CLOUD_PROVIDER.toLowerCase() === 'azure') {
    // Azure VMSS prompt
    return `
I need to decide how many VM instances to provision in our Azure VM Scale Set (VMSS).

CURRENT STATE:
- VMSS Name: ${VMSS_NAME}
- Resource Group: ${RESOURCE_GROUP}
- Current instance count: ${currentState.sku.capacity}
- VM Size: ${currentState.sku?.name || 'Standard'}
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
  } else {
    // GCP Instance Group prompt
    return `
I need to decide how many VM instances to provision in our Google Cloud Platform (GCP) Instance Group.

CURRENT STATE:
- Instance Group: ${GCP_INSTANCE_GROUP}
- Project: ${GCP_PROJECT_ID}
- Zone: ${GCP_ZONE}
- Current instance count: ${currentState.targetSize}
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

// Check for help flag first
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node schedule-scaling.js [options]

Schedule scaling operations based on Ollama recommendations.

Options:
  --cloud=PROVIDER        Cloud provider (azure, gcp) [default: ${CLOUD_PROVIDER}]
  --dry-run               Simulate scaling without making actual changes
  --min-instances=NUM     Minimum number of instances allowed
  --max-instances=NUM     Maximum number of instances allowed
  --metrics-path=PATH     Directory containing metrics files
  --cooldown=MINUTES      Cooldown period between scaling actions
  --prompt-file=PATH      Use custom prompt template file
  --model=NAME            Ollama model to use
  --confidence-threshold=N Minimum confidence level (0-1) to accept recommendations
  --list-models           List available and recommended Ollama models
  --help, -h              Show this help message

Azure Options:
  --resource-group=NAME   Azure Resource Group name
  --vmss-name=NAME        Azure VMSS name

GCP Options:
  --project=ID            GCP Project ID
  --instance-group=NAME   GCP Instance Group name
  --zone=ZONE             GCP Zone

Examples:
  # Run with dry-run for Azure
  node schedule-scaling.js --cloud=azure --dry-run
  
  # Scale GCP Instance Group
  node schedule-scaling.js --cloud=gcp --instance-group=my-group
  
  # Use specific model with custom prompt
  node schedule-scaling.js --model=llama3:8b --prompt-file=prompts/custom-prompt.txt
  `);
  process.exit(0);
}

// Run the main function
main().catch(error => {
  logger.error(`Error in scaling operation: ${error.message}`);
  process.exit(1);
}); 