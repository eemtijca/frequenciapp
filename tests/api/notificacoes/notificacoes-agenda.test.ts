// Agenda contra PostgreSQL real, com transporte simulado: horários,
// preferências, origem histórica e concorrência sem enviar push externo.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { banco } from "@/infra/banco";
import * as moduloBanco from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { enviarAvisosDaAgenda, contarChamadasPendentes } from "@/application/notificacoes-agenda";
import { atualizarPreferenciasNotificacoes } from "@/application/notificacoes-configuracao";
import { diaLocal, diaDaSemanaIso } from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock("@/infra/web-push", () => ({
  pushConfigurado: () => true,
  conferirParVapid: () => undefined,
  enviarPush: enviar,
}));

const db = banco();
const INSTANTE = new Date("2026-09-30T20:00:00Z");
const DIA = diaLocal(INSTANTE, ambiente.fuso);
const DATA = new Date(`${DIA}T12:00:00Z`);
const usuarios: Identidade[] = [];
const turmas: string[] = [];
let serieId = "";
let alunoId = "";
let diretor: Identidade;
let coordenacao: Identidade;
let configuracaoAnterior: Awaited<ReturnType<typeof db.configuracaoNotificacoes.findUnique>>;

async function dispositivo(usuario: Identidade, nome = usuario.papel) {
  return db.assinaturaPush.create({
    data: {
      usuarioId: usuario.id,
      endpoint: `https://fcm.googleapis.com/fcm/send/qa-agenda-${nome}`,
      p256dh: `B${"A".repeat(86)}`,
      auth: "a".repeat(22),
      chaveVapid: ambiente.push.publicKey,
      criadoEm: new Date(INSTANTE.getTime() - 60_000),
    },
  });
}
async function chamada(turmaId = turmas[0] ?? "") {
  return db.frequencia.create({
    data: {
      turmaId,
      dia: DATA,
      criadoEm: new Date(),
      alunos: { create: { alunoId } },
    },
  });
}

beforeAll(async () => {
  configuracaoAnterior = await db.configuracaoNotificacoes.findUnique({
    where: { id: "principal" },
  });
  for (const papel of ["ADMIN", "COORDENACAO", "DIRETOR_TURMA"] as const) {
    usuarios.push(
      await db.usuario.create({
        data: {
          nome: `QA Agenda ${papel}`,
          email: `qa-agenda-${papel}@escola.exemplo`,
          senhaHash: "hash-sintetico-sem-login",
          papel,
        },
        select: { id: true, nome: true, email: true, papel: true, ativo: true },
      }),
    );
  }
  const coord = usuarios.find((usuario) => usuario.papel === "COORDENACAO");
  const dir = usuarios.find((usuario) => usuario.papel === "DIRETOR_TURMA");
  if (!coord || !dir) throw new Error("Contas sintéticas ausentes.");
  diretor = dir;
  coordenacao = coord;
  await db.credencialDiretor.create({
    data: {
      usuarioId: diretor.id,
      emitidaEm: new Date(),
      expiraEm: new Date("2030-01-01T00:00:00Z"),
      trocaObrigatoria: false,
    },
  });
  const serie = await db.serie.create({ data: { nome: "QA Agenda", ordem: 99 } });
  serieId = serie.id;
  for (const nome of ["Pendente", "Sem aula", "Desistentes", "Vazia", "Aula desativada"]) {
    const turma = await db.turma.create({ data: { serieId, nome } });
    turmas.push(turma.id);
    if (nome !== "Sem aula")
      await db.horario.create({
        data: {
          turmaId: turma.id,
          ordem: 1,
          inicio: "07:00",
          fim: "17:00",
          diasSemana: [diaDaSemanaIso(DIA)],
          ativo: nome !== "Aula desativada",
        },
      });
    if (nome !== "Vazia") {
      const aluno = await db.aluno.create({
        data: {
          nome: `QA Agenda ${nome}`,
          ordem: 1,
          turmaId: turma.id,
          turmaOriginalId: turma.id,
          desistenteEm: nome === "Desistentes" ? DATA : null,
        },
      });
      if (nome === "Pendente") alunoId = aluno.id;
    }
  }
  await db.vinculoDiretor.create({
    data: { usuarioId: diretor.id, turmaId: turmas[0] ?? "", inicio: DATA },
  });
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(INSTANTE);
  enviar.mockReset().mockResolvedValue("enviada");
  await db.assinaturaPush.deleteMany({
    where: { usuarioId: { in: usuarios.map((usuario) => usuario.id) } },
  });
  await db.preferenciaNotificacoes.deleteMany({
    where: { usuarioId: { in: usuarios.map((usuario) => usuario.id) } },
  });
  await db.frequencia.deleteMany({ where: { turmaId: { in: turmas } } });
  await db.usuario.updateMany({
    where: { id: { in: usuarios.map((usuario) => usuario.id) } },
    data: { ativo: true },
  });
  await db.credencialDiretor.update({
    where: { usuarioId: diretor.id },
    data: { revogadaEm: null, trocaObrigatoria: false, expiraEm: new Date("2030-01-01T00:00:00Z") },
  });
  await db.vinculoDiretor.updateMany({
    where: { usuarioId: diretor.id },
    data: { inicio: DATA, fim: null },
  });
  await db.aluno.update({
    where: { id: alunoId },
    data: { ativo: true, desistenteEm: null, turmaId: turmas[0] },
  });
  const config = {
    resumoDiario: false,
    novasChamadas: false,
    chamadasPendentes: true,
    horarioResumo: "17:00",
    horarioPendencias: "17:00",
  };
  await db.configuracaoNotificacoes.upsert({
    where: { id: "principal" },
    create: { id: "principal", ...config },
    update: config,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await db.frequencia.deleteMany({ where: { turmaId: { in: turmas } } });
  await db.aluno.deleteMany({ where: { turmaId: { in: turmas } } });
  await db.usuario.deleteMany({ where: { id: { in: usuarios.map((usuario) => usuario.id) } } });
  await db.horario.deleteMany({ where: { turmaId: { in: turmas } } });
  await db.turma.deleteMany({ where: { id: { in: turmas } } });
  if (serieId) await db.serie.delete({ where: { id: serieId } });
  if (configuracaoAnterior) {
    await db.configuracaoNotificacoes.update({
      where: { id: "principal" },
      data: configuracaoAnterior,
    });
  } else await db.configuracaoNotificacoes.deleteMany({ where: { id: "principal" } });
  await db.$disconnect();
});

describe("avisos de chamadas pendentes", () => {
  it("conta somente turma com aula ativa, aluno participante e chamada não salva", async () => {
    expect(await contarChamadasPendentes(DIA)).toBe(1);
    await chamada();
    expect(await contarChamadasPendentes(DIA)).toBe(0);
  });
  it("aguarda o horário da Gestão e envia uma vez no limite", async () => {
    await dispositivo(coordenacao);
    vi.setSystemTime(new Date(INSTANTE.getTime() - 1_000));
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
    vi.setSystemTime(INSTANTE);
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(1);
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it("envia à equipe que aderiu e não envia aos diretores", async () => {
    for (const usuario of usuarios) await dispositivo(usuario);
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(2);
    expect(
      enviar.mock.calls.map((args) => (args[0] as { endpoint: string }).endpoint),
    ).not.toContain("https://fcm.googleapis.com/fcm/send/qa-agenda-DIRETOR_TURMA");
  });
  it("respeita recusa pessoal, conta desativada e recurso desligado", async () => {
    await dispositivo(coordenacao);
    await atualizarPreferenciasNotificacoes(coordenacao, { chamadasPendentes: false });
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
    await atualizarPreferenciasNotificacoes(coordenacao, { chamadasPendentes: true });
    await db.usuario.update({ where: { id: coordenacao.id }, data: { ativo: false } });
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
    await db.usuario.update({ where: { id: coordenacao.id }, data: { ativo: true } });
    await db.configuracaoNotificacoes.update({
      where: { id: "principal" },
      data: { chamadasPendentes: false },
    });
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });
  it("reconfere a pendência depois de reservar o envio", async () => {
    await dispositivo(coordenacao);
    let concluida = false;
    const comConclusao = new Proxy(db, {
      get(alvo, campo, receptor) {
        if (campo !== "entregaPush") return Reflect.get(alvo, campo, receptor);
        return new Proxy(alvo.entregaPush, {
          get(delegate, metodo, receptorDelegate) {
            if (metodo !== "updateMany") return Reflect.get(delegate, metodo, receptorDelegate);
            return async (args: Parameters<typeof db.entregaPush.updateMany>[0]) => {
              const resultado = await delegate.updateMany(args);
              if (!concluida && args.data.reservadaEm instanceof Date) {
                concluida = true;
                await chamada();
              }
              return resultado;
            };
          },
        });
      },
    });
    vi.spyOn(moduloBanco, "banco").mockReturnValue(comConclusao);
    expect((await enviarAvisosDaAgenda()).ignoradas).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
  });
  it("execuções concorrentes reservam uma única entrega", async () => {
    await dispositivo(coordenacao);
    const resultados = await Promise.all(Array.from({ length: 5 }, () => enviarAvisosDaAgenda()));
    expect(resultados.reduce((total, resultado) => total + resultado.enviadas, 0)).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it("repete falha temporária e remove assinatura expirada", async () => {
    await dispositivo(coordenacao);
    enviar.mockResolvedValueOnce("falha");
    expect((await enviarAvisosDaAgenda()).falhas).toBe(1);
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(1);
    await db.entregaPush.deleteMany({ where: { assinatura: { usuarioId: coordenacao.id } } });
    enviar.mockResolvedValueOnce("expirada");
    expect((await enviarAvisosDaAgenda()).expiradas).toBe(1);
    expect(await db.assinaturaPush.count({ where: { usuarioId: coordenacao.id } })).toBe(0);
  });
});

describe("tipos independentes e novas chamadas", () => {
  it("confirma resumo e nova chamada separadamente e não repete após edição", async () => {
    await dispositivo(diretor);
    await db.configuracaoNotificacoes.update({
      where: { id: "principal" },
      data: { resumoDiario: true, novasChamadas: true, chamadasPendentes: false },
    });
    await atualizarPreferenciasNotificacoes(diretor, { novasChamadas: true });
    vi.setSystemTime(new Date(INSTANTE.getTime() + 60_000));
    const salva = await chamada();
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(2);
    expect(enviar.mock.calls.map((args) => (args[1] as { etiqueta: string }).etiqueta)).toEqual(
      expect.arrayContaining([`resumo-frequencia-${DIA}`, `nova-chamada-${DIA}-${salva.id}`]),
    );
    await db.frequencia.update({ where: { id: salva.id }, data: { revisao: 2 } });
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
  });
  it("não envia chamadas anteriores à preferência ou ao dispositivo", async () => {
    await db.configuracaoNotificacoes.update({
      where: { id: "principal" },
      data: { novasChamadas: true, chamadasPendentes: false },
    });
    await chamada();
    vi.setSystemTime(new Date(INSTANTE.getTime() + 60_000));
    await atualizarPreferenciasNotificacoes(diretor, { novasChamadas: true });
    await dispositivo(diretor);
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
    await db.frequencia.deleteMany({ where: { turmaId: { in: turmas } } });
    vi.setSystemTime(new Date(INSTANTE.getTime() + 120_000));
    await chamada();
    await db.assinaturaPush.updateMany({
      where: { usuarioId: diretor.id },
      data: { criadoEm: new Date(INSTANTE.getTime() + 180_000) },
    });
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
  });
  it("respeita origem após remanejamento e interrompe com vínculo encerrado", async () => {
    await dispositivo(diretor);
    await db.configuracaoNotificacoes.update({
      where: { id: "principal" },
      data: { resumoDiario: true, chamadasPendentes: false },
    });
    await db.aluno.update({ where: { id: alunoId }, data: { turmaId: turmas[1] } });
    await chamada(turmas[1]);
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(1);
    await db.entregaPush.deleteMany({ where: { assinatura: { usuarioId: diretor.id } } });
    await db.vinculoDiretor.updateMany({
      where: { usuarioId: diretor.id },
      data: { inicio: new Date("2026-09-28T12:00:00Z"), fim: new Date("2026-09-29T12:00:00Z") },
    });
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
  });
  it("mantém a palavra-chave válida como requisito exclusivo do diretor", async () => {
    await dispositivo(diretor);
    await db.configuracaoNotificacoes.update({
      where: { id: "principal" },
      data: { resumoDiario: true, chamadasPendentes: false },
    });
    await chamada();
    await db.credencialDiretor.update({
      where: { usuarioId: diretor.id },
      data: { revogadaEm: new Date() },
    });
    expect((await enviarAvisosDaAgenda()).enviadas).toBe(0);
    await expect(
      atualizarPreferenciasNotificacoes(diretor, { resumoDiario: false }),
    ).rejects.toThrow("Troque a palavra-chave");
  });
});
