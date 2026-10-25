-- AlterTable
ALTER TABLE "saidas_antecipadas" ADD COLUMN     "assinatura_seduc" VARCHAR(64),
ADD COLUMN     "registrado_seduc_em" TIMESTAMPTZ,
ADD COLUMN     "registrado_seduc_por_nome" VARCHAR(200),
ADD COLUMN     "revisao_seduc" INTEGER NOT NULL DEFAULT 0;
