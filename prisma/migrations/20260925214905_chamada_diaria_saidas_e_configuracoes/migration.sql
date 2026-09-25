-- AlterTable
ALTER TABLE "faltas" ADD COLUMN     "justificativa" VARCHAR(10),
ADD COLUMN     "observacao" VARCHAR(200);

-- CreateTable
CREATE TABLE "saidas_antecipadas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aluno_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "momento" VARCHAR(20) NOT NULL,
    "justificativa" VARCHAR(10) NOT NULL,
    "observacao" VARCHAR(200),
    "liberado_por_id" UUID,
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saidas_antecipadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "frequencia_por_aula" BOOLEAN NOT NULL DEFAULT false,
    "saida_antecipada" BOOLEAN NOT NULL DEFAULT true,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "atualizado_por_id" UUID,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saidas_antecipadas_dia_idx" ON "saidas_antecipadas"("dia");

-- CreateIndex
CREATE INDEX "saidas_antecipadas_aluno_id_dia_idx" ON "saidas_antecipadas"("aluno_id", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "saidas_antecipadas_aluno_id_dia_key" ON "saidas_antecipadas"("aluno_id", "dia");

-- AddForeignKey
ALTER TABLE "saidas_antecipadas" ADD CONSTRAINT "saidas_antecipadas_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saidas_antecipadas" ADD CONSTRAINT "saidas_antecipadas_liberado_por_id_fkey" FOREIGN KEY ("liberado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saidas_antecipadas" ADD CONSTRAINT "saidas_antecipadas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
