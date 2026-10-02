-- CreateEnum
CREATE TYPE "tipo_frequencia_parcial" AS ENUM ('TURNO', 'AULAS');

-- CreateEnum
CREATE TYPE "turno_parcial" AS ENUM ('MANHA', 'TARDE');

-- AlterEnum
ALTER TYPE "finalidade_integracao" ADD VALUE 'PARCIAL';

-- CreateTable
CREATE TABLE "frequencias_parciais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aluno_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "turma_id" UUID NOT NULL,
    "aluno_nome" VARCHAR(200) NOT NULL,
    "turma_nome" VARCHAR(200) NOT NULL,
    "tipo" "tipo_frequencia_parcial" NOT NULL,
    "turno" "turno_parcial",
    "aulas" INTEGER[],
    "observacao" VARCHAR(300),
    "registrado_seduc" BOOLEAN NOT NULL DEFAULT false,
    "registrado_seduc_em" TIMESTAMPTZ,
    "registrado_seduc_por_id" UUID,
    "registrado_seduc_por_nome" VARCHAR(200),
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "criado_por_id" UUID,
    "atualizado_por_id" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "frequencias_parciais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "frequencias_parciais_turma_id_dia_idx" ON "frequencias_parciais"("turma_id", "dia");

-- CreateIndex
CREATE INDEX "frequencias_parciais_dia_registrado_seduc_idx" ON "frequencias_parciais"("dia", "registrado_seduc");

-- CreateIndex
CREATE UNIQUE INDEX "frequencias_parciais_aluno_id_dia_key" ON "frequencias_parciais"("aluno_id", "dia");

-- AddForeignKey
ALTER TABLE "frequencias_parciais" ADD CONSTRAINT "frequencias_parciais_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias_parciais" ADD CONSTRAINT "frequencias_parciais_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias_parciais" ADD CONSTRAINT "frequencias_parciais_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias_parciais" ADD CONSTRAINT "frequencias_parciais_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias_parciais" ADD CONSTRAINT "frequencias_parciais_registrado_seduc_por_id_fkey" FOREIGN KEY ("registrado_seduc_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
