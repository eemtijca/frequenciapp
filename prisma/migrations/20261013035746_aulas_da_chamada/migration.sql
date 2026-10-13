-- CreateTable
CREATE TABLE "aulas_chamada" (
    "frequencia_id" UUID NOT NULL,
    "horario_id" UUID NOT NULL,

    CONSTRAINT "aulas_chamada_pkey" PRIMARY KEY ("frequencia_id","horario_id")
);

-- CreateIndex
CREATE INDEX "aulas_chamada_horario_id_idx" ON "aulas_chamada"("horario_id");

-- AddForeignKey
ALTER TABLE "aulas_chamada" ADD CONSTRAINT "aulas_chamada_frequencia_id_fkey" FOREIGN KEY ("frequencia_id") REFERENCES "frequencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas_chamada" ADD CONSTRAINT "aulas_chamada_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: retrato aproximado das chamadas existentes. Entram as aulas com
-- falta registrada (preserva aula removida da grade depois) e a grade vigente
-- no momento da chamada: aulas ativas do dia da semana criadas até o registro,
-- com a mesma regra do sábado letivo do aplicativo. Aulas criadas depois não
-- entram, para uma grade maior não reclassificar o histórico.
WITH retratos AS (
    SELECT f.id AS frequencia_id, h.id AS horario_id
    FROM "frequencias" f
    JOIN "horarios" h ON h.turma_id = f.turma_id
    WHERE EXISTS (
        SELECT 1 FROM "faltas" fa
        WHERE fa.frequencia_id = f.id AND fa.horario_id = h.id
    )
    OR (
        h.ativo
        AND h.criado_em <= f.criado_em
        AND (
            EXTRACT(ISODOW FROM f.dia) = ANY(h.dias_semana)
            OR (
                EXTRACT(ISODOW FROM f.dia) = 6
                AND NOT EXISTS (
                    SELECT 1 FROM "horarios" h2
                    WHERE h2.turma_id = f.turma_id
                      AND h2.ativo
                      AND h2.criado_em <= f.criado_em
                      AND 6 = ANY(h2.dias_semana)
                )
            )
        )
    )
)
INSERT INTO "aulas_chamada" ("frequencia_id", "horario_id")
SELECT frequencia_id, horario_id FROM retratos
ON CONFLICT DO NOTHING;
