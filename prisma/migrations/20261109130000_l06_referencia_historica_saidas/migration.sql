-- AlterTable
ALTER TABLE "saidas_antecipadas" ADD COLUMN     "aulas_referencia" JSONB,
ADD COLUMN     "origem_referencia" VARCHAR(40) NOT NULL DEFAULT 'DESCONHECIDA',
ADD COLUMN     "turma_historica_id" UUID,
ADD COLUMN     "turma_historica_nome" VARCHAR(200);
