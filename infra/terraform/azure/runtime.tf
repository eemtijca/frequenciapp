# Contrato de papéis provisionados fora do runtime. Não aplica grants em banco real.
variable "url_runtime" {
  description = "Conexão do papel de DML, sem ownership nem membership administrativo."
  type        = string
  sensitive   = true
  default     = null
}
variable "url_migracao" {
  description = "Conexão do owner restrito ao schema, somente no job de migração."
  type        = string
  sensitive   = true
  default     = null
}
variable "schema_aplicacao" {
  description = "Schema exclusivo da aplicação, previamente provisionado."
  type        = string
  default     = "frequenciapp"
  validation {
    condition     = can(regex("^[a-z_][a-z0-9_]{0,62}$", var.schema_aplicacao))
    error_message = "O schema precisa ser um identificador PostgreSQL simples."
  }
}
variable "runtime_provisionado" {
  description = "Aceite explícito após ensaio de privilégios efetivos e provisionamento."
  type        = bool
  default     = false
}
variable "revisao_aplicacao" {
  description = "SHA completo da revisão usada pela imagem e pelo migrador."
  type        = string
  default     = ""
}
variable "migracao_confirmada_sha" {
  description = "Recibo operacional do job concluído; não é preenchido automaticamente pelo Terraform."
  type        = string
  default     = ""
}
locals {
  # Em produção, papéis, URLs distintas e revisão são pré-requisitos explícitos.
  # O modo local é sintético e apenas comprova a ligação entre os recursos.
  runtime_configurado = var.modo_local ? (
    local.url_runtime_efetiva != null && local.url_migracao_efetiva != null
    ) : (
    var.runtime_provisionado && var.url_runtime != null && var.url_migracao != null && var.url_runtime != var.url_migracao && local.schema_aplicacao_efetiva != "public" && can(regex("^[0-9a-f]{40}$", var.revisao_aplicacao))
  )
  migracao_confirmada = var.modo_local ? local.runtime_configurado : (
    local.runtime_configurado && var.migracao_confirmada_sha == var.revisao_aplicacao
  )
}
