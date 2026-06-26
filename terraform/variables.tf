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
