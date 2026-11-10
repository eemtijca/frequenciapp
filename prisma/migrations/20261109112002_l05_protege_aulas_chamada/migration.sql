-- DropForeignKey
ALTER TABLE "aulas_chamada" DROP CONSTRAINT "aulas_chamada_horario_id_fkey";

-- AddForeignKey
ALTER TABLE "aulas_chamada" ADD CONSTRAINT "aulas_chamada_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
