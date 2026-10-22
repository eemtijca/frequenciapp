-- CreateTable
CREATE TABLE "ordens_almoco" (
    "dia_semana" INTEGER NOT NULL,
    "turma_id" UUID NOT NULL,
    "posicao" INTEGER NOT NULL,
    "inicio" VARCHAR(5),
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ordens_almoco_pkey" PRIMARY KEY ("dia_semana","turma_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordens_almoco_dia_semana_posicao_key" ON "ordens_almoco"("dia_semana", "posicao");

-- AddForeignKey
ALTER TABLE "ordens_almoco" ADD CONSTRAINT "ordens_almoco_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dia da semana de segunda (1) a sábado (6), posição a partir de 1 e horário em HH:MM.
ALTER TABLE "ordens_almoco" ADD CONSTRAINT "ordens_almoco_dia_valido" CHECK ("dia_semana" BETWEEN 1 AND 6);
ALTER TABLE "ordens_almoco" ADD CONSTRAINT "ordens_almoco_posicao_valida" CHECK ("posicao" >= 1);
ALTER TABLE "ordens_almoco" ADD CONSTRAINT "ordens_almoco_inicio_valido" CHECK (
  "inicio" IS NULL OR "inicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);
