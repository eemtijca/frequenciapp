-- AlterTable
ALTER TABLE "entradas_atrasadas" ADD COLUMN     "momento" VARCHAR(20),
ADD COLUMN     "responsavel_registro_codigo" VARCHAR(20),
ADD COLUMN     "responsavel_registro_nome" VARCHAR(100);
