-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "origem_na_chamada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "configuracoes_origem_series" (
    "configuracao_id" TEXT NOT NULL,
    "serie_id" UUID NOT NULL,

    CONSTRAINT "configuracoes_origem_series_pkey" PRIMARY KEY ("configuracao_id","serie_id")
);

-- CreateTable
CREATE TABLE "configuracoes_origem_turmas" (
    "configuracao_id" TEXT NOT NULL,
    "turma_id" UUID NOT NULL,

    CONSTRAINT "configuracoes_origem_turmas_pkey" PRIMARY KEY ("configuracao_id","turma_id")
);

-- CreateIndex
CREATE INDEX "configuracoes_origem_series_serie_id_idx" ON "configuracoes_origem_series"("serie_id");

-- CreateIndex
CREATE INDEX "configuracoes_origem_turmas_turma_id_idx" ON "configuracoes_origem_turmas"("turma_id");

-- AddForeignKey
ALTER TABLE "configuracoes_origem_series" ADD CONSTRAINT "configuracoes_origem_series_configuracao_id_fkey" FOREIGN KEY ("configuracao_id") REFERENCES "configuracoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_origem_series" ADD CONSTRAINT "configuracoes_origem_series_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_origem_turmas" ADD CONSTRAINT "configuracoes_origem_turmas_configuracao_id_fkey" FOREIGN KEY ("configuracao_id") REFERENCES "configuracoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_origem_turmas" ADD CONSTRAINT "configuracoes_origem_turmas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compatibilidade com a escola existente. Em uma instalação vazia, nenhuma
-- série é selecionada e o padrão desligado permanece, inclusive após o seed.
INSERT INTO "configuracoes_origem_series" ("configuracao_id", "serie_id")
SELECT c."id", s."id"
FROM "configuracoes" c
CROSS JOIN "series" s
WHERE c."id" = 'principal'
  AND btrim(s."nome") ~* '^3([ºª°]|[oa])?([[:space:]]|$)';

UPDATE "configuracoes" c
SET "origem_na_chamada" = true, "atualizado_em" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "configuracoes_origem_series" o
  WHERE o."configuracao_id" = c."id"
);
