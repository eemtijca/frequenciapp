-- AlterEnum
ALTER TYPE "tipo_frequencia_parcial" ADD VALUE 'JUSTIFICADA';

-- AlterTable
ALTER TABLE "frequencias_parciais" ADD COLUMN     "justificativa" VARCHAR(10);
