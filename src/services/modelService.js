// Model service file
const tf = require('@tensorflow/tfjs-node');
const { getHistoricalMetrics } = require('./dataCollectionService');
const { metricsCache } = require('../utils/cache');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// Configuration
const MODEL_SAVE_PATH = process.env.MODEL_SAVE_PATH || 'file://./models';
const PREDICTION_HORIZON = parseInt(process.env.PREDICTION_HORIZON || '12'); // 12 time steps (hours) by default
const LOOKBACK_WINDOW = parseInt(process.env.LOOKBACK_WINDOW || '24'); // 24 time steps (hours) by default
const CPU_THRESHOLD = parseInt(process.env.CPU_THRESHOLD || '70');
const MEMORY_THRESHOLD = parseInt(process.env.MEMORY_THRESHOLD || '80');
const NETWORK_THRESHOLD = parseInt(process.env.NETWORK_THRESHOLD || '75');
const CURRENT_INSTANCES = parseInt(process.env.CURRENT_INSTANCES || '2');

// Global model references
let cpuModel;
let memoryModel;
let networkModel;

/**
 * Initialize model service
 */
async function initializeModelService() {
  try {
    logger.info('Initializing model service...');
    
    // Ensure model directory exists
    const modelDir = MODEL_SAVE_PATH.replace('file://', '');
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
      logger.info(`Created model directory: ${modelDir}`);
    }
    
    // Try to load existing models, or create new ones if they don't exist
    try {
      cpuModel = await tf.loadLayersModel(`${MODEL_SAVE_PATH}/cpu_model/model.json`);
      logger.info('CPU model loaded successfully');
    } catch (error) {
      logger.info('No existing CPU model found, will create a new one when training');
    }
    
    try {
      memoryModel = await tf.loadLayersModel(`${MODEL_SAVE_PATH}/memory_model/model.json`);
      logger.info('Memory model loaded successfully');
    } catch (error) {
      logger.info('No existing memory model found, will create a new one when training');
    }
    
    try {
      networkModel = await tf.loadLayersModel(`${MODEL_SAVE_PATH}/network_model/model.json`);
      logger.info('Network model loaded successfully');
    } catch (error) {
      logger.info('No existing network model found, will create a new one when training');
    }
    
    // If any models are missing, try to train them with available data
    const metricsData = await getHistoricalMetrics(7).catch(() => []);
    
    if (metricsData.length >= LOOKBACK_WINDOW + 2) {
      if (!cpuModel) {
        logger.info('Training initial CPU model with available data...');
        await trainModel('cpu', 7).catch(err => 
          logger.warn(`Could not train initial CPU model: ${err.message}`)
        );
      }
      
      if (!memoryModel) {
        logger.info('Training initial memory model with available data...');
        await trainModel('memory', 7).catch(err => 
          logger.warn(`Could not train initial memory model: ${err.message}`)
        );
      }
      
      if (!networkModel) {
        logger.info('Training initial network model with available data...');
        await trainModel('network', 7).catch(err => 
          logger.warn(`Could not train initial network model: ${err.message}`)
        );
      }
    } else {
      logger.warn('Not enough historical data for initial model training');
    }
    
    logger.info('Model service initialized');
  } catch (error) {
    logger.error(`Error initializing model service: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Preprocess metrics data for model input
 */
function preprocessData(metricsArray, metricType) {
  try {
    // Extract relevant metrics based on type
    let timeSeriesData;
    
    switch (metricType) {
      case 'cpu':
        timeSeriesData = metricsArray.map(m => {
          const cpuMetric = m.cpu?.find(item => item.name?.value === 'Percentage CPU');
          const avgValue = cpuMetric?.timeseries?.[0]?.data?.[0]?.average || 0;
          return avgValue;
        });
        break;
      case 'memory':
        timeSeriesData = metricsArray.map(m => {
          const memMetric = m.memory?.find(item => item.name?.value === 'Available Memory Bytes');
          const avgValue = memMetric?.timeseries?.[0]?.data?.[0]?.average || 0;
          return avgValue;
        });
        break;
      case 'network':
        timeSeriesData = metricsArray.map(m => {
          const netInMetric = m.network?.find(item => item.name?.value === 'Network In');
          const netOutMetric = m.network?.find(item => item.name?.value === 'Network Out');
          const totalIn = netInMetric?.timeseries?.[0]?.data?.[0]?.total || 0;
          const totalOut = netOutMetric?.timeseries?.[0]?.data?.[0]?.total || 0;
          return totalIn + totalOut;
        });
        break;
      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }
    
    // Normalize data (simple min-max scaling)
    const min = Math.min(...timeSeriesData);
    const max = Math.max(...timeSeriesData);
    const range = max - min;
    const normalizedData = range > 0 
      ? timeSeriesData.map(val => (val - min) / range) 
      : timeSeriesData.map(() => 0.5);
    
    // Create sequences with lookback window
    const sequences = [];
    const targets = [];
    
    for (let i = 0; i <= normalizedData.length - LOOKBACK_WINDOW - 1; i++) {
      const sequence = normalizedData.slice(i, i + LOOKBACK_WINDOW);
      const target = normalizedData[i + LOOKBACK_WINDOW];
      sequences.push(sequence);
      targets.push(target);
    }
    
    // Convert to tensors
    const inputTensor = tf.tensor2d(sequences);
    const targetTensor = tf.tensor2d(targets, [targets.length, 1]);
    
    return {
      inputs: inputTensor,
      targets: targetTensor,
      min,
      max,
      normalizedData
    };
  } catch (error) {
    logger.error(`Error preprocessing data: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Create a new time series prediction model
 */
function createModel() {
  const model = tf.sequential();
  
  // Add layers
  model.add(tf.layers.lstm({
    units: 50,
    returnSequences: true,
    inputShape: [LOOKBACK_WINDOW, 1]
  }));
  
  model.add(tf.layers.dropout({ rate: 0.2 }));
  
  model.add(tf.layers.lstm({
    units: 50,
    returnSequences: false
  }));
  
  model.add(tf.layers.dropout({ rate: 0.2 }));
  
  model.add(tf.layers.dense({ units: 1 }));
  
  // Compile model
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError'
  });
  
  return model;
}

/**
 * Train model with historical data
 */
async function trainModel(metricType, days = 30) {
  try {
    logger.info(`Training ${metricType} model with ${days} days of historical data...`);
    
    // Get historical metrics (use cache if available)
    const metricsArray = await metricsCache.getOrSet(`historical-metrics:${days}`, async () => {
      return await getHistoricalMetrics(days);
    });
    
    if (metricsArray.length < LOOKBACK_WINDOW + PREDICTION_HORIZON) {
      throw new Error(`Not enough historical data for training (got ${metricsArray.length}, need at least ${LOOKBACK_WINDOW + PREDICTION_HORIZON})`);
    }
    
    // Preprocess data
    const { inputs, targets, min, max } = preprocessData(metricsArray, metricType);
    
    // Reshape inputs for LSTM [samples, timesteps, features]
    const reshapedInputs = inputs.reshape([inputs.shape[0], LOOKBACK_WINDOW, 1]);
    
    // Get or create model
    let model;
    
    switch (metricType) {
      case 'cpu':
        if (!cpuModel) {
          cpuModel = createModel();
        }
        model = cpuModel;
        break;
      case 'memory':
        if (!memoryModel) {
          memoryModel = createModel();
        }
        model = memoryModel;
        break;
      case 'network':
        if (!networkModel) {
          networkModel = createModel();
        }
        model = networkModel;
        break;
      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }
    
    // Train model
    await model.fit(reshapedInputs, targets, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            logger.info(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}, val_loss = ${logs.val_loss.toFixed(4)}`);
          }
        }
      }
    });
    
    // Save model
    await model.save(`${MODEL_SAVE_PATH}/${metricType}_model`);
    
    // Save normalization params
    await savePredictionMetadata(metricType, { min, max });
    
    logger.info(`${metricType} model trained and saved successfully`);
    
    // Clear any cached predictions as they're now outdated
    metricsCache.delete(`predictions:${metricType}`);
    
    return { model, min, max };
  } catch (error) {
    logger.error(`Error training ${metricType} model: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Save prediction metadata (normalization params)
 */
async function savePredictionMetadata(metricType, metadata) {
  try {
    // Save metadata to model directory
    const modelDir = MODEL_SAVE_PATH.replace('file://', '');
    const dir = path.join(modelDir, `${metricType}_model`);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    
    logger.info(`Prediction metadata saved for ${metricType} model`);
  } catch (error) {
    logger.error(`Error saving prediction metadata: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Load prediction metadata (normalization params)
 */
async function loadPredictionMetadata(metricType) {
  try {
    const modelDir = MODEL_SAVE_PATH.replace('file://', '');
    const metadataPath = path.join(modelDir, `${metricType}_model`, 'metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`No metadata found for ${metricType} model`);
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return metadata;
  } catch (error) {
    logger.error(`Error loading prediction metadata: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Generate predictions for future resource usage
 */
async function generatePredictions(metricType, steps = PREDICTION_HORIZON) {
  try {
    logger.info(`Generating ${steps} predictions for ${metricType}`);
    
    // Get recent metrics
    const recentMetrics = await metricsCache.getOrSet('recent-metrics', async () => {
      return await getHistoricalMetrics(7); // Get last 7 days of data
    }, 60 * 1000); // Cache for 1 minute
    
    if (recentMetrics.length < LOOKBACK_WINDOW) {
      throw new Error(`Not enough historical data for prediction (got ${recentMetrics.length}, need at least ${LOOKBACK_WINDOW})`);
    }
    
    let model;
    let metadata;
    
    // Get the appropriate model and metadata
    switch (metricType) {
      case 'cpu':
        if (!cpuModel) {
          // Try to load the model
          try {
            cpuModel = await tf.loadLayersModel(`${MODEL_SAVE_PATH}/cpu_model/model.json`);
          } catch (e) {
            throw new Error(`CPU model not available: ${e.message}`);
          }
        }
        model = cpuModel;
        metadata = await loadPredictionMetadata('cpu');
        break;
      case 'memory':
        if (!memoryModel) {
          try {
            memoryModel = await tf.loadLayersModel(`${MODEL_SAVE_PATH}/memory_model/model.json`);
          } catch (e) {
            throw new Error(`Memory model not available: ${e.message}`);
          }
        }
        model = memoryModel;
        metadata = await loadPredictionMetadata('memory');
        break;
      case 'network':
        if (!networkModel) {
          try {
            networkModel = await tf.loadLayersModel(`${MODEL_SAVE_PATH}/network_model/model.json`);
          } catch (e) {
            throw new Error(`Network model not available: ${e.message}`);
          }
        }
        model = networkModel;
        metadata = await loadPredictionMetadata('network');
        break;
      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }
    
    // Extract normalization parameters
    const { min, max } = metadata;
    const range = max - min;
    
    // Extract and normalize relevant metrics for sequence input
    const { normalizedData } = preprocessData(recentMetrics, metricType);
    
    // Get the most recent window for prediction
    const initialSequence = normalizedData.slice(-LOOKBACK_WINDOW);
    
    // Ensure sequence is the right length
    if (initialSequence.length < LOOKBACK_WINDOW) {
      throw new Error(`Insufficient data for lookback window (got ${initialSequence.length}, need ${LOOKBACK_WINDOW})`);
    }
    
    // Generate predictions
    const predictions = [];
    let currentSequence = [...initialSequence];
    
    for (let i = 0; i < steps; i++) {
      // Prepare input
      const inputTensor = tf.tensor2d([currentSequence]).reshape([1, LOOKBACK_WINDOW, 1]);
      
      // Generate prediction
      const predictionTensor = model.predict(inputTensor);
      const predictionValue = predictionTensor.dataSync()[0];
      
      // Denormalize prediction
      const denormalizedValue = predictionValue * range + min;
      
      // Add timestamp for this prediction
      const timestampForPrediction = new Date();
      timestampForPrediction.setHours(timestampForPrediction.getHours() + i + 1);
      
      // Add to predictions array
      predictions.push({
        timestamp: timestampForPrediction.toISOString(),
        value: parseFloat(denormalizedValue.toFixed(2)),
        normalized: parseFloat(predictionValue.toFixed(4))
      });
      
      // Update sequence for next prediction (rolling window)
      currentSequence.shift();
      currentSequence.push(predictionValue);
      
      // Clean up tensors
      predictionTensor.dispose();
      inputTensor.dispose();
    }
    
    logger.info(`Generated ${predictions.length} predictions for ${metricType}`);
    return predictions;
  } catch (error) {
    logger.error(`Error generating predictions: ${error.message}`, { error });
    // Return a default empty array or partial predictions if we have them
    return [];
  }
}

/**
 * Get scaling recommendations based on predictions
 */
async function getScalingRecommendations() {
  try {
    // Generate predictions for all metrics
    let cpuPredictions = [];
    let memoryPredictions = [];
    let networkPredictions = [];
    
    try {
      cpuPredictions = await generatePredictions('cpu');
    } catch (error) {
      logger.warn(`Could not generate CPU predictions: ${error.message}`);
    }
    
    try {
      memoryPredictions = await generatePredictions('memory');
    } catch (error) {
      logger.warn(`Could not generate memory predictions: ${error.message}`);
    }
    
    try {
      networkPredictions = await generatePredictions('network');
    } catch (error) {
      logger.warn(`Could not generate network predictions: ${error.message}`);
    }
    
    // Analyze predictions for scaling decisions
    // Check if any predictions exceed thresholds
    const cpuExceedsThreshold = cpuPredictions.some(p => p.value > CPU_THRESHOLD);
    const memoryExceedsThreshold = memoryPredictions.some(p => p.value > MEMORY_THRESHOLD);
    const networkExceedsThreshold = networkPredictions.some(p => p.value > NETWORK_THRESHOLD);
    
    // Get current instance count
    let currentInstances = CURRENT_INSTANCES;
    try {
      // Try to get actual current instances
      currentInstances = await require('./infrastructureService').getCurrentVMSSCapacity();
    } catch (error) {
      logger.warn(`Could not get current VMSS capacity, using default value (${CURRENT_INSTANCES}): ${error.message}`);
    }
    
    // Calculate recommended instance count based on highest predictions
    const maxCpuPrediction = cpuPredictions.length > 0 
      ? Math.max(...cpuPredictions.map(p => p.value))
      : 0;
      
    const maxMemoryPrediction = memoryPredictions.length > 0
      ? Math.max(...memoryPredictions.map(p => p.value))
      : 0;
      
    const maxNetworkPrediction = networkPredictions.length > 0
      ? Math.max(...networkPredictions.map(p => p.value))
      : 0;
    
    // Calculate scaling factor based on CPU as primary metric
    // Only scale out if exceeds threshold
    let recommendedInstances = currentInstances;
    
    if (cpuExceedsThreshold) {
      // Formula: Scale instances proportionally to CPU utilization over threshold
      recommendedInstances = Math.ceil(currentInstances * (maxCpuPrediction / CPU_THRESHOLD));
      
      // Alternative approach: One instance per x% over threshold
      // const scalingStep = Math.ceil((maxCpuPrediction - CPU_THRESHOLD) / 20); // 1 instance per 20% over threshold
      // recommendedInstances = currentInstances + scalingStep;
    } else if (maxCpuPrediction < CPU_THRESHOLD * 0.5 && currentInstances > 1) {
      // Scale in if CPU is less than 50% of threshold and we have multiple instances
      recommendedInstances = Math.max(1, Math.floor(currentInstances * (maxCpuPrediction / (CPU_THRESHOLD * 0.7))));
    }
    
    // Limit max scaling to prevent overly aggressive scaling
    const maxScaleOut = currentInstances * 2;
    recommendedInstances = Math.min(recommendedInstances, maxScaleOut);
    
    // Sanity check - ensure we have at least 1 instance
    recommendedInstances = Math.max(1, recommendedInstances);
    
    // Return scaling recommendations
    return {
      timestamp: new Date().toISOString(),
      metrics: {
        cpu: {
          predictions: cpuPredictions,
          exceedsThreshold: cpuExceedsThreshold,
          maxPrediction: maxCpuPrediction,
          threshold: CPU_THRESHOLD
        },
        memory: {
          predictions: memoryPredictions,
          exceedsThreshold: memoryExceedsThreshold,
          maxPrediction: maxMemoryPrediction,
          threshold: MEMORY_THRESHOLD
        },
        network: {
          predictions: networkPredictions,
          exceedsThreshold: networkExceedsThreshold,
          maxPrediction: maxNetworkPrediction,
          threshold: NETWORK_THRESHOLD
        }
      },
      scaling: {
        currentInstances,
        recommendedInstances,
        scaleOutRecommended: recommendedInstances > currentInstances,
        scaleInRecommended: recommendedInstances < currentInstances
      }
    };
  } catch (error) {
    logger.error(`Error generating scaling recommendations: ${error.message}`, { error });
    
    // Return a default recommendation with no scaling action
    return {
      timestamp: new Date().toISOString(),
      error: error.message,
      metrics: {
        cpu: { predictions: [], threshold: CPU_THRESHOLD },
        memory: { predictions: [], threshold: MEMORY_THRESHOLD },
        network: { predictions: [], threshold: NETWORK_THRESHOLD }
      },
      scaling: {
        currentInstances: CURRENT_INSTANCES,
        recommendedInstances: CURRENT_INSTANCES,
        scaleOutRecommended: false,
        scaleInRecommended: false
      }
    };
  }
}

module.exports = {
  initializeModelService,
  trainModel,
  createModel,
  generatePredictions,
  getScalingRecommendations,
  preprocessData
}; 
