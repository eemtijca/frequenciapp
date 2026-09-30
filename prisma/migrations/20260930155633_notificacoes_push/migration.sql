-- CreateTable
CREATE TABLE "assinaturas_push" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "sessao_id" UUID,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(87) NOT NULL,
    "auth" VARCHAR(22) NOT NULL,
    "chave_vapid" VARCHAR(87) NOT NULL,
    "testado_em" TIMESTAMPTZ,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assinaturas_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_push" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assinatura_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "reservada_em" TIMESTAMPTZ,
    "enviada_em" TIMESTAMPTZ,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entregas_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_push_endpoint_key" ON "assinaturas_push"("endpoint");

-- CreateIndex
CREATE INDEX "assinaturas_push_usuario_id_idx" ON "assinaturas_push"("usuario_id");

-- CreateIndex
CREATE INDEX "assinaturas_push_sessao_id_idx" ON "assinaturas_push"("sessao_id");

-- CreateIndex
CREATE INDEX "entregas_push_dia_idx" ON "entregas_push"("dia");

-- CreateIndex
CREATE UNIQUE INDEX "entregas_push_assinatura_id_dia_key" ON "entregas_push"("assinatura_id", "dia");

-- AddForeignKey
ALTER TABLE "assinaturas_push" ADD CONSTRAINT "assinaturas_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_push" ADD CONSTRAINT "assinaturas_push_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_push" ADD CONSTRAINT "entregas_push_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas_push"("id") ON DELETE CASCADE ON UPDATE CASCADE;
