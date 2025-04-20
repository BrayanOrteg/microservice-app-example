# Output the name of the resource group
output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}

# Output the public IP address of the virtual machine
output "public_ip_address" {
  value = azurerm_public_ip.public_ip.ip_address
  depends_on = [
    azurerm_linux_virtual_machine.vm,
    azurerm_network_interface.nic
  ]
}

# Output the admin password for the virtual machine
output "admin_password" {
  sensitive = true
  value     = random_password.password.result
}