const { Construct } = require('constructs');
const { App, TerraformStack, TerraformOutput } = require('cdktf');
const { AzurermProvider, VirtualMachineScaleSet } = require('@cdktf/provider-azurerm');

class DynamicScalingStack extends TerraformStack {
  constructor(scope, id, config) {
    super(scope, id);

    // Extract configuration
    const { 
      subscriptionId, 
      resourceGroupName, 
      location = 'eastus', 
      vmssName, 
      vmssCapacity = 2 
    } = config;

    // Define Azure provider
    new AzurermProvider(this, 'azure', {
      features: {},
      subscriptionId,
    });

    // Define VMSS with dynamic capacity
    const vmss = new VirtualMachineScaleSet(this, 'vmss', {
      name: vmssName,
      resourceGroupName: resourceGroupName,
      location: location,
      sku: {
        name: 'Standard_DS1_v2',
        tier: 'Standard',
        capacity: vmssCapacity,
      },
      
      // Use existing VMSS (this is a simplified version for illustration)
      // In a real implementation, you would need to fetch the existing VMSS details
      // and apply them here
      
      // For demonstration purposes, we're assuming the VMSS already exists
      // and we're just updating the capacity
      
      lifecycle: {
        ignoreChanges: [
          'storageProfileImageReference',
          'storageProfileOsDisk',
          'networkProfile',
          'extension',
          'tags'
        ]
      }
    });

    // Output the new capacity
    new TerraformOutput(this, 'vmssCapacity', {
      value: vmssCapacity,
    });

    // Output the VMSS details
    new TerraformOutput(this, 'vmssDetails', {
      value: {
        name: vmssName,
        resourceGroup: resourceGroupName,
        location: location,
        capacity: vmssCapacity,
      },
    });
  }
}

// Initialize the application
const app = new App();

// Read configuration from environment variables or process arguments
const config = {
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
  resourceGroupName: process.env.AZURE_RESOURCE_GROUP,
  location: process.env.AZURE_LOCATION || 'eastus',
  vmssName: process.env.AZURE_VMSS_NAME,
  vmssCapacity: parseInt(process.env.VMSS_CAPACITY || '2'),
};

// Create the stack
new DynamicScalingStack(app, 'dynamic-scaling', config);

// Synthesize the Terraform configuration
app.synth(); 