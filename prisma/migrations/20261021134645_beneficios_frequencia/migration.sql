-- CreateTable
CREATE TABLE "beneficios_frequencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(60) NOT NULL,
    "percentual_minimo_frequencia" INTEGER NOT NULL,
    "faltas_justificadas_contam" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "beneficios_frequencia_pkey" PRIMARY KEY ("id")
);

-- O nome é único sem diferenciar caixa e o percentual fica entre 1 e 100.
CREATE UNIQUE INDEX "beneficios_frequencia_nome_unico" ON "beneficios_frequencia" (lower("nome"));

ALTER TABLE "beneficios_frequencia" ADD CONSTRAINT "beneficios_frequencia_percentual_valido" CHECK (
  "percentual_minimo_frequencia" BETWEEN 1 AND 100
);

-- Regra inicial do incentivo-frequência do Pé-de-Meia: 80% das horas letivas
-- do mês, sem contar faltas justificadas. Dado de configuração: a administração
-- edita, desativa ou remove na Gestão.
INSERT INTO "beneficios_frequencia" ("nome", "percentual_minimo_frequencia", "faltas_justificadas_contam", "atualizado_em")
VALUES ('Pé-de-Meia', 80, false, CURRENT_TIMESTAMP);
