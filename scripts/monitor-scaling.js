#!/usr/bin/env node

/**
 * Monitoring script for Ollama-based scaling system
 * Runs the system with various configurations and provides diagnostic information
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const logger = require('../src/utils/logger');
const ollamaService = require('../src/services/ollamaService');

// Parse command line arguments
const args = process.argv.slice(2);
const argOptions = {
  fetchOnly: args.includes('--fetch-only'),
  testOllama: args.includes('--test-ollama'),
  dryRun: args.includes('--dry-run') || true, // Default to dry run for safety
  continuous: args.includes('--continuous'),
  interval: args.find(arg => arg.startsWith('--interval='))?.split('=')[1] || '300', // Default 5 minutes
  model: args.find(arg => arg.startsWith('--model='))?.split('=')[1] || process.env.OLLAMA_MODEL || 'llama3:8b'
};

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('='.repeat(80));
    console.log('Dynamic Infrastructure Scaling Monitor');
    console.log('='.repeat(80));
    
    // Check Ollama availability
    await checkOllamaStatus();
    
    if (argOptions.testOllama) {
      // Run a simple test prompt with Ollama
      await testOllamaModel(argOptions.model);
      return;
    }
    
    // Main monitoring loop
    if (argOptions.continuous) {
      console.log(`Starting continuous monitoring with ${argOptions.interval}s interval`);
      runContinuousMonitoring();
    } else {
      // Single run
      await runScalingCycle();
    }
    
  } catch (error) {
    console.error(`Error in monitoring script: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Check if Ollama is running and has the required models
 */
async function checkOllamaStatus() {
  console.log('\nChecking Ollama status...');
  
  try {
    // Test connection to Ollama API
    const models = await ollamaService.listAvailableModels();
    
    if (!models) {
      console.log('❌ Could not connect to Ollama API. Make sure Ollama is running.');
      process.exit(1);
    }
    
    console.log('✅ Connected to Ollama API successfully');
    
    // Check for specific models
    const modelNames = models.map(m => m.name);
    console.log(`\nAvailable models: ${modelNames.join(', ')}`);
    
    const requiredModel = argOptions.model;
    if (!modelNames.includes(requiredModel)) {
      console.log(`\n⚠️ Required model "${requiredModel}" is not available.`);
      console.log(`Run: ollama pull ${requiredModel}`);
      
      // Prompt to pull the model
      if (process.stdout.isTTY) {
        console.log('\nDo you want to pull this model now? (y/n)');
        const response = await new Promise(resolve => {
          process.stdin.once('data', data => {
            resolve(data.toString().trim().toLowerCase());
          });
        });
        
        if (response === 'y' || response === 'yes') {
          console.log(`\nPulling ${requiredModel}...`);
          try {
            execSync(`ollama pull ${requiredModel}`, { stdio: 'inherit' });
            console.log(`✅ Successfully pulled ${requiredModel}`);
          } catch (error) {
            console.error(`Failed to pull model: ${error.message}`);
            process.exit(1);
          }
        }
      }
    } else {
      console.log(`✅ Required model "${requiredModel}" is available`);
    }
    
  } catch (error) {
    console.error(`Error checking Ollama status: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Test the Ollama model with a simple prompt
 */
async function testOllamaModel(modelName) {
  console.log(`\nTesting ${modelName} with a simple scaling prompt...`);
  
  const testPrompt = `
I need to decide how many VM instances to provision in our Azure VM Scale Set.
Current metrics:
- CPU Usage: 78% (increasing trend)
- Memory Usage: 65% (stable)
- Network In: 250 MB
- Network Out: 120 MB
- Current instances: 3
- Min allowed: 2
- Max allowed: 10

What would be the optimal number of VM instances? Respond with a JSON object containing 'recommended_instances', 'confidence', and 'reasoning'.
  `;
  
  try {
    console.log('\nSending test prompt to Ollama...');
    console.time('Ollama Response Time');
    
    const response = await ollamaService.getScalingRecommendation(testPrompt, undefined, modelName);
    
    console.timeEnd('Ollama Response Time');
    
    if (response) {
      console.log('\n✅ Received valid response from Ollama:');
      console.log(JSON.stringify(response, null, 2));
      
      // Validate recommendation
      if (response.recommended_instances > 0) {
        console.log(`\n📈 Recommendation: Scale to ${response.recommended_instances} instances (confidence: ${response.confidence?.toFixed(2) || 'N/A'})`);
      } else {
        console.log('\n❌ Invalid recommendation: Instance count must be greater than 0');
      }
    } else {
      console.log('\n❌ Failed to get valid response from Ollama');
    }
  } catch (error) {
    console.error(`\n❌ Error testing Ollama model: ${error.message}`);
  }
}

/**
 * Run a single scaling cycle (fetch metrics + get scaling recommendation)
 */
async function runScalingCycle() {
  const dataDir = process.env.METRICS_PATH || './data';
  
  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Run fetch-metrics script if needed or requested
  const metricsFiles = fs.readdirSync(dataDir)
    .filter(file => file.startsWith('metrics_') && file.endsWith('.json'))
    .sort();
  
  if (metricsFiles.length === 0 || argOptions.fetchOnly) {
    console.log('\nFetching latest metrics...');
    try {
      // This will require Azure credentials to be set up
      execSync('node scripts/fetch-metrics.js', { stdio: 'inherit' });
      console.log('✅ Metrics fetched successfully');
    } catch (error) {
      console.error(`❌ Error fetching metrics: ${error.message}`);
      if (metricsFiles.length === 0) {
        console.log('No existing metrics found. Cannot proceed with scaling check.');
        return;
      }
      console.log('Using most recent available metrics instead.');
    }
  }
  
  if (argOptions.fetchOnly) {
    console.log('Fetch-only mode. Skipping scaling check.');
    return;
  }
  
  // Run the scaling script with dry-run flag for safety
  console.log('\nRunning scaling check (dry-run mode)...');
  let scalingFlags = ['--dry-run', `--model=${argOptions.model}`];
  
  try {
    execSync(`node scripts/schedule-scaling.js ${scalingFlags.join(' ')}`, { stdio: 'inherit' });
    console.log('✅ Scaling check completed');
  } catch (error) {
    console.error(`❌ Error during scaling check: ${error.message}`);
  }
}

/**
 * Run the system continuously at specified intervals
 */
function runContinuousMonitoring() {
  const intervalSec = parseInt(argOptions.interval);
  
  console.log(`Starting continuous monitoring (${intervalSec}s interval)`);
  console.log('Press Ctrl+C to stop');
  
  // Run immediately
  runScalingCycle();
  
  // Then schedule future runs
  const intervalId = setInterval(() => {
    console.log('\n' + '='.repeat(80));
    console.log(`Running scheduled check at ${new Date().toISOString()}`);
    console.log('='.repeat(80));
    runScalingCycle();
  }, intervalSec * 1000);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping monitoring...');
    clearInterval(intervalId);
    process.exit(0);
  });
}

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node monitor-scaling.js [options]

Monitor and test the infrastructure scaling system.

Options:
  --fetch-only           Only fetch metrics, don't run scaling check
  --test-ollama          Test Ollama with a simple scaling prompt
  --dry-run              Don't apply actual scaling changes (default)
  --continuous           Run in continuous monitoring mode
  --interval=SECONDS     Interval for continuous mode (default: 300)
  --model=NAME           Ollama model to use (default: from .env)
  --help, -h             Show this help message
  `);
  process.exit(0);
}

// Run the script
main(); 