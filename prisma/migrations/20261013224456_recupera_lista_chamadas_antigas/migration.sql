-- Recupera participantes omitidos no preenchimento inicial da lista histórica.
-- Só alcança chamadas que não foram alteradas após a criação da lista; faltas,
-- confirmações existentes e chamadas posteriores permanecem preservadas.
DO $$
DECLARE
    limite TIMESTAMPTZ;
BEGIN
    -- Schemas novos ou montados sem histórico de migrações não têm dados legados.
    IF to_regclass(format('%I.%I', current_schema(), '_prisma_migrations')) IS NULL THEN
        RETURN;
    END IF;

    SELECT MIN("started_at") INTO limite
    FROM "_prisma_migrations"
    WHERE "migration_name" = '20260928124039_lista_da_chamada'
      AND "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL;

    IF limite IS NULL THEN
        RETURN;
    END IF;

    WITH recuperados AS (
        INSERT INTO "alunos_chamada" ("frequencia_id", "aluno_id")
        SELECT "f"."id", "a"."id"
        FROM "frequencias" "f"
        JOIN "alunos" "a" ON "a"."turma_original_id" = "f"."turma_id"
        WHERE "f"."atualizado_em" < limite
          AND "a"."ativo"
          -- Cadastro não é matrícula: a importação pode ocorrer depois do dia civil.
          AND "a"."criado_em" <= "f"."atualizado_em"
          AND ("a"."desistente_em" IS NULL OR "a"."desistente_em" > "f"."dia")
          AND EXTRACT(ISODOW FROM "f"."dia") <= 6
          AND NOT EXISTS (SELECT 1 FROM "feriados" "h" WHERE "h"."dia" = "f"."dia")
          -- Uma lista já atribuída a outra turma no mesmo dia não é reinterpretada.
          AND NOT EXISTS (
              SELECT 1 FROM "alunos_chamada" "ac"
              JOIN "frequencias" "outra" ON "outra"."id" = "ac"."frequencia_id"
              WHERE "ac"."aluno_id" = "a"."id"
                AND "outra"."dia" = "f"."dia"
                AND "outra"."id" <> "f"."id"
          )
        ON CONFLICT DO NOTHING
        RETURNING "frequencia_id"
    ), alteradas AS (
        UPDATE "frequencias" "f"
        SET "revisao" = "f"."revisao" + 1,
            "atualizado_em" = CURRENT_TIMESTAMP
        WHERE "f"."id" IN (SELECT "frequencia_id" FROM recuperados)
        RETURNING "f"."id"
    )
    INSERT INTO "auditoria" ("usuario_id", "acao", "alvo")
    SELECT NULL, 'frequencia.recuperar_lista_legada', 'frequencia:' || "id"::text
    FROM alteradas;
END $$;
