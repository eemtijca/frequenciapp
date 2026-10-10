-- CreateTable
CREATE TABLE "feriados" (
    "dia" DATE NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "criado_por_id" UUID,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("dia")
);

-- AddForeignKey
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
