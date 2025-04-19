resource "azurerm_resource_group" "rg" {
  location = var.resource_group_location
  name     = "${random_pet.prefix.id}-rg"
}

# Create virtual network
resource "azurerm_virtual_network" "vnet" {
  name                = "${random_pet.prefix.id}-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
}

# Create subnet
resource "azurerm_subnet" "subnet" {
  name                 = "${random_pet.prefix.id}-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Create public IP
resource "azurerm_public_ip" "public_ip" {
  name                = "${random_pet.prefix.id}-public-ip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Dynamic"
}

# Create Network Security Group and rules
resource "azurerm_network_security_group" "nsg" {
  name                = "${random_pet.prefix.id}-nsg"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  # Allow SSH access
  security_rule {
    name                       = "SSH"
    priority                   = 1000
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  # Allow web access on port 80
  security_rule {
    name                       = "web"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

# Create network interface
resource "azurerm_network_interface" "nic" {
  name                = "${random_pet.prefix.id}-nic"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "nic_configuration"
    subnet_id                     = azurerm_subnet.subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.public_ip.id
  }
}

# Create virtual machine
resource "azurerm_linux_virtual_machine" "vm" {
  name                  = "${var.prefix}-vm"
  admin_username        = "azureuser"
  disable_password_authentication = false
  admin_password        = random_password.password.result
  location              = azurerm_resource_group.rg.location
  resource_group_name   = azurerm_resource_group.rg.name
  network_interface_ids = [azurerm_network_interface.nic.id]
  size                  = "Standard_DS1_v2"

  os_disk {
    name                 = "osDisk"
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }
}


# Install Apache web server
resource "azurerm_virtual_machine_extension" "web_server_install" {
  name                       = "${random_pet.prefix.id}-wsi"
  virtual_machine_id         = azurerm_linux_virtual_machine.vm.id
  publisher                  = "Microsoft.Azure.Extensions"
  type                       = "CustomScript"
  type_handler_version       = "2.0"
  auto_upgrade_minor_version = true

  settings = <<SETTINGS
    {
      "commandToExecute": "sudo apt update && sudo apt install -y apache2 && sudo systemctl start apache2 && sudo systemctl enable apache2"
    }
  SETTINGS
}

# Generate random password for Linux VM
resource "random_password" "password" {
  length      = 20
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
  min_special = 1
  special     = true
}

# Generate random prefix for resource names
resource "random_pet" "prefix" {
  prefix = var.prefix
  length = 1
}

# Create Azure App Configuration
resource "azurerm_app_configuration" "appconfig" {
  name                = "${random_pet.prefix.id}-appconf"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku_name            = "Standard"
}

# Push each setting into App Configuration
locals {
  app_settings = {
    "jwt.secret"               = var.jwt_secret
    "auth-api.port"            = tostring(var.auth_api_port)
    "users-api.port"           = tostring(var.users_api_port)
    "todos-api.port"           = tostring(var.todos_api_port)
    "redis.host"               = var.redis_host
    "redis.port"               = tostring(var.redis_port)
    "redis.channel"            = var.redis_channel
    "zipkin.url"               = var.zipkin_url
  }
}

resource "azurerm_app_configuration_key" "settings" {
  for_each                 = local.app_settings
  configuration_store_id   = azurerm_app_configuration.appconfig.id
  key                      = each.key
  value                    = each.value
  depends_on               = [azurerm_app_configuration.appconfig]
}