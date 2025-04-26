// GCP service file for metrics collection and infrastructure scaling
const {Compute} = require('@google-cloud/compute');
const monitoring = require('@google-cloud/monitoring');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Configuration from environment variables
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_ZONE = process.env.GCP_ZONE || 'us-central1-a';
const GCP_REGION = process.env.GCP_REGION || 'us-central1';
const GCP_INSTANCE_GROUP = process.env.GCP_INSTANCE_GROUP;
const GCP_CREDENTIALS_FILE = process.env.GCP_CREDENTIALS_FILE;

// GCP clients
let compute;
let monitoringClient;

/**
 * Initialize GCP service clients
 */
async function initializeGcpService() {
  try {
    logger.info('Initializing GCP services...');

    // Create options object with credentials if provided
    const options = {};
    if (GCP_CREDENTIALS_FILE && fs.existsSync(GCP_CREDENTIALS_FILE)) {
      options.keyFilename = GCP_CREDENTIALS_FILE;
    }

    // Initialize Compute Engine client
    compute = new Compute(options);
    
    // Initialize Cloud Monitoring client
    monitoringClient = new monitoring.MetricServiceClient(options);
    
    logger.info(`GCP services initialized for project: ${GCP_PROJECT_ID}`);
    return true;
  } catch (error) {
    logger.error(`Error initializing GCP services: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Get the current state of the GCP instance group
 * @param {string} [instanceGroupName=GCP_INSTANCE_GROUP] - Name of the instance group to check
 * @param {string} [zone=GCP_ZONE] - Zone of the instance group
 * @returns {Promise<Object>} Instance group details
 */
async function getInstanceGroupState(instanceGroupName = GCP_INSTANCE_GROUP, zone = GCP_ZONE) {
  try {
    if (!compute) {
      await initializeGcpService();
    }
    
    logger.info(`Fetching instance group state for ${instanceGroupName} in ${zone}`);
    
    // Get instance group manager
    const zoneObj = compute.zone(zone);
    const instanceGroupManager = zoneObj.instanceGroupManager(instanceGroupName);
    const [instanceGroup] = await instanceGroupManager.get();
    
    // Get current target size (equivalent to capacity)
    const targetSize = instanceGroup.targetSize;
    
    // Get autoscaler info if available
    let autoscalerInfo = null;
    try {
      const [autoscalers] = await zoneObj.getAutoscalers({
        filter: `name=${instanceGroupName}-autoscaler`
      });
      
      if (autoscalers && autoscalers.length > 0) {
        autoscalerInfo = autoscalers[0];
      }
    } catch (error) {
      logger.warn(`No autoscaler found for instance group ${instanceGroupName}`);
    }
    
    return {
      name: instanceGroupName,
      targetSize,
      zone,
      project: GCP_PROJECT_ID,
      autoscalerInfo,
      instanceTemplate: instanceGroup.instanceTemplate,
      instanceGroupManager: instanceGroup
    };
  } catch (error) {
    logger.error(`Error getting instance group state: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Collect recent metrics for a GCP instance group
 * @param {string} [instanceGroupName=GCP_INSTANCE_GROUP] - Instance group name
 * @param {number} [lookbackHours=1] - Hours of historical data to collect
 * @param {number} [intervalMinutes=15] - Interval resolution in minutes
 * @returns {Promise<Object>} Metrics data
 */
async function collectInstanceGroupMetrics(
  instanceGroupName = GCP_INSTANCE_GROUP,
  lookbackHours = 1,
  intervalMinutes = 15
) {
  try {
    if (!monitoringClient) {
      await initializeGcpService();
    }
    
    logger.info(`Collecting metrics for instance group ${instanceGroupName} with ${lookbackHours}h lookback`);
    
    // Calculate time range
    const now = new Date();
    const startTime = new Date(now.getTime() - (lookbackHours * 60 * 60 * 1000));
    
    // Format timerange for GCP API
    const timeInterval = {
      startTime: {
        seconds: Math.floor(startTime.getTime() / 1000),
        nanos: 0,
      },
      endTime: {
        seconds: Math.floor(now.getTime() / 1000),
        nanos: 0,
      },
    };
    
    // Create filter for CPU utilization
    const cpuFilter = `metric.type="compute.googleapis.com/instance/cpu/utilization" AND 
                        resource.type="gce_instance" AND
                        resource.labels.instance_group_name="${instanceGroupName}"`;
    
    // Get CPU utilization metrics
    const cpuRequest = {
      name: `projects/${GCP_PROJECT_ID}`,
      filter: cpuFilter,
      interval: timeInterval,
      aggregation: {
        alignmentPeriod: { seconds: intervalMinutes * 60 },
        perSeriesAligner: 'ALIGN_MEAN',
        crossSeriesReducer: 'REDUCE_MEAN'
      }
    };
    
    // Create filter for memory utilization (requires monitoring agent)
    const memoryFilter = `metric.type="agent.googleapis.com/memory/percent_used" AND 
                           resource.type="gce_instance" AND
                           resource.labels.instance_group_name="${instanceGroupName}"`;
    
    // Get memory utilization metrics
    const memoryRequest = {
      name: `projects/${GCP_PROJECT_ID}`,
      filter: memoryFilter,
      interval: timeInterval,
      aggregation: {
        alignmentPeriod: { seconds: intervalMinutes * 60 },
        perSeriesAligner: 'ALIGN_MEAN',
        crossSeriesReducer: 'REDUCE_MEAN'
      }
    };
    
    // Create filter for network traffic (ingress)
    const networkInFilter = `metric.type="compute.googleapis.com/instance/network/received_bytes_count" AND 
                              resource.type="gce_instance" AND
                              resource.labels.instance_group_name="${instanceGroupName}"`;
    
    // Get network ingress metrics
    const networkInRequest = {
      name: `projects/${GCP_PROJECT_ID}`,
      filter: networkInFilter,
      interval: timeInterval,
      aggregation: {
        alignmentPeriod: { seconds: intervalMinutes * 60 },
        perSeriesAligner: 'ALIGN_RATE',
        crossSeriesReducer: 'REDUCE_SUM'
      }
    };
    
    // Create filter for network traffic (egress)
    const networkOutFilter = `metric.type="compute.googleapis.com/instance/network/sent_bytes_count" AND 
                               resource.type="gce_instance" AND
                               resource.labels.instance_group_name="${instanceGroupName}"`;
    
    // Get network egress metrics
    const networkOutRequest = {
      name: `projects/${GCP_PROJECT_ID}`,
      filter: networkOutFilter,
      interval: timeInterval,
      aggregation: {
        alignmentPeriod: { seconds: intervalMinutes * 60 },
        perSeriesAligner: 'ALIGN_RATE',
        crossSeriesReducer: 'REDUCE_SUM'
      }
    };
    
    // Execute all metric requests in parallel
    const [cpuResponse, memoryResponse, networkInResponse, networkOutResponse] = await Promise.all([
      monitoringClient.listTimeSeries(cpuRequest),
      monitoringClient.listTimeSeries(memoryRequest),
      monitoringClient.listTimeSeries(networkInRequest),
      monitoringClient.listTimeSeries(networkOutRequest)
    ]);
    
    // Process and format metrics
    const cpuData = processTimeSeriesData(cpuResponse[0], 'cpu', true);
    const memoryData = processTimeSeriesData(memoryResponse[0], 'memory', true);
    const networkInData = processTimeSeriesData(networkInResponse[0], 'networkIn', false);
    const networkOutData = processTimeSeriesData(networkOutResponse[0], 'networkOut', false);
    
    // Get instance group state for reference
    const instanceGroup = await getInstanceGroupState(instanceGroupName);
    
    // Combine all metrics
    return {
      timestamp: now.toISOString(),
      instanceGroup: instanceGroupName,
      project: GCP_PROJECT_ID,
      zone: GCP_ZONE,
      lookbackHours,
      intervalMinutes,
      currentInstances: instanceGroup.targetSize,
      metrics: {
        cpu: cpuData,
        memory: memoryData,
        networkIn: networkInData,
        networkOut: networkOutData
      }
    };
  } catch (error) {
    logger.error(`Error collecting instance group metrics: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Process time series data from Cloud Monitoring API
 * @param {Array} timeSeriesData - Data from monitoring API
 * @param {string} metricType - Type of metric (cpu, memory, networkIn, networkOut)
 * @param {boolean} isPercentage - Whether to convert values to percentage
 * @returns {Array} Processed metric data
 */
function processTimeSeriesData(timeSeriesData, metricType, isPercentage = false) {
  if (!timeSeriesData || timeSeriesData.length === 0) {
    logger.warn(`No ${metricType} metrics found`);
    return [];
  }
  
  return timeSeriesData.map(series => {
    // Extract metric points
    const points = series.points || [];
    
    // Map points to standardized format
    return points.map(point => {
      let value = point.value.doubleValue || 0;
      
      // Convert to percentage if needed
      if (isPercentage) {
        value = value * 100;
      }
      
      const timestamp = new Date(
        parseInt(point.interval.startTime.seconds) * 1000
      ).toISOString();
      
      return {
        timestamp,
        value
      };
    });
  }).flat();
}

/**
 * Scale a GCP instance group to a specific size
 * @param {string} [instanceGroupName=GCP_INSTANCE_GROUP] - Instance group name
 * @param {number} targetSize - Desired number of instances
 * @param {boolean} [dryRun=false] - If true, don't apply changes
 * @returns {Promise<Object>} Result of the scaling operation
 */
async function scaleInstanceGroup(
  instanceGroupName = GCP_INSTANCE_GROUP,
  targetSize,
  dryRun = false
) {
  try {
    if (!compute) {
      await initializeGcpService();
    }
    
    // Get current state
    const instanceGroup = await getInstanceGroupState(instanceGroupName);
    const currentSize = instanceGroup.targetSize;
    
    logger.info(`Scaling instance group ${instanceGroupName} from ${currentSize} to ${targetSize} instances${dryRun ? ' (DRY RUN)' : ''}`);
    
    // If this is a dry run, return simulated result
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        instanceGroup: instanceGroupName,
        previousSize: currentSize,
        targetSize,
        operation: 'simulated'
      };
    }
    
    // Scale the instance group
    const zone = compute.zone(GCP_ZONE);
    const instanceGroupManager = zone.instanceGroupManager(instanceGroupName);
    
    // Execute resize operation
    const [operation] = await instanceGroupManager.resize(targetSize);
    
    // Wait for the operation to complete
    await operation.promise();
    
    return {
      success: true,
      dryRun: false,
      instanceGroup: instanceGroupName,
      previousSize: currentSize,
      targetSize,
      operation: operation.id
    };
  } catch (error) {
    logger.error(`Error scaling instance group: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Save metrics to a file
 * @param {Object} metrics - Metrics data
 * @param {string} outputPath - Directory to save metrics
 * @returns {Promise<string>} Path to saved file
 */
async function saveMetricsToFile(metrics, outputPath) {
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const fileName = `gcp_metrics_${metrics.instanceGroup}_${timestamp}.json`;
    const filePath = path.join(outputPath, fileName);
    
    // Write metrics to file
    await fs.promises.writeFile(
      filePath, 
      JSON.stringify(metrics, null, 2)
    );
    
    logger.info(`Saved GCP metrics to ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error(`Error saving metrics to file: ${error.message}`, { error });
    throw error;
  }
}

module.exports = {
  initializeGcpService,
  getInstanceGroupState,
  collectInstanceGroupMetrics,
  scaleInstanceGroup,
  saveMetricsToFile
}; 