param (
    [string]$TerraformPath = "C:\Cositas\taller1\microservice-app-example\terraform"
)

# Navigate to the Terraform directory
cd $TerraformPath

# Run Terraform commands
terraform destroy -auto-approve
