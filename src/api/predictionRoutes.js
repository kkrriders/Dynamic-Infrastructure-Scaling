const express = require('express');
const { generatePredictions, getScalingRecommendations } = require('../services/modelService');
const { applyScalingRecommendation, getCurrentVMSSCapacity } = require('../services/infrastructureService');
const { validateRequest } = require('../utils/middleware');
const { predictionsCache } = require('../utils/cache');
const logger = require('../utils/logger');
const Joi = require('joi');

const router = express.Router();

// Validation schemas
const metricTypeSchema = {
  params: Joi.object({
    metricType: Joi.string().valid('cpu', 'memory', 'network').required()
  }),
  query: Joi.object({
    steps: Joi.number().integer().min(1).max(168).optional() // Max 7 days (168 hours)
  })
};

const customScalingSchema = {
  body: Joi.object({
    instanceCount: Joi.number().integer().min(1).max(100).required()
  })
};

/**
 * @route GET /api/predictions/metrics/:metricType
 * @description Get predictions for a specific metric
 */
router.get('/metrics/:metricType', validateRequest(metricTypeSchema), async (req, res, next) => {
  try {
    const { metricType } = req.params;
    const steps = req.query.steps ? parseInt(req.query.steps) : undefined;
    
    // Use cache for predictions to avoid unnecessary computation
    const cacheKey = `predictions:${metricType}:${steps || 'default'}`;
    
    const predictions = await predictionsCache.getOrSet(cacheKey, async () => {
      logger.info(`Generating predictions for ${metricType}, steps=${steps || 'default'}`);
      return await generatePredictions(metricType, steps);
    });
    
    return res.json({
      metricType,
      predictions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error generating predictions: ${error.message}`, { error });
    next(error);
  }
});

/**
 * @route GET /api/predictions/recommendations
 * @description Get scaling recommendations based on predictions
 */
router.get('/recommendations', async (req, res, next) => {
  try {
    // Use cache for recommendations with a short TTL
    const cacheKey = 'scaling:recommendations';
    
    const recommendations = await predictionsCache.getOrSet(cacheKey, async () => {
      logger.info('Generating scaling recommendations');
      return await getScalingRecommendations();
    }, 5 * 60 * 1000); // 5 minute TTL
    
    return res.json({
      ...recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error generating recommendations: ${error.message}`, { error });
    next(error);
  }
});

/**
 * @route POST /api/predictions/apply
 * @description Apply scaling recommendation
 */
router.post('/apply', async (req, res, next) => {
  try {
    // Generate new recommendations
    const recommendations = await getScalingRecommendations();
    
    // Apply recommendations
    const result = await applyScalingRecommendation(recommendations);
    
    // Invalidate cache since we've changed infrastructure
    predictionsCache.delete('scaling:recommendations');
    
    return res.json({
      success: true,
      result,
      recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error applying recommendations: ${error.message}`, { error });
    next(error);
  }
});

/**
 * @route POST /api/predictions/apply-custom
 * @description Apply custom scaling configuration
 */
router.post('/apply-custom', validateRequest(customScalingSchema), async (req, res, next) => {
  try {
    const { instanceCount } = req.body;
    
    // First get current capacity
    const currentInstances = await getCurrentVMSSCapacity();
    
    // Initialize the recommendation object properly (fix bug with self-reference)
    const customRecommendation = {
      scaling: {
        currentInstances,
        recommendedInstances: instanceCount,
        // Set based on comparison after object is created
        scaleOutRecommended: false,
        scaleInRecommended: false
      }
    };
    
    // Now set the scale direction flags properly
    customRecommendation.scaling.scaleOutRecommended = instanceCount > currentInstances;
    customRecommendation.scaling.scaleInRecommended = instanceCount < currentInstances;
    
    // Apply custom recommendation
    const result = await applyScalingRecommendation(customRecommendation);
    
    // Invalidate cache since we've changed infrastructure
    predictionsCache.delete('scaling:recommendations');
    
    return res.json({
      success: true,
      result,
      customRecommendation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error applying custom scaling: ${error.message}`, { error });
    next(error);
  }
});

module.exports = router; 