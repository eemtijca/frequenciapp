# Saídas usadas pelos scripts de implantação.

output "url_aplicacao" {
  description = "URL pública da aplicação."
  value       = local.url_aplicacao
}

output "url_servico_cloud_run" {
  description = "URL gerada pelo Cloud Run para o serviço."
  value       = google_cloud_run_v2_service.api.uri
}

output "endpoint_banco" {
  description = "Endereço do PostgreSQL gerenciado."
  value       = local.endpoint_banco
  sensitive   = true
}

output "repositorio_imagem" {
  description = "Endereço do Artifact Registry; vazio no modo local."
  value       = var.modo_local ? "" : "${var.regiao}-docker.pkg.dev/${local.projeto}/${local.nome_base}"
}

output "servico_cloud_run" {
  description = "Nome do serviço Cloud Run."
  value       = google_cloud_run_v2_service.api.name
}

output "conta_servico" {
  description = "Email da service account da API."
  value       = google_service_account.api.email
}

output "segredo_database_url" {
  description = "Identificador do segredo com a URL do banco."
  value       = google_secret_manager_secret.database_url.id
}
