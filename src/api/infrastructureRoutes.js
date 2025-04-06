const express = require('express');
const { 
  getCurrentVMSSCapacity, 
  scaleVMSS, 
  applyTerraformChanges 
} = require('../services/infrastructureService');

const router = express.Router();

/**
 * @route GET /api/infrastructure/vmss
 * @description Get current VMSS information
 */
router.get('/vmss', async (req, res) => {
  try {
    const capacity = await getCurrentVMSSCapacity();
    
    return res.json({
      name: process.env.AZURE_VMSS_NAME,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP,
      capacity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error getting VMSS information: ${error.message}`, error);
    return res.status(500).json({
      error: 'Failed to get VMSS information',
      message: error.message
    });
  }
});

/**
 * @route POST /api/infrastructure/vmss/scale
 * @description Scale VMSS to a specific capacity
 */
router.post('/vmss/scale', async (req, res) => {
  try {
    const { capacity } = req.body;
    
    if (!capacity || typeof capacity !== 'number' || capacity < 1) {
      return res.status(400).json({
        error: 'Invalid capacity. Must be a positive number.'
      });
    }
    
    const currentCapacity = await getCurrentVMSSCapacity();
    const newCapacity = await scaleVMSS(capacity);
    
    return res.json({
      success: true,
      name: process.env.AZURE_VMSS_NAME,
      resourceGroup: process.env.AZURE_RESOURCE_GROUP,
      previousCapacity: currentCapacity,
      newCapacity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error scaling VMSS: ${error.message}`, error);
    return res.status(500).json({
      error: 'Failed to scale VMSS',
      message: error.message
    });
  }
});

/**
 * @route POST /api/infrastructure/terraform/apply
 * @description Apply Terraform changes
 */
router.post('/terraform/apply', async (req, res) => {
  try {
    const { variables } = req.body;
    
    const result = await applyTerraformChanges(variables || {});
    
    return res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error applying Terraform changes: ${error.message}`, error);
    return res.status(500).json({
      error: 'Failed to apply Terraform changes',
      message: error.message
    });
  }
});

/**
 * @route GET /api/infrastructure/status
 * @description Get infrastructure status
 */
router.get('/status', async (req, res) => {
  try {
    // Get VMSS capacity
    const vmssCapacity = await getCurrentVMSSCapacity();
    
    // Additional infrastructure status checks could be added here
    
    return res.json({
      status: 'healthy',
      vmss: {
        name: process.env.AZURE_VMSS_NAME,
        resourceGroup: process.env.AZURE_RESOURCE_GROUP,
        capacity: vmssCapacity
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error getting infrastructure status: ${error.message}`, error);
    return res.status(500).json({
      error: 'Failed to get infrastructure status',
      message: error.message,
      status: 'unhealthy'
    });
  }
});

module.exports = router; 