-- CreateEnum
CREATE TYPE "tipo_notificacao" AS ENUM ('RESUMO_DIARIO', 'NOVA_CHAMADA', 'CHAMADAS_PENDENTES');

-- DropIndex
DROP INDEX "entregas_push_assinatura_id_dia_key";

-- AlterTable
ALTER TABLE "entregas_push" ADD COLUMN     "referencia" VARCHAR(36) NOT NULL DEFAULT '',
ADD COLUMN     "tipo" "tipo_notificacao" NOT NULL DEFAULT 'RESUMO_DIARIO';

-- AlterTable
ALTER TABLE "frequencias" ADD COLUMN     "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "preferencias_notificacoes" (
    "usuario_id" UUID NOT NULL,
    "resumo_diario" BOOLEAN NOT NULL DEFAULT true,
    "novas_chamadas" BOOLEAN NOT NULL DEFAULT false,
    "chamadas_pendentes" BOOLEAN NOT NULL DEFAULT true,
    "novas_chamadas_desde" TIMESTAMPTZ,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "preferencias_notificacoes_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "configuracoes_notificacoes" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "resumo_diario" BOOLEAN NOT NULL DEFAULT true,
    "novas_chamadas" BOOLEAN NOT NULL DEFAULT true,
    "chamadas_pendentes" BOOLEAN NOT NULL DEFAULT false,
    "horario_resumo" VARCHAR(5) NOT NULL DEFAULT '17:00',
    "horario_pendencias" VARCHAR(5) NOT NULL DEFAULT '17:00',
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "atualizado_por_id" UUID,

    CONSTRAINT "configuracoes_notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entregas_push_assinatura_id_dia_tipo_referencia_key" ON "entregas_push"("assinatura_id", "dia", "tipo", "referencia");

-- AddForeignKey
ALTER TABLE "preferencias_notificacoes" ADD CONSTRAINT "preferencias_notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_notificacoes" ADD CONSTRAINT "configuracoes_notificacoes_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
