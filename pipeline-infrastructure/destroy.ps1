param (
    [string]$TerraformPath = "C:\Users\Brayan\Documents\Trabajos_U\SEMESTRE_8\ingesoft5\microservice-app-example\terraform"
)

# Navigate to the Terraform directory
cd $TerraformPath

# Run Terraform commands
terraform destroy -auto-approve
