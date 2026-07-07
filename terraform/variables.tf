variable "aws_region" {
  description = "AWS region for all resources (us-east-1 required for CloudFront-attached ACM certs)"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name used to prefix/tag resources"
  type        = string
  default     = "single-tunes"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "domain_name" {
  description = "Fully-qualified domain the site is served on"
  type        = string
  default     = "music.skytunes.nl"
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID that owns domain_name (skytunes.nl)"
  type        = string
  default     = "Z097648039KDLRAPDPQZN"
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

variable "recorder_api_endpoint" {
  description = "Base URL of the recorder cloud API the proxy forwards to"
  type        = string
  default     = "https://2dojoa8lz3.execute-api.us-east-1.amazonaws.com"
}

variable "recorder_api_key" {
  description = "x-api-key for the recorder API. Injected into the proxy Lambda's env; never committed. Pass via -var or a gitignored *.tfvars."
  type        = string
  sensitive   = true
}

variable "shazam_api_endpoint" {
  description = "Base URL of the Shazam recognition API the proxy forwards to"
  type        = string
  default     = "https://shazam-api.com/api"
}

variable "shazam_api_key" {
  description = "Bearer key for the Shazam API. Injected into the proxy Lambda's env; never committed. Pass via -var or a gitignored *.tfvars."
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub owner of the repo the github-proxy Lambda files issues against"
  type        = string
  default     = "miltonejones"
}

variable "github_repo" {
  description = "GitHub repo the github-proxy Lambda files issues against"
  type        = string
  default     = "single-tunes"
}

variable "github_token" {
  description = "GitHub personal access token (issues:write) for the github-proxy Lambda. Injected into the proxy Lambda's env; never committed. Pass via -var or a gitignored *.tfvars."
  type        = string
  sensitive   = true
}
