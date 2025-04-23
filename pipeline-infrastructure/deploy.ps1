param (
    [string]$TerraformPath = "C:\Users\Brayan\Documents\Trabajos_U\SEMESTRE_8\ingesoft5\microservice-app-example\terraform",
    [string]$InventoryPath = "C:\Users\Brayan\Documents\Trabajos_U\SEMESTRE_8\ingesoft5\microservice-app-example\ansible\inventory\hosts.ini",
    [string]$AnsiblePath = "/mnt/c/Users/Brayan/Documents/Trabajos_U/SEMESTRE_8/ingesoft5/microservice-app-example/ansible"
)

# Navigate to the Terraform directory
cd $TerraformPath

# Run Terraform commands
terraform init
terraform apply -auto-approve
terraform refresh

# Capture Terraform outputs
$publicIpAddress = terraform output -raw public_ip_address
$adminPassword = terraform output -raw admin_password

# Ensure the password is wrapped in quotes
$quotedAdminPassword = "`"$adminPassword`""

# Create the Ansible inventory file
$inventoryContent = @"
[azure_vm]
$publicIpAddress ansible_user=azureuser ansible_ssh_pass=$quotedAdminPassword
"@
Set-Content -Path $InventoryPath -Value $inventoryContent

# Run the Ansible playbook in WSL
wsl bash -c "cd $AnsiblePath && \
    export ANSIBLE_ROLES_PATH=./roles && \
    export ANSIBLE_HOST_KEY_CHECKING=False && \
    ansible-playbook -i inventory/hosts.ini playbooks/install_docker.yml"