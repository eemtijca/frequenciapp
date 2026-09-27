-- AlterTable
ALTER TABLE "saidas_antecipadas" ALTER COLUMN "justificativa" DROP NOT NULL,
ADD COLUMN "liberado_por_codigo" VARCHAR(20);

-- CreateTable
CREATE TABLE "liberadores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(20) NOT NULL,
    "rotulo" VARCHAR(60) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liberadores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "liberadores_codigo_unico" ON "liberadores" (lower("codigo"));

-- O catálogo de quem libera nasce vazio: a administração cadastra os nomes
-- na Gestão, sem dado de pessoa no código nem na migração.

-- O motivo da saída vive na linha, com código de justificativa ou texto livre.
ALTER TABLE "saidas_antecipadas" ADD CONSTRAINT "saidas_antecipadas_motivo_presente" CHECK (
  (justificativa IS NOT NULL AND length(btrim(justificativa)) > 0)
  OR (texto IS NOT NULL AND length(btrim(texto)) > 0)
);
