-- CreateTable
CREATE TABLE "alunos_chamada" (
    "frequencia_id" UUID NOT NULL,
    "aluno_id" UUID NOT NULL,

    CONSTRAINT "alunos_chamada_pkey" PRIMARY KEY ("frequencia_id","aluno_id")
);

-- CreateIndex
CREATE INDEX "alunos_chamada_aluno_id_idx" ON "alunos_chamada"("aluno_id");

-- AddForeignKey
ALTER TABLE "alunos_chamada" ADD CONSTRAINT "alunos_chamada_frequencia_id_fkey" FOREIGN KEY ("frequencia_id") REFERENCES "frequencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alunos_chamada" ADD CONSTRAINT "alunos_chamada_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preenchimento das chamadas já salvas: quem tem falta naquela chamada e os
-- alunos ativos que hoje estão na turma da chamada e já existiam no dia.
INSERT INTO "alunos_chamada" ("frequencia_id", "aluno_id")
SELECT "f"."id", "a"."id"
  FROM "frequencias" "f"
  JOIN "alunos" "a" ON "a"."turma_id" = "f"."turma_id"
 WHERE "a"."ativo" AND ("a"."criado_em" AT TIME ZONE 'UTC')::date <= "f"."dia"
UNION
SELECT DISTINCT "fa"."frequencia_id", "fa"."aluno_id"
  FROM "faltas" "fa"
ON CONFLICT DO NOTHING;
