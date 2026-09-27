-- CreateEnum
CREATE TYPE "finalidade_integracao" AS ENUM ('FREQUENCIA', 'SAIDAS');

-- AlterTable
ALTER TABLE "integracoes_planilha" ADD COLUMN     "finalidade" "finalidade_integracao" NOT NULL DEFAULT 'FREQUENCIA';

-- AlterTable
ALTER TABLE "sincronizacoes_planilha" ADD COLUMN     "finalidade" "finalidade_integracao" NOT NULL DEFAULT 'FREQUENCIA';

-- CreateIndex
CREATE INDEX "sincronizacoes_planilha_finalidade_criado_em_idx" ON "sincronizacoes_planilha"("finalidade", "criado_em");
