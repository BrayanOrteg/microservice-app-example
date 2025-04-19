# Output the name of the resource group
output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}

# Output the public IP address of the virtual machine
output "public_ip_address" {
  value = azurerm_public_ip.public_ip.ip_address
}

# Output the admin password for the virtual machine
output "admin_password" {
  sensitive = true
  value     = random_password.password.result
}

output "appconfig_connection_string" {
  description = "Connection string for Azure App Configuration"
  value       = azurerm_app_configuration.appconfig.primary_connection_string
  sensitive   = true
}