// Diagnostica um extrato autorizado em JSON; não abre banco nem modifica dados de origem.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { diagnosticarListasHistoricas } from "../../src/domain/listas-historicas.ts";
const id = z.string().uuid();
const esquema = z.object({
  chamadas: z.array(
    z.object({
      id,
      dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      turmaId: id,
      alunos: z.array(id),
      faltas: z.array(id),
    }),
  ),
  alunos: z.array(
    z.object({ id, turmaId: id, turmaOriginalId: id, criadoEm: z.iso.datetime({ offset: true }) }),
  ),
});
if (process.argv.length !== 3)
  throw new Error("Informe somente o arquivo JSON do extrato autorizado.");
const dados = esquema.parse(JSON.parse(readFileSync(process.argv[2], "utf8")));
console.log(
  JSON.stringify(
    {
      versao: 1,
      somenteLeitura: true,
      registros: diagnosticarListasHistoricas(dados.chamadas, dados.alunos),
    },
    null,
    2,
  ),
);
