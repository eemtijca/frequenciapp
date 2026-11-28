// Pump da fila de planilhas: somente a cabeça é publicada no BullMQ.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { banco } from "@/infra/banco";
import { PREFIXO_FILA, fecharFilas, filaDePlanilhas } from "@/infra/fila/bullmq";
import { despacharFilaPlanilha } from "@/infra/fila/despacho-planilha";

const dias = [
  new Date("2026-11-28T12:00:00Z"),
  new Date("2026-11-29T12:00:00Z"),
  new Date("2026-11-30T12:00:00Z"),
];
const ids: string[] = [];

function exigirPrefixoDeTeste(): void {
  if (!PREFIXO_FILA.includes("teste")) {
    throw new Error("A limpeza exige um prefixo Redis de teste, por exemplo {frequenciapp-teste}.");
  }
}

beforeAll(async () => {
  exigirPrefixoDeTeste();
  await filaDePlanilhas().obliterate({ force: true });
  for (const [indice, dia] of dias.entries()) {
    const item = await banco().filaPlanilha.create({
      data: {
        tipo: "FREQUENCIA",
        dia,
        ...(indice === 0
          ? { estado: "EM_ANDAMENTO", reservadoAte: new Date(Date.now() + 600_000) }
          : {}),
      },
      select: { id: true },
    });
    ids.push(item.id);
  }
});

afterAll(async () => {
  await banco().filaPlanilha.deleteMany({ where: { id: { in: ids } } });
  if (PREFIXO_FILA.includes("teste")) {
    await filaDePlanilhas()
      .obliterate({ force: true })
      .catch(() => undefined);
  }
  await fecharFilas();
});

describe("pump da fila de planilhas", () => {
  it("agenda um aviso de reserva com jobId de três partes", async () => {
    const resumo = await despacharFilaPlanilha();
    expect(resumo.despachado).toBe(true);
    const jobs = await filaDePlanilhas().getJobs(["waiting", "delayed"]);
    const job = jobs.find((item) => (item.data as { filaId?: string }).filaId === ids[0]);
    expect(job?.id).toMatch(new RegExp(`^planilha:${ids[0]}:r\\d+$`));
    expect(job?.id?.split(":")).toHaveLength(3);
  });

  it("publica somente a cabeça e mantém os demais itens fora do Redis", async () => {
    await banco().filaPlanilha.delete({ where: { id: ids[0] } });
    await filaDePlanilhas().obliterate({ force: true });
    const resumo = await despacharFilaPlanilha();
    expect(resumo.despachado).toBe(true);
    const jobs = await filaDePlanilhas().getJobs(["waiting", "delayed"]);
    const publicados = jobs
      .map((job) => job.data as { filaId?: string })
      .map((dados) => dados.filaId)
      .filter((id): id is string => typeof id === "string" && ids.includes(id));
    expect(publicados).toEqual([ids[1]]);
  });
});
