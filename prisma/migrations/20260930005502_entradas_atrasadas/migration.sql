-- CreateTable
CREATE TABLE "entradas_atrasadas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aluno_id" UUID NOT NULL,
    "turma_id" UUID NOT NULL,
    "turma_rotulo" VARCHAR(100) NOT NULL,
    "dia" DATE NOT NULL,
    "horario" VARCHAR(5) NOT NULL,
    "motivo" VARCHAR(200) NOT NULL,
    "registrado_por_nome" VARCHAR(100) NOT NULL,
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_atrasadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entradas_atrasadas_dia_turma_id_idx" ON "entradas_atrasadas"("dia", "turma_id");

-- CreateIndex
CREATE UNIQUE INDEX "entradas_atrasadas_aluno_id_dia_key" ON "entradas_atrasadas"("aluno_id", "dia");

-- AddForeignKey
ALTER TABLE "entradas_atrasadas" ADD CONSTRAINT "entradas_atrasadas_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_atrasadas" ADD CONSTRAINT "entradas_atrasadas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_atrasadas" ADD CONSTRAINT "entradas_atrasadas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
