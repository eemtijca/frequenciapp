-- CreateTable
CREATE TABLE "indices_chamada" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planilha_id" VARCHAR(200) NOT NULL,
    "documento_id" VARCHAR(200),
    "assinatura" VARCHAR(64),
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "indices_chamada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indices_chamada_planilha_id_key" ON "indices_chamada"("planilha_id");
