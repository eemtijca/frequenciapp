-- CreateEnum
CREATE TYPE "modo_planilha" AS ENUM ('CONSERVADOR', 'COMPLETO');

-- CreateEnum
CREATE TYPE "modalidade_sincronizacao" AS ENUM ('CONSERVADOR', 'COMPLETO');

-- CreateEnum
CREATE TYPE "resultado_sincronizacao" AS ENUM ('SUCESSO', 'PARCIAL', 'FALHA');

-- CreateTable
CREATE TABLE "integracoes_planilha" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "endpoint" VARCHAR(500),
    "token" VARCHAR(120),
    "versao_script" VARCHAR(20),
    "esquema" JSONB,
    "assinatura_esquema" VARCHAR(64),
    "esquema_em" TIMESTAMPTZ,
    "modo" "modo_planilha" NOT NULL DEFAULT 'CONSERVADOR',
    "modo_completo_ate" TIMESTAMPTZ,
    "modo_completo_por_id" UUID,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "atualizado_por_id" UUID,

    CONSTRAINT "integracoes_planilha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sincronizacoes_planilha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "turma_original_id" UUID,
    "de" DATE NOT NULL,
    "ate" DATE NOT NULL,
    "modalidade" "modalidade_sincronizacao" NOT NULL,
    "preenchidas" INTEGER NOT NULL DEFAULT 0,
    "substituidas" INTEGER NOT NULL DEFAULT 0,
    "limpas" INTEGER NOT NULL DEFAULT 0,
    "removidas_linhas" INTEGER NOT NULL DEFAULT 0,
    "removidas_colunas" INTEGER NOT NULL DEFAULT 0,
    "alunos_criados" INTEGER NOT NULL DEFAULT 0,
    "colunas_criadas" INTEGER NOT NULL DEFAULT 0,
    "puladas_ocupadas" INTEGER NOT NULL DEFAULT 0,
    "puladas_formula" INTEGER NOT NULL DEFAULT 0,
    "plano_hash" VARCHAR(64) NOT NULL,
    "resultado" "resultado_sincronizacao" NOT NULL,
    "erro" VARCHAR(300),
    "autor_id" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sincronizacoes_planilha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sincronizacoes_planilha_turma_original_id_criado_em_idx" ON "sincronizacoes_planilha"("turma_original_id", "criado_em");

-- CreateIndex
CREATE INDEX "sincronizacoes_planilha_criado_em_idx" ON "sincronizacoes_planilha"("criado_em");

-- AddForeignKey
ALTER TABLE "integracoes_planilha" ADD CONSTRAINT "integracoes_planilha_modo_completo_por_id_fkey" FOREIGN KEY ("modo_completo_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracoes_planilha" ADD CONSTRAINT "integracoes_planilha_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sincronizacoes_planilha" ADD CONSTRAINT "sincronizacoes_planilha_turma_original_id_fkey" FOREIGN KEY ("turma_original_id") REFERENCES "turmas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sincronizacoes_planilha" ADD CONSTRAINT "sincronizacoes_planilha_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
