const client = require('prom-client');
const logger = require('./logger');

// Create a Registry to register metrics
const register = new client.Registry();

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const scalingActionsCounter = new client.Counter({
  name: 'scaling_actions_total',
  help: 'Count of scaling actions performed',
  labelNames: ['direction', 'status'],
});

const ollamaResponseTime = new client.Histogram({
  name: 'ollama_response_time_seconds',
  help: 'Response time of Ollama API calls',
  labelNames: ['model', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const ollamaConfidenceScore = new client.Gauge({
  name: 'ollama_confidence_score',
  help: 'Confidence score of Ollama recommendations',
  labelNames: ['model']
});

const vmssCurrentInstances = new client.Gauge({
  name: 'vmss_current_instances',
  help: 'Current number of instances in the VMSS',
  labelNames: ['resource_group', 'vmss_name']
});

const cpuUtilizationGauge = new client.Gauge({
  name: 'cpu_utilization_percent',
  help: 'CPU utilization percentage from metrics collection',
  labelNames: ['resource_group', 'vmss_name']
});

const memoryUtilizationGauge = new client.Gauge({
  name: 'memory_utilization_percent',
  help: 'Memory utilization percentage from metrics collection',
  labelNames: ['resource_group', 'vmss_name']
});

// Register custom metrics
register.registerMetric(scalingActionsCounter);
register.registerMetric(ollamaResponseTime);
register.registerMetric(ollamaConfidenceScore);
register.registerMetric(vmssCurrentInstances);
register.registerMetric(cpuUtilizationGauge);
register.registerMetric(memoryUtilizationGauge);

// Initialize metrics with resource group and VMSS name
function initializeMetrics(resourceGroup, vmssName) {
  try {
    vmssCurrentInstances.labels(resourceGroup, vmssName).set(0);
    cpuUtilizationGauge.labels(resourceGroup, vmssName).set(0);
    memoryUtilizationGauge.labels(resourceGroup, vmssName).set(0);
    logger.info('Metrics initialized', { resourceGroup, vmssName });
  } catch (error) {
    logger.error('Error initializing metrics', { error });
  }
}

// Export the metrics
module.exports = {
  register,
  metrics: {
    scalingActionsCounter,
    ollamaResponseTime,
    ollamaConfidenceScore,
    vmssCurrentInstances,
    cpuUtilizationGauge,
    memoryUtilizationGauge
  },
  initializeMetrics,
  getMetricsAsJson: async () => {
    return await register.getMetricsAsJSON();
  },
  contentType: register.contentType
}; 