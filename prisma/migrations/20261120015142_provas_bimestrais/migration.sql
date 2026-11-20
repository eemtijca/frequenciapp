-- CreateTable
CREATE TABLE "provas_bimestrais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "turma_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "inicio" VARCHAR(5) NOT NULL,
    "fim" VARCHAR(5) NOT NULL,
    "disciplina" VARCHAR(80) NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provas_bimestrais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provas_bimestrais_dia_idx" ON "provas_bimestrais"("dia");

-- CreateIndex
CREATE INDEX "provas_bimestrais_turma_id_dia_idx" ON "provas_bimestrais"("turma_id", "dia");

-- AddForeignKey
ALTER TABLE "provas_bimestrais" ADD CONSTRAINT "provas_bimestrais_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
