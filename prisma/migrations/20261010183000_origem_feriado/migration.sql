-- CreateEnum
CREATE TYPE "origem_feriado" AS ENUM ('MANUAL', 'API');

-- AlterTable
ALTER TABLE "feriados" ADD COLUMN "origem" "origem_feriado" NOT NULL DEFAULT 'MANUAL';
