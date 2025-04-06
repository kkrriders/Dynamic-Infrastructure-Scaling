const express = require('express');
const axios = require('axios');
const { getHistoricalMetrics } = require('../services/dataCollectionService');
const { getScalingRecommendations } = require('../services/modelService');
const logger = require('../utils/logger');
const { validateRequest } = require('../utils/middleware');
const Joi = require('joi');

const router = express.Router();

// Configure Ollama API
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama2';

// Validation schemas
const optimizeSchema = {
  body: Joi.object({
    costConstraint: Joi.string().optional(),
    performanceTarget: Joi.string().optional()
  })
};

/**
 * Call Ollama API for generating text
 * @param {string} prompt - The prompt to send to Ollama
 * @returns {Promise<string>} The generated text
 */
async function callOllamaAPI(prompt) {
  try {
    const response = await axios.post(`${OLLAMA_API_URL}/generate`, {
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    });
    
    return response.data.response;
  } catch (error) {
    logger.error(`Error calling Ollama API: ${error.message}`, { error });
    throw new Error(`Failed to call Ollama API: ${error.message}`);
  }
}

/**
 * @route GET /api/insights/summary
 * @description Get natural language summary of the current system state and recommendations
 */
router.get('/summary', async (req, res, next) => {
  try {
    if (process.env.ENABLE_INSIGHTS === 'false') {
      return res.status(400).json({
        error: 'Insights features are disabled. Set ENABLE_INSIGHTS=true and configure OLLAMA_API_URL.'
      });
    }
    
    // Get scaling recommendations
    const recommendations = await getScalingRecommendations();
    
    // Get recent metrics for context
    const recentMetrics = await getHistoricalMetrics(1); // Last day
    
    // Prepare data for Ollama
    const prompt = generateSummaryPrompt(recommendations, recentMetrics);
    
    // Call Ollama API
    const summary = await callOllamaAPI(prompt);
    
    return res.json({
      summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error generating insights summary: ${error.message}`, { error });
    next(error);
  }
});

/**
 * Generate prompt for summary
 */
function generateSummaryPrompt(recommendations, recentMetrics) {
  // Extract key information
  const { 
    metrics: { 
      cpu: { maxPrediction: cpuMax, threshold: cpuThreshold }, 
      memory: { maxPrediction: memoryMax, threshold: memoryThreshold },
      network: { maxPrediction: networkMax, threshold: networkThreshold }
    },
    scaling: { 
      currentInstances, 
      recommendedInstances, 
      scaleOutRecommended, 
      scaleInRecommended 
    }
  } = recommendations;
  
  // Build prompt
  return `
    Generate a concise summary of the current Azure infrastructure state and scaling recommendations based on the following data:
    
    Current Infrastructure:
    - Virtual Machine Scale Set with ${currentInstances} instances
    
    Resource Metrics:
    - CPU Utilization: Maximum predicted ${cpuMax.toFixed(2)}% (threshold: ${cpuThreshold}%)
    - Memory Utilization: Maximum predicted ${memoryMax.toFixed(2)}% (threshold: ${memoryThreshold}%)
    - Network Utilization: Maximum predicted ${networkMax.toFixed(2)}% (threshold: ${networkThreshold}%)
    
    Scaling Recommendation:
    - Recommended instance count: ${recommendedInstances}
    - Scale out recommended: ${scaleOutRecommended}
    - Scale in recommended: ${scaleInRecommended}
    
    Generate a short paragraph that:
    1. Summarizes the current state
    2. Explains the reasoning behind the scaling recommendation
    3. Highlights any potential risks or opportunities
    4. Provides a clear recommendation for action
  `;
}

/**
 * @route GET /api/insights/anomalies
 * @description Detect anomalies in recent metrics using Ollama
 */
router.get('/anomalies', async (req, res, next) => {
  try {
    if (process.env.ENABLE_INSIGHTS === 'false') {
      return res.status(400).json({
        error: 'Insights features are disabled. Set ENABLE_INSIGHTS=true and configure OLLAMA_API_URL.'
      });
    }
    
    // Get recent metrics
    const recentMetrics = await getHistoricalMetrics(7); // Last week
    
    // Prepare data for Ollama
    const prompt = generateAnomalyPrompt(recentMetrics);
    
    // Call Ollama API
    const analysis = await callOllamaAPI(prompt);
    
    return res.json({
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error detecting anomalies: ${error.message}`, { error });
    next(error);
  }
});

/**
 * Generate prompt for anomaly detection
 */
function generateAnomalyPrompt(recentMetrics) {
  // Extract and format metrics
  const formattedMetrics = recentMetrics.map(metric => {
    const cpuMetric = metric.cpu?.find(item => item.name?.value === 'Percentage CPU');
    const cpuValue = cpuMetric?.timeseries?.[0]?.data?.[0]?.average || 0;
    
    const memMetric = metric.memory?.find(item => item.name?.value === 'Available Memory Bytes');
    const memValue = memMetric?.timeseries?.[0]?.data?.[0]?.average || 0;
    
    const netInMetric = metric.network?.find(item => item.name?.value === 'Network In');
    const netOutMetric = metric.network?.find(item => item.name?.value === 'Network Out');
    const netInValue = netInMetric?.timeseries?.[0]?.data?.[0]?.total || 0;
    const netOutValue = netOutMetric?.timeseries?.[0]?.data?.[0]?.total || 0;
    
    return {
      timestamp: metric.timestamp,
      cpu: cpuValue.toFixed(2),
      memory: memValue.toFixed(2),
      networkIn: netInValue,
      networkOut: netOutValue
    };
  });
  
  // Build prompt
  return `
    Analyze the following time series data for anomalies and patterns. The data represents a week of infrastructure metrics:
    
    ${JSON.stringify(formattedMetrics, null, 2)}
    
    Identify and explain:
    1. Any anomalies or outliers in the data
    2. Any notable patterns or trends
    3. Potential root causes for unusual behavior
    4. Recommendations for addressing any identified issues
    
    Focus on insights that would be relevant for infrastructure scaling decisions.
  `;
}

/**
 * @route POST /api/insights/optimize
 * @description Generate cost optimization recommendations
 */
router.post('/optimize', validateRequest(optimizeSchema), async (req, res, next) => {
  try {
    if (process.env.ENABLE_INSIGHTS === 'false') {
      return res.status(400).json({
        error: 'Insights features are disabled. Set ENABLE_INSIGHTS=true and configure OLLAMA_API_URL.'
      });
    }
    
    const { costConstraint, performanceTarget } = req.body;
    
    // Get recommendations and metrics
    const recommendations = await getScalingRecommendations();
    const historicalMetrics = await getHistoricalMetrics(30); // Last month
    
    // Prepare data for Ollama
    const prompt = generateOptimizationPrompt(
      recommendations, 
      historicalMetrics, 
      costConstraint, 
      performanceTarget
    );
    
    // Call Ollama API
    const optimization = await callOllamaAPI(prompt);
    
    return res.json({
      optimization,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error generating optimization recommendations: ${error.message}`, { error });
    next(error);
  }
});

/**
 * Generate prompt for cost optimization
 */
function generateOptimizationPrompt(recommendations, historicalMetrics, costConstraint, performanceTarget) {
  // Build prompt
  return `
    Generate cost optimization recommendations for Azure infrastructure based on the following parameters:
    
    Current Infrastructure:
    - Virtual Machine Scale Set with ${recommendations.scaling.currentInstances} instances
    - Maximum predicted CPU: ${recommendations.metrics.cpu.maxPrediction.toFixed(2)}%
    - Maximum predicted Memory: ${recommendations.metrics.memory.maxPrediction.toFixed(2)}%
    
    Constraints:
    - Monthly cost constraint: ${costConstraint || 'Not specified'}
    - Performance target: ${performanceTarget || 'Not specified'}
    
    Historical Patterns:
    - ${historicalMetrics.length} days of historical data
    
    Provide recommendations for:
    1. Optimal instance count considering the constraints
    2. Potential cost savings opportunities
    3. Schedule-based scaling strategies based on historical patterns
    4. Any resource right-sizing suggestions
    
    Focus on practical, implementable suggestions with estimated cost impacts.
  `;
}

module.exports = router; 