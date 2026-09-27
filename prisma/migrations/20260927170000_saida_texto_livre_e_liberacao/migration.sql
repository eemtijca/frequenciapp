-- AlterTable
ALTER TABLE "saidas_antecipadas" ALTER COLUMN "justificativa" DROP NOT NULL,
ADD COLUMN "liberado_por_codigo" VARCHAR(20);

-- CreateConstraint
ALTER TABLE "saidas_antecipadas" ADD CONSTRAINT "saidas_antecipadas_motivo_presente" CHECK (
  (justificativa IS NOT NULL AND length(btrim(justificativa)) > 0)
  OR (texto IS NOT NULL AND length(btrim(texto)) > 0)
);

ALTER TABLE "saidas_antecipadas" ADD CONSTRAINT "saidas_antecipadas_liberado_por_codigo_valido" CHECK (
  liberado_por_codigo IS NULL
  OR liberado_por_codigo IN ('adriano', 'adriana', 'helena')
);
