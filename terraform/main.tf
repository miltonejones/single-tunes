terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket       = "mfe-workspace-terraform-state-123823813021"
    key          = "single-tunes/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region
}

resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

locals {
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ============================================
# S3 bucket (private, served only via CloudFront)
# ============================================

resource "aws_s3_bucket" "site" {
  bucket = "${var.project_name}-${var.environment}-${random_string.suffix.result}"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ============================================
# CloudFront (Origin Access Control -> private S3)
# ============================================

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.project_name}-${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.site.arn
        }
      }
    }]
  })
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = var.price_class

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "site-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "site-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # Angular Router uses client-side paths that don't exist as S3 objects
  # (e.g. /search/results) - fall back to the SPA shell for those.
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.tags
}

# ============================================
# ACM certificate (us-east-1, DNS validated)
# ============================================

resource "aws_acm_certificate" "site" {
  domain_name       = var.domain_name
  validation_method = "DNS"
  tags              = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ============================================
# AI vector search — DynamoDB + Lambda + API Gateway
# ============================================

resource "aws_dynamodb_table" "vectors" {
  name         = "sky-tunes-vectors"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = local.tags
}

resource "aws_iam_role" "ai_lambda" {
  name = "${var.project_name}-ai-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "ai_lambda_basic" {
  role       = aws_iam_role.ai_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_s3_bucket" "vector_cache" {
  bucket = "${var.project_name}-vector-cache-${random_string.suffix.result}"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "vector_cache" {
  bucket                  = aws_s3_bucket.vector_cache.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_role_policy" "ai_lambda_perms" {
  name = "${var.project_name}-ai-lambda-perms"
  role = aws_iam_role.ai_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:BatchWriteItem", "dynamodb:Scan"]
        Resource = aws_dynamodb_table.vectors.arn
      },
      {
        Effect   = "Allow"
        Action   = "bedrock:InvokeModel"
        Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/amazon.titan-embed-text-v2:0"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.vector_cache.arn}/*"
      }
    ]
  })
}

data "archive_file" "ai_ingest" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/ai-ingest/index.mjs"
  output_path = "${path.module}/.lambda-zips/ai-ingest.zip"
}

resource "aws_lambda_function" "ai_ingest" {
  function_name    = "${var.project_name}-ai-ingest"
  role             = aws_iam_role.ai_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.ai_ingest.output_path
  source_code_hash = data.archive_file.ai_ingest.output_base64sha256
  timeout          = 300
  memory_size      = 512

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.vectors.name
    }
  }

  tags = local.tags
}

data "archive_file" "ai_search" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/ai-search/index.mjs"
  output_path = "${path.module}/.lambda-zips/ai-search.zip"
}

resource "aws_lambda_function" "ai_search" {
  function_name    = "${var.project_name}-ai-search"
  role             = aws_iam_role.ai_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.ai_search.output_path
  source_code_hash = data.archive_file.ai_search.output_base64sha256
  timeout          = 30
  memory_size      = 1024

  environment {
    variables = {
      TABLE_NAME   = aws_dynamodb_table.vectors.name
      CACHE_BUCKET = aws_s3_bucket.vector_cache.bucket
    }
  }

  tags = local.tags
}

data "archive_file" "cache_rebuild" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/cache-rebuild/index.mjs"
  output_path = "${path.module}/.lambda-zips/cache-rebuild.zip"
}

resource "aws_lambda_function" "cache_rebuild" {
  function_name    = "${var.project_name}-cache-rebuild"
  role             = aws_iam_role.ai_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.cache_rebuild.output_path
  source_code_hash = data.archive_file.cache_rebuild.output_base64sha256
  timeout          = 120
  memory_size      = 512

  environment {
    variables = {
      TABLE_NAME   = aws_dynamodb_table.vectors.name
      CACHE_BUCKET = aws_s3_bucket.vector_cache.bucket
    }
  }

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "cache_rebuild" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.cache_rebuild.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "cache_rebuild" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /rebuild-cache"
  target    = "integrations/${aws_apigatewayv2_integration.cache_rebuild.id}"
}

resource "aws_lambda_permission" "cache_rebuild" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cache_rebuild.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

resource "aws_apigatewayv2_api" "ai" {
  name          = "${var.project_name}-ai"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 300
  }

  tags = local.tags
}

resource "aws_apigatewayv2_stage" "ai" {
  api_id      = aws_apigatewayv2_api.ai.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags
}

resource "aws_apigatewayv2_integration" "ai_ingest" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ai_ingest.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "ai_ingest" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /ingest"
  target    = "integrations/${aws_apigatewayv2_integration.ai_ingest.id}"
}

resource "aws_lambda_permission" "ai_ingest" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ai_ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "ai_search" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ai_search.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "ai_search" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /search"
  target    = "integrations/${aws_apigatewayv2_integration.ai_search.id}"
}

resource "aws_lambda_permission" "ai_search" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ai_search.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

# ============================================
# Recorder proxy — keeps the recorder API key server-side
# ============================================

data "archive_file" "recorder_proxy" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/recorder-proxy/index.mjs"
  output_path = "${path.module}/.lambda-zips/recorder-proxy.zip"
}

resource "aws_lambda_function" "recorder_proxy" {
  function_name    = "${var.project_name}-recorder-proxy"
  role             = aws_iam_role.ai_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.recorder_proxy.output_path
  source_code_hash = data.archive_file.recorder_proxy.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      RECORDER_API_ENDPOINT = var.recorder_api_endpoint
      RECORDER_API_KEY      = var.recorder_api_key
    }
  }

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "recorder_proxy" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.recorder_proxy.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "recorder_search" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "GET /recorder/search/{term}/{limit}"
  target    = "integrations/${aws_apigatewayv2_integration.recorder_proxy.id}"
}

resource "aws_apigatewayv2_route" "recorder_record" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /recorder/record"
  target    = "integrations/${aws_apigatewayv2_integration.recorder_proxy.id}"
}

resource "aws_apigatewayv2_route" "recorder_status" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "GET /recorder/record/{batchId}"
  target    = "integrations/${aws_apigatewayv2_integration.recorder_proxy.id}"
}

resource "aws_lambda_permission" "recorder_proxy" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.recorder_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

# ============================================
# Shazam proxy — keeps the Shazam Bearer key server-side
# ============================================

data "archive_file" "shazam_proxy" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/shazam-proxy/index.mjs"
  output_path = "${path.module}/.lambda-zips/shazam-proxy.zip"
}

resource "aws_lambda_function" "shazam_proxy" {
  function_name    = "${var.project_name}-shazam-proxy"
  role             = aws_iam_role.ai_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.shazam_proxy.output_path
  source_code_hash = data.archive_file.shazam_proxy.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      SHAZAM_API_ENDPOINT = var.shazam_api_endpoint
      SHAZAM_API_KEY      = var.shazam_api_key
    }
  }

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "shazam_proxy" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.shazam_proxy.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "shazam_recognize" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /shazam/recognize"
  target    = "integrations/${aws_apigatewayv2_integration.shazam_proxy.id}"
}

resource "aws_apigatewayv2_route" "shazam_results" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /shazam/results/{uuid}"
  target    = "integrations/${aws_apigatewayv2_integration.shazam_proxy.id}"
}

resource "aws_lambda_permission" "shazam_proxy" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shazam_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

# ============================================
# GitHub proxy — keeps the GitHub personal access token server-side
# ============================================

data "archive_file" "github_proxy" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/github-proxy/index.mjs"
  output_path = "${path.module}/.lambda-zips/github-proxy.zip"
}

resource "aws_lambda_function" "github_proxy" {
  function_name    = "${var.project_name}-github-proxy"
  role             = aws_iam_role.ai_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.github_proxy.output_path
  source_code_hash = data.archive_file.github_proxy.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      GITHUB_OWNER = var.github_owner
      GITHUB_REPO  = var.github_repo
      GITHUB_TOKEN = var.github_token
    }
  }

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "github_proxy" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.github_proxy.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "github_issues" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /github/issues"
  target    = "integrations/${aws_apigatewayv2_integration.github_proxy.id}"
}

resource "aws_lambda_permission" "github_proxy" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.github_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

# ============================================
# Cross-instance sync — DynamoDB sessions/leases + per-instance SQS queues
# ============================================

data "aws_caller_identity" "current" {}

resource "aws_dynamodb_table" "sync_sessions" {
  name         = "${var.project_name}-sync-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userKey"
  range_key    = "instanceId"

  attribute {
    name = "userKey"
    type = "S"
  }
  attribute {
    name = "instanceId"
    type = "S"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "sync_leases" {
  name         = "${var.project_name}-sync-leases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userKey"

  attribute {
    name = "userKey"
    type = "S"
  }

  tags = local.tags
}

resource "aws_iam_role" "sync_lambda" {
  name = "${var.project_name}-sync-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "sync_lambda_basic" {
  role       = aws_iam_role.sync_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "sync_lambda_perms" {
  name = "${var.project_name}-sync-lambda-perms"
  role = aws_iam_role.sync_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
        ]
        Resource = [
          aws_dynamodb_table.sync_sessions.arn,
          aws_dynamodb_table.sync_leases.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:CreateQueue",
          "sqs:GetQueueUrl",
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:DeleteQueue",
          "sqs:GetQueueAttributes",
          "sqs:SetQueueAttributes",
        ]
        Resource = "arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:sky-tunes-sync-*"
      },
    ]
  })
}

locals {
  sync_env = {
    SYNC_SESSIONS_TABLE = aws_dynamodb_table.sync_sessions.name
    SYNC_LEASES_TABLE   = aws_dynamodb_table.sync_leases.name
  }
}

data "archive_file" "sync_register" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/sync/register/index.mjs"
  output_path = "${path.module}/.lambda-zips/sync-register.zip"
}

resource "aws_lambda_function" "sync_register" {
  function_name    = "${var.project_name}-sync-register"
  role             = aws_iam_role.sync_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.sync_register.output_path
  source_code_hash = data.archive_file.sync_register.output_base64sha256
  timeout          = 10
  memory_size      = 256
  environment {
    variables = local.sync_env
  }
  tags = local.tags
}

data "archive_file" "sync_heartbeat" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/sync/heartbeat/index.mjs"
  output_path = "${path.module}/.lambda-zips/sync-heartbeat.zip"
}

resource "aws_lambda_function" "sync_heartbeat" {
  function_name    = "${var.project_name}-sync-heartbeat"
  role             = aws_iam_role.sync_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.sync_heartbeat.output_path
  source_code_hash = data.archive_file.sync_heartbeat.output_base64sha256
  timeout          = 30
  memory_size      = 256
  environment {
    variables = local.sync_env
  }
  tags = local.tags
}

data "archive_file" "sync_publish" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/sync/publish/index.mjs"
  output_path = "${path.module}/.lambda-zips/sync-publish.zip"
}

resource "aws_lambda_function" "sync_publish" {
  function_name    = "${var.project_name}-sync-publish"
  role             = aws_iam_role.sync_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.sync_publish.output_path
  source_code_hash = data.archive_file.sync_publish.output_base64sha256
  timeout          = 10
  memory_size      = 256
  environment {
    variables = local.sync_env
  }
  tags = local.tags
}

data "archive_file" "sync_poll" {
  type        = "zip"
  source_file = "${path.module}/../lambdas/sync/poll/index.mjs"
  output_path = "${path.module}/.lambda-zips/sync-poll.zip"
}

resource "aws_lambda_function" "sync_poll" {
  function_name    = "${var.project_name}-sync-poll"
  role             = aws_iam_role.sync_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.sync_poll.output_path
  source_code_hash = data.archive_file.sync_poll.output_base64sha256
  timeout          = 30
  memory_size      = 256
  environment {
    variables = local.sync_env
  }
  tags = local.tags
}

resource "aws_apigatewayv2_integration" "sync_register" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sync_register.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "sync_register" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /sync/register"
  target    = "integrations/${aws_apigatewayv2_integration.sync_register.id}"
}

resource "aws_lambda_permission" "sync_register" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync_register.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "sync_heartbeat" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sync_heartbeat.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "sync_heartbeat" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /sync/heartbeat"
  target    = "integrations/${aws_apigatewayv2_integration.sync_heartbeat.id}"
}

resource "aws_lambda_permission" "sync_heartbeat" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync_heartbeat.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "sync_publish" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sync_publish.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "sync_publish" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "POST /sync/publish"
  target    = "integrations/${aws_apigatewayv2_integration.sync_publish.id}"
}

resource "aws_lambda_permission" "sync_publish" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync_publish.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "sync_poll" {
  api_id                 = aws_apigatewayv2_api.ai.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sync_poll.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "sync_poll" {
  api_id    = aws_apigatewayv2_api.ai.id
  route_key = "GET /sync/poll/{userKey}/{instanceId}"
  target    = "integrations/${aws_apigatewayv2_integration.sync_poll.id}"
}

resource "aws_lambda_permission" "sync_poll" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync_poll.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai.execution_arn}/*/*"
}

# ============================================
# DNS record for the site itself
# ============================================

resource "aws_route53_record" "site" {
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
