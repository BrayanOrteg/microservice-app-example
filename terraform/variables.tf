variable "resource_group_location" {
  default     = "eastus"
  description = "Location of the resource group."
}

variable "prefix" {
  type        = string
  default     = "win-vm-iis"
  description = "Prefix of the resource name"
}

variable "resource_group_location" { default     = "eastus" }
variable "prefix"                { type = string; default = "win-vm-iis" }

// Application settings

variable "jwt_secret" {
  type        = string
  default     = "PRFT"
  description = "JWT signing secret"
}

variable "auth_api_port" {
  type        = number
  default     = 8000
  description = "Port for auth‑api"
}

variable "users_api_port" {
  type        = number
  default     = 8083
  description = "Port for users‑api"
}

variable "todos_api_port" {
  type        = number
  default     = 8082
  description = "Port for todos‑api"
}

variable "redis_host" {
  type        = string
  default     = "redis"
}

variable "redis_port" {
  type        = number
  default     = 6379
}

variable "redis_channel" {
  type        = string
  default     = "log_channel"
}

variable "zipkin_url" {
  type        = string
  default     = "http://zipkin:9411/api/v2/spans"
}