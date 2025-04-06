// Infrastructure service file
const { DefaultAzureCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP;
const VMSS_NAME = process.env.AZURE_VMSS_NAME;
const TERRAFORM_DIR = process.env.TERRAFORM_DIR || path.join(__dirname, '../../infrastructure/terraform');

// Azure clients
let computeClient;
let logger;

/**
 * Initialize infrastructure clients
 */
async function setupInfrastructureClient() {
  try {
    // Import logger here to avoid circular dependency
    const { logger: appLogger } = require('../index');
    logger = appLogger;
    
    logger.info('Initializing infrastructure clients...');
    
    // Use DefaultAzureCredential for authentication
    const credential = new DefaultAzureCredential();
    
    // Initialize Compute Management client
    computeClient = new ComputeManagementClient(credential, SUBSCRIPTION_ID);
    
    logger.info('Infrastructure clients initialized');
  } catch (error) {
    if (logger) {
      logger.error(`Error initializing infrastructure clients: ${error.message}`, { error });
    } else {
      console.error(`Error initializing infrastructure clients: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get current VMSS capacity
 */
async function getCurrentVMSSCapacity() {
  try {
    logger.info(`Getting current capacity for VMSS: ${VMSS_NAME}`);
    
    const vmss = await computeClient.virtualMachineScaleSets.get(RESOURCE_GROUP, VMSS_NAME);
    
    logger.info(`Current VMSS capacity: ${vmss.sku.capacity}`);
    return vmss.sku.capacity;
  } catch (error) {
    logger.error(`Error getting VMSS capacity: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Scale VMSS directly via Azure SDK
 */
async function scaleVMSS(capacity) {
  try {
    const currentCapacity = await getCurrentVMSSCapacity();
    
    if (currentCapacity === capacity) {
      logger.info(`VMSS is already at target capacity: ${capacity}`);
      return currentCapacity;
    }
    
    logger.info(`Scaling VMSS from ${currentCapacity} to ${capacity} instances`);
    
    // Get the current VMSS
    const vmss = await computeClient.virtualMachineScaleSets.get(RESOURCE_GROUP, VMSS_NAME);
    
    // Update the capacity
    vmss.sku.capacity = capacity;
    
    // Apply the update
    await computeClient.virtualMachineScaleSets.createOrUpdate(
      RESOURCE_GROUP,
      VMSS_NAME,
      vmss
    );
    
    logger.info(`VMSS scaled to ${capacity} instances`);
    return capacity;
  } catch (error) {
    logger.error(`Error scaling VMSS: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Apply infrastructure changes using Terraform
 */
async function applyTerraformChanges(variables = {}) {
  try {
    logger.info('Applying infrastructure changes with Terraform');
    
    // Generate Terraform variables file
    await generateTerraformVars(variables);
    
    // Run Terraform
    return new Promise((resolve, reject) => {
      // Change to Terraform directory
      process.chdir(TERRAFORM_DIR);
      
      // Initialize Terraform
      exec('terraform init', (error, stdout, stderr) => {
        if (error) {
          logger.error(`Terraform init error: ${error.message}`);
          return reject(error);
        }
        
        logger.info('Terraform initialized');
        
        // Apply Terraform
        exec('terraform apply -auto-approve', (error, stdout, stderr) => {
          if (error) {
            logger.error(`Terraform apply error: ${error.message}`);
            return reject(error);
          }
          
          logger.info('Terraform apply completed successfully');
          logger.info(stdout);
          
          resolve({
            success: true,
            output: stdout
          });
        });
      });
    });
  } catch (error) {
    logger.error(`Error applying Terraform changes: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Generate Terraform variables file
 */
async function generateTerraformVars(variables = {}) {
  try {
    // Default variables
    const defaultVars = {
      subscription_id: SUBSCRIPTION_ID,
      resource_group_name: RESOURCE_GROUP,
      vmss_name: VMSS_NAME,
      vmss_capacity: await getCurrentVMSSCapacity()
    };
    
    // Merge with provided variables
    const mergedVars = { ...defaultVars, ...variables };
    
    // Generate tfvars file content
    let content = '';
    for (const [key, value] of Object.entries(mergedVars)) {
      if (typeof value === 'string') {
        content += `${key} = "${value}"\n`;
      } else {
        content += `${key} = ${value}\n`;
      }
    }
    
    // Write to terraform.tfvars file
    const varsFilePath = path.join(TERRAFORM_DIR, 'terraform.tfvars');
    fs.writeFileSync(varsFilePath, content);
    
    logger.info(`Terraform variables file generated at ${varsFilePath}`);
    return varsFilePath;
  } catch (error) {
    logger.error(`Error generating Terraform variables: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Apply scaling recommendation
 */
async function applyScalingRecommendation(recommendation) {
  try {
    logger.info('Applying scaling recommendation', { recommendation });
    
    if (!recommendation.scaling) {
      throw new Error('Invalid recommendation format: missing scaling information');
    }
    
    const { currentInstances, recommendedInstances, scaleOutRecommended, scaleInRecommended } = recommendation.scaling;
    
    // If no scaling needed, do nothing
    if (!scaleOutRecommended && !scaleInRecommended) {
      logger.info('No scaling action required');
      return {
        action: 'none',
        currentInstances,
        recommendedInstances
      };
    }
    
    // Apply scaling
    if (process.env.SCALING_METHOD === 'terraform') {
      // Use Terraform for scaling
      await applyTerraformChanges({
        vmss_capacity: recommendedInstances
      });
    } else {
      // Use Azure SDK directly
      await scaleVMSS(recommendedInstances);
    }
    
    logger.info(`Scaling applied: ${currentInstances} -> ${recommendedInstances} instances`);
    
    return {
      action: scaleOutRecommended ? 'scale_out' : 'scale_in',
      previousInstances: currentInstances,
      newInstances: recommendedInstances
    };
  } catch (error) {
    logger.error(`Error applying scaling recommendation: ${error.message}`, { error });
    throw error;
  }
}

module.exports = {
  setupInfrastructureClient,
  getCurrentVMSSCapacity,
  scaleVMSS,
  applyTerraformChanges,
  applyScalingRecommendation
}; 
