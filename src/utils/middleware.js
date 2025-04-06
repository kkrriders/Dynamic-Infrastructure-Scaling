const logger = require('./logger');

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  logger.error(`Error processing request: ${err.message}`, { 
    error: err,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'An unexpected error occurred',
      status: err.status || 500
    }
  });
}

/**
 * Request validation middleware
 */
function validateRequest(schema) {
  return (req, res, next) => {
    try {
      if (!schema) {
        return next();
      }
      
      const validationTargets = {
        body: req.body,
        query: req.query,
        params: req.params
      };
      
      const validationErrors = [];
      
      // Validate each part of the request that has a schema
      Object.keys(schema).forEach(key => {
        if (schema[key] && validationTargets[key]) {
          const { error } = schema[key].validate(validationTargets[key], { abortEarly: false });
          if (error) {
            validationErrors.push(...error.details.map(detail => ({
              target: key,
              message: detail.message,
              path: detail.path
            })));
          }
        }
      });
      
      if (validationErrors.length > 0) {
        logger.warn(`Request validation failed: ${JSON.stringify(validationErrors)}`, {
          path: req.path,
          method: req.method
        });
        
        return res.status(400).json({
          error: 'Validation Error',
          details: validationErrors
        });
      }
      
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Rate limiting middleware with in-memory store
 * For production, replace with Redis or other distributed solution
 */
function rateLimit(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100, // 100 requests per windowMs
    message = 'Too many requests, please try again later'
  } = options;
  
  const requests = {};
  
  // Clean up old requests every windowMs
  setInterval(() => {
    const now = Date.now();
    Object.keys(requests).forEach(ip => {
      requests[ip] = requests[ip].filter(time => time > now - windowMs);
      if (requests[ip].length === 0) {
        delete requests[ip];
      }
    });
  }, windowMs);
  
  return (req, res, next) => {
    try {
      const ip = req.ip || req.connection.remoteAddress;
      
      if (!requests[ip]) {
        requests[ip] = [];
      }
      
      const now = Date.now();
      
      // Remove old requests outside the window
      requests[ip] = requests[ip].filter(time => time > now - windowMs);
      
      // Check if over limit
      if (requests[ip].length >= max) {
        logger.warn(`Rate limit exceeded for IP: ${ip}`, {
          path: req.path,
          method: req.method,
          count: requests[ip].length
        });
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message
        });
      }
      
      // Add current request
      requests[ip].push(now);
      
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: duration,
      ip: req.ip || req.connection.remoteAddress
    });
  });
  
  next();
}

module.exports = {
  errorHandler,
  validateRequest,
  rateLimit,
  requestLogger
}; 