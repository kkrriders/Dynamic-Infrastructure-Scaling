terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
  
  backend "azurerm" {
    # These values can be configured during initialization
    # resource_group_name  = "tfstate-rg"
    # storage_account_name = "tfstate"
    # container_name       = "tfstate"
    # key                  = "infra-scaling.tfstate"
  }
}

provider "azurerm" {
  features {}
}

# Variables
variable "subscription_id" {
  description = "Azure Subscription ID"
  type        = string
}

variable "resource_group_name" {
  description = "Resource Group Name"
  type        = string
}

variable "location" {
  description = "Azure Region"
  type        = string
  default     = "eastus"
}

variable "vmss_name" {
  description = "Virtual Machine Scale Set Name"
  type        = string
}

variable "vmss_capacity" {
  description = "VMSS Instance Count"
  type        = number
  default     = 2
}

variable "vmss_sku" {
  description = "VMSS VM Size"
  type        = string
  default     = "Standard_DS1_v2"
}

# Read existing VMSS to modify
data "azurerm_virtual_machine_scale_set" "vmss" {
  name                = var.vmss_name
  resource_group_name = var.resource_group_name
}

# Update the capacity of the VMSS
resource "azurerm_virtual_machine_scale_set" "vmss" {
  name                = data.azurerm_virtual_machine_scale_set.vmss.name
  location            = data.azurerm_virtual_machine_scale_set.vmss.location
  resource_group_name = data.azurerm_virtual_machine_scale_set.vmss.resource_group_name
  
  # Preserve most properties of the existing VMSS
  upgrade_policy_mode = data.azurerm_virtual_machine_scale_set.vmss.upgrade_policy[0].mode
  
  # Use the current SKU but update the capacity
  sku {
    name     = data.azurerm_virtual_machine_scale_set.vmss.sku[0].name
    tier     = data.azurerm_virtual_machine_scale_set.vmss.sku[0].tier
    capacity = var.vmss_capacity
  }
  
  # Keep the original OS profile
  os_profile {
    computer_name_prefix = data.azurerm_virtual_machine_scale_set.vmss.os_profile[0].computer_name_prefix
    admin_username       = data.azurerm_virtual_machine_scale_set.vmss.os_profile[0].admin_username
    admin_password       = data.azurerm_virtual_machine_scale_set.vmss.os_profile[0].admin_password
  }
  
  # Lifecycle to ignore changes to other properties
  lifecycle {
    ignore_changes = [
      storage_profile_image_reference,
      storage_profile_os_disk,
      network_profile,
      extension,
      tags
    ]
  }
}

# Output the new capacity
output "vmss_capacity" {
  value = azurerm_virtual_machine_scale_set.vmss.sku[0].capacity
}

# Output the VMSS details
output "vmss_details" {
  value = {
    name           = azurerm_virtual_machine_scale_set.vmss.name
    resource_group = azurerm_virtual_machine_scale_set.vmss.resource_group_name
    location       = azurerm_virtual_machine_scale_set.vmss.location
    capacity       = azurerm_virtual_machine_scale_set.vmss.sku[0].capacity
  }
} 