# Entradas do módulo GCP. Os padrões são seguros para produção; o arquivo
# terraform.tfvars.local.example reduz custo e usa o emulador floci-gcp.

variable "modo_local" {
  description = "Quando verdadeiro, usa o emulador floci-gcp e recursos mínimos de teste."
  type        = bool
  default     = false
}

variable "endpoint_local" {
  description = "Endereço do emulador floci-gcp no modo local."
  type        = string
  default     = "http://localhost:4588"
}

variable "projeto" {
  description = "Identificador do projeto GCP; obrigatório fora do modo local."
  type        = string
  default     = null
}

variable "regiao" {
  description = "Região GCP dos recursos."
  type        = string
  default     = "us-central1"
}

variable "ambiente" {
  description = "Nome curto do ambiente, usado no nome dos recursos."
  type        = string
  default     = "prod"
}

variable "nome_aplicacao" {
  description = "Nome da aplicação, usado no nome dos recursos."
  type        = string
  default     = "frequenciapp"
}

variable "imagem_aplicacao" {
  description = "Imagem da API no formato repositorio:tag."
  type        = string
}

variable "habilitar_rede_privada" {
  description = "Cria VPC, sub-rede e Private Service Access do Cloud SQL em produção."
  type        = bool
  default     = true
}

variable "faixa_rede" {
  description = "Faixa CIDR da VPC de produção."
  type        = string
  default     = "10.62.0.0/16"
}

variable "versao_postgres" {
  description = "Versão principal do PostgreSQL."
  type        = string
  default     = "17"
}

variable "tamanho_instancia_banco" {
  description = "Tier do Cloud SQL, como db-custom-1-3840 ou db-f1-micro."
  type        = string
  default     = "db-custom-1-3840"
}

variable "tamanho_disco_banco_gb" {
  description = "Tamanho do disco do Cloud SQL em GB."
  type        = number
  default     = 10
}

variable "disponibilidade_banco" {
  description = "Disponibilidade do Cloud SQL: ZONAL ou REGIONAL."
  type        = string
  default     = "REGIONAL"
}

variable "protecao_exclusao_banco" {
  description = "Impede a exclusão acidental do Cloud SQL."
  type        = bool
  default     = true
}

variable "retencao_backup_dias" {
  description = "Quantidade de backups automáticos retidos no Cloud SQL."
  type        = number
  default     = 7
}

variable "habilitar_pitr" {
  description = "Liga a recuperação point-in-time do Cloud SQL em produção."
  type        = bool
  default     = true
}

variable "cpu_servico" {
  description = "CPU do contêiner do Cloud Run."
  type        = string
  default     = "1"
}

variable "memoria_servico" {
  description = "Memória do contêiner do Cloud Run."
  type        = string
  default     = "512Mi"
}

variable "min_instancias" {
  description = "Réplicas mínimas do Cloud Run em produção."
  type        = number
  default     = 0
}

variable "max_instancias" {
  description = "Réplicas máximas do Cloud Run em produção."
  type        = number
  default     = 4
}

variable "habilitar_alarmes" {
  description = "Cria o alerta de erros 5xx do Cloud Run em produção."
  type        = bool
  default     = true
}

variable "emails_alarme" {
  description = "Endereços que recebem os alertas."
  type        = list(string)
  default     = []
}

variable "senha_banco_local" {
  description = "Senha de desenvolvimento do administrador do PostgreSQL no modo local."
  type        = string
  default     = "frequencia_dev_local"
  sensitive   = true
}

variable "auth_secret_local" {
  description = "Segredo de sessão de desenvolvimento usado somente no modo local."
  type        = string
  default     = "dev-auth-secret-local-com-mais-de-32-caracteres"
  sensitive   = true
}

variable "cron_secret_local" {
  description = "Segredo do agendador usado somente no modo local."
  type        = string
  default     = "dev-cron-secret-local-com-mais-de-32-caracteres"
  sensitive   = true
}

variable "url_banco_local" {
  description = "Sobrescreve a URL do banco no modo local quando o DNS do emulador não resolve."
  type        = string
  default     = null
}

variable "versao_segredos" {
  description = "Incrementa para rotacionar as senhas geradas em produção."
  type        = number
  default     = 1
}

variable "tz_app" {
  description = "Fuso horário usado pela aplicação."
  type        = string
  default     = "America/Fortaleza"
}

check "projeto_obrigatorio" {
  assert {
    condition     = var.modo_local || var.projeto != null
    error_message = "Fora do modo local, informe o projeto GCP."
  }
}
