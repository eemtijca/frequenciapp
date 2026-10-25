-- Limites percentuais configuráveis do card de Infrequência do Painel.
ALTER TABLE "configuracoes"
  ADD COLUMN "infrequencia_atencao_percentual" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "infrequencia_critica_percentual" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "configuracoes"
  ADD CONSTRAINT "configuracoes_infrequencia_percentuais_check"
  CHECK (
    "infrequencia_atencao_percentual" >= 0
    AND "infrequencia_atencao_percentual" <= 100
    AND "infrequencia_critica_percentual" >= 0
    AND "infrequencia_critica_percentual" <= 100
    AND "infrequencia_atencao_percentual" < "infrequencia_critica_percentual"
  );
