-- CreateEnum
CREATE TYPE "tipo_envio_fila" AS ENUM ('FREQUENCIA', 'SAIDAS', 'ENTRADAS');

-- CreateEnum
CREATE TYPE "estado_fila" AS ENUM ('AGUARDANDO', 'EM_ANDAMENTO', 'CONCLUIDO', 'FALHOU', 'DESCARTADO');

-- CreateTable
CREATE TABLE "fila_planilha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequencia" BIGSERIAL NOT NULL,
    "tipo" "tipo_envio_fila" NOT NULL,
    "estado" "estado_fila" NOT NULL DEFAULT 'AGUARDANDO',
    "turma_id" UUID,
    "dia" DATE NOT NULL,
    "autor_id" UUID,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proxima_tentativa_em" TIMESTAMPTZ,
    "reservado_ate" TIMESTAMPTZ,
    "resultado" VARCHAR(40),
    "erro" VARCHAR(300),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "concluido_em" TIMESTAMPTZ,

    CONSTRAINT "fila_planilha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fila_planilha_sequencia_key" ON "fila_planilha"("sequencia");

-- CreateIndex
CREATE INDEX "fila_planilha_estado_sequencia_idx" ON "fila_planilha"("estado", "sequencia");

-- CreateIndex
CREATE INDEX "fila_planilha_criado_em_idx" ON "fila_planilha"("criado_em");

-- AddForeignKey
ALTER TABLE "fila_planilha" ADD CONSTRAINT "fila_planilha_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
