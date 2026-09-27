-- AlterEnum
ALTER TYPE "papel" ADD VALUE 'DIRETOR_TURMA';

-- CreateTable
CREATE TABLE "vinculos_diretor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "turma_id" UUID NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculos_diretor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credenciais_diretor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "emitida_em" TIMESTAMPTZ NOT NULL,
    "expira_em" TIMESTAMPTZ NOT NULL,
    "primeiro_uso_em" TIMESTAMPTZ,
    "revogada_em" TIMESTAMPTZ,
    "motivo_revogacao" VARCHAR(200),
    "troca_obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "credenciais_diretor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tentativas_entrada" (
    "chave" VARCHAR(300) NOT NULL,
    "contagem" INTEGER NOT NULL,
    "janela_inicio" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tentativas_entrada_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "parametros_acesso" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "validade_palavra_dias" INTEGER NOT NULL DEFAULT 90,
    "sessao_diretor_horas" INTEGER NOT NULL DEFAULT 12,
    "tentativas_por_origem" INTEGER NOT NULL DEFAULT 10,
    "tentativas_por_login" INTEGER NOT NULL DEFAULT 30,
    "janela_minutos" INTEGER NOT NULL DEFAULT 15,
    "categorias_diretor" TEXT[] DEFAULT ARRAY['faltas']::TEXT[],
    "limite_risco_percentual" INTEGER NOT NULL DEFAULT 25,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "atualizado_por_id" UUID,

    CONSTRAINT "parametros_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vinculos_diretor_usuario_id_idx" ON "vinculos_diretor"("usuario_id");

-- CreateIndex
CREATE INDEX "vinculos_diretor_turma_id_idx" ON "vinculos_diretor"("turma_id");

-- CreateIndex
CREATE UNIQUE INDEX "credenciais_diretor_usuario_id_key" ON "credenciais_diretor"("usuario_id");

-- CreateIndex
CREATE INDEX "tentativas_entrada_janela_inicio_idx" ON "tentativas_entrada"("janela_inicio");

-- AddForeignKey
ALTER TABLE "vinculos_diretor" ADD CONSTRAINT "vinculos_diretor_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_diretor" ADD CONSTRAINT "vinculos_diretor_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_diretor" ADD CONSTRAINT "vinculos_diretor_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciais_diretor" ADD CONSTRAINT "credenciais_diretor_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametros_acesso" ADD CONSTRAINT "parametros_acesso_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Um vínculo vigente por diretor e turma; o encerrado fica no histórico.
CREATE UNIQUE INDEX "vinculos_diretor_vigente_unico" ON "vinculos_diretor" ("usuario_id", "turma_id") WHERE "fim" IS NULL;

ALTER TABLE "vinculos_diretor" ADD CONSTRAINT "vinculos_diretor_periodo_valido" CHECK ("fim" IS NULL OR "fim" >= "inicio");

ALTER TABLE "credenciais_diretor" ADD CONSTRAINT "credenciais_diretor_validade_valida" CHECK ("expira_em" > "emitida_em");

ALTER TABLE "tentativas_entrada" ADD CONSTRAINT "tentativas_entrada_contagem_positiva" CHECK ("contagem" > 0);

-- Faixas dos parâmetros de acesso. As categorias são um subconjunto fechado e
-- sempre incluem as faltas, que são o objeto da visão do diretor.
ALTER TABLE "parametros_acesso" ADD CONSTRAINT "parametros_acesso_faixas" CHECK (
  "id" = 'principal'
  AND "validade_palavra_dias" BETWEEN 1 AND 365
  AND "sessao_diretor_horas" BETWEEN 1 AND 72
  AND "tentativas_por_origem" BETWEEN 1 AND 100
  AND "tentativas_por_login" BETWEEN 1 AND 500
  AND "janela_minutos" BETWEEN 1 AND 1440
  AND "limite_risco_percentual" BETWEEN 1 AND 100
  AND "categorias_diretor" IS NOT NULL
  AND 'faltas' = ANY ("categorias_diretor")
  AND "categorias_diretor" <@ ARRAY['faltas', 'justificativas', 'saidas']::TEXT[]
);

-- Linha única com os padrões; a administração ajusta na Gestão.
INSERT INTO "parametros_acesso" ("id", "atualizado_em") VALUES ('principal', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
