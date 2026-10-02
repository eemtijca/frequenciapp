-- DisconnectLegacySheets
-- Preserve Google authorization but require a new file selection for legacy rows.
UPDATE "integracoes_planilha"
SET "ativa" = false,
    "envio_automatico" = false,
    "google_planilha_id" = NULL,
    "google_planilha_nome" = NULL,
    "esquema" = NULL,
    "assinatura_esquema" = NULL,
    "esquema_em" = NULL,
    "modo" = 'CONSERVADOR',
    "modo_completo_ate" = NULL,
    "modo_completo_por_id" = NULL,
    "atualizado_em" = CURRENT_TIMESTAMP
WHERE "provedor" <> 'GOOGLE';

-- AlterTable
ALTER TABLE "integracoes_planilha" DROP COLUMN "endpoint",
DROP COLUMN "provedor",
DROP COLUMN "token",
DROP COLUMN "versao_script";
