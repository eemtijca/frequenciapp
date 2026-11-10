-- CreateEnum
CREATE TYPE "tipo_confirmacao_historica" AS ENUM ('CHAMADA_RETROATIVA');

-- CreateTable
CREATE TABLE "confirmacoes_historicas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "frequencia_id" UUID NOT NULL,
    "tipo" "tipo_confirmacao_historica" NOT NULL DEFAULT 'CHAMADA_RETROATIVA',
    "dia" DATE NOT NULL,
    "turma_id" UUID NOT NULL,
    "autor_id" UUID,
    "autor_nome" VARCHAR(100) NOT NULL,
    "motivo" VARCHAR(200) NOT NULL,
    "alunos_snapshot" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmacoes_historicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "confirmacoes_historicas_frequencia_id_tipo_key" ON "confirmacoes_historicas"("frequencia_id", "tipo");

-- CreateIndex
CREATE INDEX "confirmacoes_historicas_dia_turma_id_idx" ON "confirmacoes_historicas"("dia", "turma_id");

-- AddForeignKey
ALTER TABLE "confirmacoes_historicas" ADD CONSTRAINT "confirmacoes_historicas_frequencia_id_fkey" FOREIGN KEY ("frequencia_id") REFERENCES "frequencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmacoes_historicas" ADD CONSTRAINT "confirmacoes_historicas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmacoes_historicas" ADD CONSTRAINT "confirmacoes_historicas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
