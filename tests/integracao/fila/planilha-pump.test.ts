// Pump da fila de planilhas: somente a cabeça é publicada no BullMQ.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { banco } from "@/infra/banco";
import { fecharFilas, filaDePlanilhas } from "@/infra/fila/bullmq";
import { despacharFilaPlanilha } from "@/infra/fila/despacho-planilha";

const dias = [new Date("2026-11-28T12:00:00Z"), new Date("2026-11-29T12:00:00Z")];
const ids: string[] = [];

beforeAll(async () => {
  await filaDePlanilhas().obliterate({ force: true });
  for (const dia of dias) {
    const item = await banco().filaPlanilha.create({
      data: { tipo: "FREQUENCIA", dia },
      select: { id: true },
    });
    ids.push(item.id);
  }
});

afterAll(async () => {
  await banco().filaPlanilha.deleteMany({ where: { id: { in: ids } } });
  await filaDePlanilhas()
    .obliterate({ force: true })
    .catch(() => undefined);
  await fecharFilas();
});

describe("pump da fila de planilhas", () => {
  it("publica somente a cabeça e mantém o segundo item fora do Redis", async () => {
    const resumo = await despacharFilaPlanilha();
    expect(resumo).toBeNull();
    const jobs = await filaDePlanilhas().getJobs(["waiting", "delayed"]);
    const publicados = jobs
      .map((job) => job.data as { filaId?: string })
      .map((dados) => dados.filaId)
      .filter((id): id is string => typeof id === "string" && ids.includes(id));
    expect(publicados).toEqual([ids[0]]);
  });
});
