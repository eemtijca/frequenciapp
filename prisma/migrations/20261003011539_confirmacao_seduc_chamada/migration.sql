-- AlterTable
ALTER TABLE "alunos_chamada" ADD COLUMN     "registrado_seduc" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registrado_seduc_em" TIMESTAMPTZ,
ADD COLUMN     "registrado_seduc_por_id" UUID,
ADD COLUMN     "registrado_seduc_por_nome" VARCHAR(200),
ADD COLUMN     "revisao_seduc" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "alunos_chamada" ADD CONSTRAINT "alunos_chamada_registrado_seduc_por_id_fkey" FOREIGN KEY ("registrado_seduc_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
