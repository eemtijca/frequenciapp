-- CreateEnum
CREATE TYPE "papel" AS ENUM ('ADMIN', 'COORDENACAO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "papel" "papel" NOT NULL DEFAULT 'COORDENACAO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turmas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serie_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turmas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alunos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "turma_id" UUID NOT NULL,
    "turma_original_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alunos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "turma_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "inicio" VARCHAR(5) NOT NULL,
    "fim" VARCHAR(5) NOT NULL,
    "dias_semana" INTEGER[] NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frequencias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "turma_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "criado_por_id" UUID,
    "atualizado_por_id" UUID,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "frequencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faltas" (
    "frequencia_id" UUID NOT NULL,
    "aluno_id" UUID NOT NULL,
    "horario_id" UUID NOT NULL,

    CONSTRAINT "faltas_pkey" PRIMARY KEY ("frequencia_id","aluno_id","horario_id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "alvo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usuarios_papel_idx" ON "usuarios"("papel");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_token_hash_key" ON "sessoes"("token_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes"("expira_em");

-- CreateIndex
CREATE INDEX "series_ordem_idx" ON "series"("ordem");

-- CreateIndex
CREATE UNIQUE INDEX "turmas_serie_id_nome_key" ON "turmas"("serie_id", "nome");

-- CreateIndex
CREATE INDEX "alunos_turma_id_ordem_idx" ON "alunos"("turma_id", "ordem");

-- CreateIndex
CREATE INDEX "alunos_turma_original_id_idx" ON "alunos"("turma_original_id");

-- CreateIndex
CREATE UNIQUE INDEX "horarios_turma_id_ordem_key" ON "horarios"("turma_id", "ordem");

-- CreateIndex
CREATE INDEX "horarios_turma_id_idx" ON "horarios"("turma_id");

-- CreateIndex
CREATE INDEX "frequencias_dia_idx" ON "frequencias"("dia");

-- CreateIndex
CREATE UNIQUE INDEX "frequencias_turma_id_dia_key" ON "frequencias"("turma_id", "dia");

-- CreateIndex
CREATE INDEX "faltas_aluno_id_idx" ON "faltas"("aluno_id");

-- CreateIndex
CREATE INDEX "faltas_horario_id_idx" ON "faltas"("horario_id");

-- CreateIndex
CREATE INDEX "auditoria_criado_em_idx" ON "auditoria"("criado_em");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_turma_original_id_fkey" FOREIGN KEY ("turma_original_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faltas" ADD CONSTRAINT "faltas_frequencia_id_fkey" FOREIGN KEY ("frequencia_id") REFERENCES "frequencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faltas" ADD CONSTRAINT "faltas_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faltas" ADD CONSTRAINT "faltas_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Objetos mantidos apenas aqui (o schema do Prisma não os representa).
-- E-mail e nomes únicos sem depender de caixa (E-mail e e-mail são o mesmo acesso).
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" (lower("email"));
CREATE UNIQUE INDEX "series_nome_unico" ON "series" (lower("nome"));
CREATE UNIQUE INDEX "turmas_serie_nome_unico" ON "turmas" ("serie_id", lower("nome"));

-- Integridade numérica e de horário no banco, independente da aplicação.
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_revisao_positiva" CHECK ("revisao" >= 1);
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_ordem_positiva" CHECK ("ordem" >= 1);
ALTER TABLE "series" ADD CONSTRAINT "series_ordem_positiva" CHECK ("ordem" >= 1);
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_ordem_positiva" CHECK ("ordem" >= 1);
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_formato_hora" CHECK (
  "inicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "fim" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_intervalo_valido" CHECK ("inicio" < "fim");
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_dias_semana_validos" CHECK (
  cardinality("dias_semana") >= 1
  AND "dias_semana" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::integer[]
);
