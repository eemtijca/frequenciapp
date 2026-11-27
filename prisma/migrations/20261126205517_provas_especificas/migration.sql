-- CreateTable
CREATE TABLE "provas_especificas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(120) NOT NULL,
    "local" VARCHAR(120),
    "dia" DATE NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provas_especificas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participantes_prova" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prova_id" UUID NOT NULL,
    "aluno_id" UUID NOT NULL,
    "presente" BOOLEAN,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "participantes_prova_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provas_especificas_dia_idx" ON "provas_especificas"("dia");

-- CreateIndex
CREATE INDEX "participantes_prova_aluno_id_idx" ON "participantes_prova"("aluno_id");

-- CreateIndex
CREATE UNIQUE INDEX "participantes_prova_prova_id_aluno_id_key" ON "participantes_prova"("prova_id", "aluno_id");

-- AddForeignKey
ALTER TABLE "participantes_prova" ADD CONSTRAINT "participantes_prova_prova_id_fkey" FOREIGN KEY ("prova_id") REFERENCES "provas_especificas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participantes_prova" ADD CONSTRAINT "participantes_prova_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
