-- Autorização Google e planilha escolhida para a frequência.
ALTER TABLE "integracoes_planilha"
  ADD COLUMN "provedor" VARCHAR(10) NOT NULL DEFAULT 'GAS',
  ADD COLUMN "google_refresh_token" TEXT,
  ADD COLUMN "google_planilha_id" VARCHAR(200),
  ADD COLUMN "google_planilha_nome" VARCHAR(200);
