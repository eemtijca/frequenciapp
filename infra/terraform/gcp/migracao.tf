# Cloud Run Job manual com segredo e identidade próprios, sem credencial no serviço principal.
resource "google_service_account" "migracao" {
  account_id   = substr("${local.nome_base}-migrar", 0, 30)
  display_name = "Migrações do ${var.nome_aplicacao}"
  project      = local.projeto
}
resource "google_secret_manager_secret_iam_member" "migracao" {
  count     = var.modo_local ? 0 : 1
  project   = local.projeto
  secret_id = google_secret_manager_secret.direct_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migracao.email}"
}
resource "google_artifact_registry_repository_iam_member" "migracao" {
  count      = var.modo_local ? 0 : 1
  project    = local.projeto
  location   = var.regiao
  repository = google_artifact_registry_repository.api[0].name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.migracao.email}"
}
resource "google_cloud_run_v2_job" "migracao" {
  count = var.modo_local ? 0 : 1

  name                = "${local.nome_base}-migrar"
  project             = local.projeto
  location            = var.regiao
  deletion_protection = var.modo_local ? false : true
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.migracao.email
      max_retries     = 0
      timeout         = "900s"
      dynamic "vpc_access" {
        for_each = local.rede_privada ? [1] : []
        content {
          egress = "PRIVATE_RANGES_ONLY"
          network_interfaces {
            network    = google_compute_network.principal[0].id
            subnetwork = google_compute_subnetwork.app[0].id
          }
        }
      }
      containers {
        image   = var.imagem_aplicacao
        command = ["node"]
        args    = ["docker/app/migrar.mjs"]
        env {
          name  = "DIRECT_URL"
          value = var.modo_local ? local.url_migracao_efetiva : null
          dynamic "value_source" {
            for_each = var.modo_local ? [] : [1]
            content {
              secret_key_ref {
                secret  = google_secret_manager_secret.direct_url.id
                version = "latest"
              }
            }
          }
        }
        env {
          name  = "DATABASE_SCHEMA"
          value = local.schema_aplicacao_efetiva
        }
        env {
          name  = "COMMIT_SHA"
          value = var.revisao_aplicacao
        }
      }
    }
  }
  lifecycle {
    precondition {
      condition     = local.runtime_configurado && (var.modo_local || local.rede_privada)
      error_message = "Provisionar papéis e rede privada antes do job; sua criação não atesta execução."
    }
  }
  depends_on = [google_secret_manager_secret_version.direct_url, google_secret_manager_secret_iam_member.migracao, google_artifact_registry_repository_iam_member.migracao]
}
