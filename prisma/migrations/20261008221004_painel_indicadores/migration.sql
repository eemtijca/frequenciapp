-- CreateTable
CREATE TABLE "paineis_indicadores" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "geracao" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "ano" INTEGER,
    "google_planilha_id" VARCHAR(200),
    "criacao_iniciada_em" TIMESTAMPTZ,
    "url_relatorio" VARCHAR(500),
    "ultimo_envio_em" TIMESTAMPTZ,
    "linhas" INTEGER NOT NULL DEFAULT 0,
    "erro" VARCHAR(300),
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "atualizado_por_id" UUID,

    CONSTRAINT "paineis_indicadores_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "paineis_indicadores" ADD CONSTRAINT "paineis_indicadores_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
