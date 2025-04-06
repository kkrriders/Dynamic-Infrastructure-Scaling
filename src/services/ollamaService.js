// src/services/ollamaService.js

const axios = require('axios');
const logger = require('../utils/logger');

// Default configuration
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localnphost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:8b'; // Changed default to llama3:8b
const OLLAMA_FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'mistral:7b'; // Changed fallback to mistral:7b
const OLLAMA_REQUEST_TIMEOUT = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT || '120000'); // Increased timeout for larger models

// Default system prompt optimized for cloud resource prediction
const DEFAULT_SYSTEM_PROMPT = process.env.OLLAMA_SYSTEM_PROMPT || 
  `You are CloudScaleGPT, an expert Azure cloud engineer specializing in infrastructure scaling and optimization.
   
Your task is to recommend the optimal number of instances for a Virtual Machine Scale Set (VMSS) based on the metrics and current state provided.

Consider the following when making your decision:
1. CPU usage trends (both current and historical values)
2. Memory usage trends (both current and historical values)
3. Network traffic patterns (in/out bytes)
4. Disk I/O patterns (read/write operations)
5. Current number of instances
6. Minimum and maximum allowed instance counts

Aim to minimize costs while ensuring adequate performance. Scale up proactively before resources are exhausted, and scale down conservatively when usage decreases consistently.

Respond ONLY with a valid JSON object containing:
{
  "recommended_instances": <integer>,
  "confidence": <number between 0-1>,
  "reasoning": "<brief explanation of scaling decision>"
}`;

/**
 * Available model options for cloud resource management
 * These are models known to work well with Ollama and can handle
 * structured outputs that our system needs
 */
const CLOUD_RESOURCE_MODELS = {
  'llama3:70b': { // Best performance, requires more resources
    temperature: 0.1,
    num_predict: 100,
    description: 'Most accurate for complex resource decisions'
  },
  'llama3:8b': { // Updated parameters for optimal performance
    temperature: 0.1, // Lower temperature for more deterministic responses
    num_predict: 100, // Increased from 75 to 100 for more complete responses
    stop: ['\n}', '}\n'], // Added stop sequences to help with JSON generation
    num_ctx: 4096, // Explicitly set context window
    description: 'Optimized model for cloud scaling decisions'
  },
  'mistral:7b': { // Good alternative
    temperature: 0.3,
    num_predict: 75,
    description: 'Efficient model for scaling decisions'
  },
  'mixtral:8x7b': { // Strong reasoning capabilities
    temperature: 0.2,
    num_predict: 100,
    description: 'Strong reasoning for complex metrics analysis'
  },
  'gemma:7b': { // Google's model, efficient
    temperature: 0.2,
    num_predict: 75,
    description: 'Efficient model with good reasoning'
  }
};

/**
 * Get scaling recommendation from Ollama based on provided context
 * @param {string} prompt - The user prompt detailing the current state and metrics
 * @param {string} [systemPrompt=DEFAULT_SYSTEM_PROMPT] - The system prompt to guide the model
 * @param {string} [modelOverride=null] - Optional override for model selection
 * @returns {Promise<object | null>} - Parsed JSON response from Ollama or null on error
 */
async function getScalingRecommendation(prompt, systemPrompt = DEFAULT_SYSTEM_PROMPT, modelOverride = null) {
  // Determine which model to use
  const modelName = modelOverride || OLLAMA_MODEL;
  const fallbackModel = OLLAMA_FALLBACK_MODEL;
  
  logger.info(`Using model ${modelName} for scaling recommendation (fallback: ${fallbackModel})`);
  
  // Get model configuration for the selected model or use defaults
  const modelConfig = CLOUD_RESOURCE_MODELS[modelName] || {
    temperature: 0.2,
    num_predict: 75,
    description: 'Default configuration'
  };

  const url = `${OLLAMA_API_URL}/api/generate`;
  const payload = {
    model: modelName,
    prompt: prompt,
    system: systemPrompt,
    format: 'json', // Request JSON output
    stream: false, // Get the full response at once
    options: {
      temperature: modelConfig.temperature,
      num_predict: modelConfig.num_predict,
    }
  };

  logger.info(`Sending request to Ollama API: ${url}, Model: ${modelName} (${modelConfig.description})`);
  logger.debug('Ollama request payload:', { payload: { ...payload, prompt: '<prompt content hidden>' } });

  try {
    const response = await axios.post(url, payload, {
      timeout: OLLAMA_REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data && response.data.response) {
      logger.info('Received response from Ollama API');
      logger.debug('Ollama raw response:', { response: response.data.response });

      try {
        // Parse the JSON string within the response field
        const recommendation = JSON.parse(response.data.response);
        
        // Validate response has the expected fields
        if (typeof recommendation.recommended_instances !== 'number') {
          throw new Error('Response missing required "recommended_instances" field or not a number');
        }
        
        return recommendation;
      } catch (parseError) {
        logger.error(`Error parsing JSON response from Ollama: ${parseError.message}`, {
          rawResponse: response.data.response
        });
        
        // If primary model fails and it's not already the fallback, try the fallback model
        if (modelName !== fallbackModel) {
          logger.info(`Attempting to use fallback model ${fallbackModel}`);
          return getScalingRecommendation(prompt, systemPrompt, fallbackModel);
        }
        
        return null;
      }
    } else {
      logger.warn('Ollama API response did not contain expected data', { responseData: response.data });
      
      // Try fallback if not already using it
      if (modelName !== fallbackModel) {
        logger.info(`Attempting to use fallback model ${fallbackModel}`);
        return getScalingRecommendation(prompt, systemPrompt, fallbackModel);
      }
      
      return null;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Axios error calling Ollama API: ${error.message}`, {
        status: error.response?.status,
        data: error.response?.data,
        config: error.config
      });
    } else {
      logger.error(`Generic error calling Ollama API: ${error.message}`, { error });
    }
    
    // Try fallback if not already using it
    if (modelName !== fallbackModel) {
      logger.info(`Attempting to use fallback model ${fallbackModel} after error`);
      return getScalingRecommendation(prompt, systemPrompt, fallbackModel);
    }
    
    return null;
  }
}

/**
 * List available models from Ollama API
 * @returns {Promise<Array|null>} - List of available models or null on error
 */
async function listAvailableModels() {
  const url = `${OLLAMA_API_URL}/api/tags`;
  
  try {
    const response = await axios.get(url, {
      timeout: OLLAMA_REQUEST_TIMEOUT
    });
    
    if (response.data && response.data.models) {
      return response.data.models;
    }
    return null;
  } catch (error) {
    logger.error(`Error listing available Ollama models: ${error.message}`);
    return null;
  }
}

/**
 * Get recommended models for cloud resource management
 * @returns {Object} - Object containing recommended models
 */
function getRecommendedModels() {
  return CLOUD_RESOURCE_MODELS;
}

module.exports = {
  getScalingRecommendation,
  listAvailableModels,
  getRecommendedModels
}; 