-- CreateTable
CREATE TABLE "chaves_bi" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rotulo" VARCHAR(80) NOT NULL,
    "segredo_hash" VARCHAR(64) NOT NULL,
    "escopo" JSONB NOT NULL DEFAULT '{}',
    "criada_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ,
    "revogada_em" TIMESTAMPTZ,
    "primeiro_uso_em" TIMESTAMPTZ,
    "ultimo_uso_em" TIMESTAMPTZ,
    "usos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chaves_bi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chaves_bi_segredo_hash_key" ON "chaves_bi"("segredo_hash");

-- CreateIndex
CREATE INDEX "chaves_bi_revogada_em_expira_em_idx" ON "chaves_bi"("revogada_em", "expira_em");
