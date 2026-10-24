-- AlterTable
ALTER TABLE "chaves_bi" ADD COLUMN "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "chaves_bi" ALTER COLUMN "atualizado_em" DROP DEFAULT;

-- AlterTable
ALTER TABLE "justificativas" ADD COLUMN "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "justificativas" ALTER COLUMN "atualizado_em" DROP DEFAULT;

-- AlterTable
ALTER TABLE "liberadores" ADD COLUMN "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "liberadores" ALTER COLUMN "atualizado_em" DROP DEFAULT;
