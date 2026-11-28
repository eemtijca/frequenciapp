-- CreateEnum
CREATE TYPE "estado_trabalho" AS ENUM ('PENDENTE', 'DISPONIVEL', 'EM_EXECUCAO', 'AGUARDANDO', 'CONCLUIDO', 'FALHOU', 'CONFERENCIA', 'CANCELADO');

-- CreateTable
CREATE TABLE "trabalhos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" VARCHAR(60) NOT NULL,
    "chave_idempotencia" VARCHAR(64) NOT NULL,
    "estado" "estado_trabalho" NOT NULL DEFAULT 'PENDENTE',
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "max_tentativas" INTEGER NOT NULL DEFAULT 5,
    "disponivel_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservado_ate" TIMESTAMPTZ,
    "reservado_por" VARCHAR(100),
    "reserva_id" UUID,
    "resultado" VARCHAR(60),
    "detalhes" JSONB,
    "erro_codigo" VARCHAR(60),
    "erro_resumo" VARCHAR(300),
    "origem" VARCHAR(20) NOT NULL DEFAULT 'sistema',
    "autor_id" UUID,
    "despachado_em" TIMESTAMPTZ,
    "tentativas_despacho" INTEGER NOT NULL DEFAULT 0,
    "proximo_despacho_em" TIMESTAMPTZ,
    "erro_despacho" VARCHAR(300),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "concluido_em" TIMESTAMPTZ,

    CONSTRAINT "trabalhos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabalho_eventos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trabalho_id" UUID NOT NULL,
    "de_estado" "estado_trabalho",
    "para_estado" "estado_trabalho" NOT NULL,
    "tentativa" INTEGER NOT NULL DEFAULT 0,
    "resultado" VARCHAR(60),
    "detalhe" JSONB,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trabalho_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trabalhos_estado_disponivel_em_prioridade_criado_em_idx" ON "trabalhos"("estado", "disponivel_em", "prioridade", "criado_em");

-- CreateIndex
CREATE INDEX "trabalhos_tipo_estado_idx" ON "trabalhos"("tipo", "estado");

-- CreateIndex
CREATE INDEX "trabalhos_estado_reservado_ate_idx" ON "trabalhos"("estado", "reservado_ate");

-- CreateIndex
CREATE UNIQUE INDEX "trabalhos_abertos_uk" ON "trabalhos"("tipo", "chave_idempotencia") WHERE "estado" IN ('PENDENTE', 'DISPONIVEL', 'EM_EXECUCAO', 'AGUARDANDO', 'CONFERENCIA');

-- CreateIndex
CREATE INDEX "trabalho_eventos_trabalho_id_criado_em_idx" ON "trabalho_eventos"("trabalho_id", "criado_em");

-- AddForeignKey
ALTER TABLE "trabalho_eventos" ADD CONSTRAINT "trabalho_eventos_trabalho_id_fkey" FOREIGN KEY ("trabalho_id") REFERENCES "trabalhos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "fila_planilha" ADD COLUMN "reservado_por" VARCHAR(100);

-- CreateIndex
CREATE INDEX "fila_planilha_estado_reservado_ate_idx" ON "fila_planilha"("estado", "reservado_ate");
