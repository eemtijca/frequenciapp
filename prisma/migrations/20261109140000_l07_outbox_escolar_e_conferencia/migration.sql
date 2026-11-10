-- AlterTable
ALTER TABLE "fila_planilha" ADD COLUMN     "detalhes" JSONB,
ADD COLUMN     "requer_conferencia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvido_em" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "intencoes_envio_escolar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "tipo_envio_fila" NOT NULL,
    "dia" DATE NOT NULL,
    "turma_id" UUID,
    "autor_id" UUID,
    "evento_id" UUID NOT NULL,
    "revisao_evento" INTEGER NOT NULL,
    "sequencia" BIGSERIAL NOT NULL,
    "politica" VARCHAR(40) NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "despachado_em" TIMESTAMPTZ,

    CONSTRAINT "intencoes_envio_escolar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intencoes_envio_escolar_sequencia_key" ON "intencoes_envio_escolar"("sequencia");

-- CreateIndex
CREATE INDEX "intencoes_envio_escolar_despachado_em_sequencia_idx" ON "intencoes_envio_escolar"("despachado_em", "sequencia");

-- CreateIndex
CREATE UNIQUE INDEX "intencoes_envio_escolar_tipo_evento_id_revisao_evento_key" ON "intencoes_envio_escolar"("tipo", "evento_id", "revisao_evento");
