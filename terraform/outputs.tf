output "bucket_name" {
  value = aws_s3_bucket.site.id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.site.domain_name
}

output "site_url" {
  value = "https://${var.domain_name}"
}

output "ai_api_endpoint" {
  value       = aws_apigatewayv2_stage.ai.invoke_url
  description = "Base URL for AI search/indexing APIs — paste into AI_SEARCH_ENDPOINT in api-config.ts and as AI_INGEST_ENDPOINT in the ingestion/backfill scripts"
}
