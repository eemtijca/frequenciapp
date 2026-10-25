// Sincronização dos feriados: primeira gravação, bloqueio e liberação por senha.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroHttp } from "@/infra/erros";

const admin = { id: "00000000-0000-4000-8000-000000000001" };
const outro = { id: "00000000-0000-4000-8000-000000000002" };

const dados = vi.hoisted(() => ({
  linhas: [] as { dia: Date; nome: string; origem: "MANUAL" | "API" }[],
  ocupados: new Set<string>(),
  parciais: new Set<string>(),
  importados: 0,
  configurado: true,
  feriados: [] as { dia: string; nome: string }[],
}));

const buscar = vi.hoisted(() => vi.fn(async () => dados.feriados));
const conferirSenha = vi.hoisted(() => vi.fn(async () => undefined));
const auditar = vi.hoisted(() => vi.fn(async () => undefined));
const conferirTrava = vi.hoisted(() => vi.fn());

const transacao = vi.hoisted(() => ({
  // Trava do calendário (LOCK TABLE) feita pela transação antes de ler.
  $executeRaw: vi.fn(async () => 0),
  feriado: {
    count: vi.fn(async () => dados.importados),
    findMany: vi.fn(async () => dados.linhas),
    create: vi.fn(
      async ({
        data,
      }: {
        data: { dia: Date; nome: string; origem: "MANUAL" | "API"; criadoPorId: string };
      }) => {
        dados.linhas.push({ dia: data.dia, nome: data.nome, origem: data.origem });
        dados.importados += 1;
        return data;
      },
    ),
    update: vi.fn(async ({ where, data }: { where: { dia: Date }; data: { nome: string } }) => {
      const dia = where.dia.toISOString().slice(0, 10);
      const linha = dados.linhas.find((item) => item.dia.toISOString().slice(0, 10) === dia);
      if (linha) linha.nome = data.nome;
      return linha;
    }),
  },
  frequencia: {
    findMany: vi.fn(async ({ where }: { where: { dia: { in: Date[] } } }) =>
      where.dia.in
        .filter((dia) => dados.ocupados.has(dia.toISOString().slice(0, 10)))
        .map((dia) => ({ dia })),
    ),
  },
  frequenciaParcial: {
    findMany: vi.fn(async ({ where }: { where: { dia: { in: Date[] } } }) =>
      where.dia.in
        .filter((dia) => dados.parciais.has(dia.toISOString().slice(0, 10)))
        .map((dia) => ({ dia })),
    ),
  },
}));

vi.mock("@/infra/ambiente", () => ({
  ambiente: {
    authSecret: "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres",
    feriados: { url: "https://feriadosapi.com", token: "token-de-teste" },
  },
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({ feriado: { count: async () => dados.importados } }),
  objetoDoBanco: (nome: string) => nome,
}));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: async (operacao: (tx: typeof transacao) => Promise<unknown>) => operacao(transacao),
}));
vi.mock("@/infra/trava-planilha-frequencia", () => ({
  comTravaPlanilhaFrequencia: (tarefa: () => Promise<unknown>) => tarefa(),
  controleTravaPlanilhaFrequencia: () => ({ conferir: conferirTrava }),
}));
vi.mock("@/infra/auditoria", () => ({ auditar }));
vi.mock("@/infra/feriados-api", () => ({
  buscarFeriadosDoAno: buscar,
  consultaFeriadosConfigurada: () => dados.configurado,
  abrangenciaFeriados: () => "nacionais",
}));
vi.mock("@/application/confirmacao-admin", () => ({
  conferirSenhaDoAdmin: conferirSenha,
}));

import { emitirProvaSincronizacao } from "@/infra/prova-sincronizacao-feriados";
import {
  desbloquearSincronizacaoFeriados,
  lerEstadoSincronizacao,
  sincronizarFeriados,
} from "@/application/sincronizar-feriados";

beforeEach(() => {
  vi.clearAllMocks();
  dados.linhas = [];
  dados.ocupados = new Set();
  dados.parciais = new Set();
  dados.importados = 0;
  dados.configurado = true;
  dados.feriados = [
    { dia: "2026-01-01", nome: "Confraternização" },
    { dia: "2026-04-21", nome: "Tiradentes" },
  ];
  conferirSenha.mockResolvedValue(undefined);
});

describe("sincronização de feriados", () => {
  it("grava a primeira consulta e passa a informar o bloqueio", async () => {
    const resumo = await sincronizarFeriados(admin, { ano: 2026 });
    expect(resumo).toEqual({
      gravados: 2,
      atualizados: 0,
      mantidos: 0,
      ignorados: 0,
      sincronizado: true,
    });
    expect(transacao.feriado.create).toHaveBeenCalledTimes(2);
    expect(transacao.feriado.create).toHaveBeenCalledWith({
      data: {
        dia: new Date("2026-01-01T12:00:00Z"),
        nome: "Confraternização",
        origem: "API",
        criadoPorId: admin.id,
      },
    });
    expect(auditar).toHaveBeenCalledWith(
      transacao,
      admin.id,
      "feriado.sincronizar",
      "feriados:2026",
    );
    await expect(lerEstadoSincronizacao()).resolves.toEqual({
      sincronizado: true,
      configurado: true,
      abrangencia: "nacionais",
    });
  });

  it("bloqueia nova gravação sem prova e não consulta a base de novo", async () => {
    dados.importados = 1;
    await expect(sincronizarFeriados(admin, { ano: 2026 })).rejects.toThrow(
      "Os feriados já estão gravados. Informe a senha do administrador para sincronizar de novo.",
    );
    expect(buscar).not.toHaveBeenCalled();
    expect(transacao.feriado.create).not.toHaveBeenCalled();
  });

  it("com a prova, atualiza o importado, preserva o manual e ignora chamada salva", async () => {
    dados.importados = 1;
    dados.linhas = [
      { dia: new Date("2026-01-01T12:00:00Z"), nome: "Ano novo da escola", origem: "MANUAL" },
      { dia: new Date("2026-04-21T12:00:00Z"), nome: "Nome antigo", origem: "API" },
    ];
    dados.ocupados.add("2026-09-07");
    dados.parciais.add("2026-11-02");
    dados.feriados = [
      { dia: "2026-01-01", nome: "Confraternização universal" },
      { dia: "2026-04-21", nome: "Tiradentes" },
      { dia: "2026-09-07", nome: "Independência" },
      { dia: "2026-11-02", nome: "Finados" },
      { dia: "2026-10-12", nome: "Nossa Senhora Aparecida" },
    ];
    const prova = emitirProvaSincronizacao(admin.id, 2026);
    const resumo = await sincronizarFeriados(admin, { ano: 2026, prova });
    expect(resumo).toMatchObject({
      gravados: 1,
      atualizados: 1,
      mantidos: 1,
      ignorados: 2,
      sincronizado: true,
    });
    expect(dados.linhas.find((item) => item.origem === "MANUAL")?.nome).toBe("Ano novo da escola");
    expect(dados.linhas.find((item) => item.dia.toISOString().startsWith("2026-04-21"))?.nome).toBe(
      "Tiradentes",
    );
    expect(transacao.feriado.create).toHaveBeenCalledTimes(1);
  });

  it("não grava quando a consulta volta vazia ou a base não está configurada", async () => {
    dados.feriados = [];
    await expect(sincronizarFeriados(admin, { ano: 2026 })).rejects.toThrow(
      "A consulta não retornou feriados para este ano.",
    );
    expect(transacao.feriado.create).not.toHaveBeenCalled();

    dados.configurado = false;
    dados.feriados = [{ dia: "2026-01-01", nome: "Confraternização" }];
    await expect(sincronizarFeriados(admin, { ano: 2026 })).rejects.toThrow(
      "A consulta de feriados não está configurada.",
    );
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("recusa ano inválido e prova de outro ano, outra conta ou expirada", async () => {
    dados.importados = 1;
    await expect(sincronizarFeriados(admin, { ano: 1800 })).rejects.toThrow(
      "Informe um ano entre 1900 e 2199.",
    );
    await expect(
      sincronizarFeriados(admin, { ano: 2026, prova: emitirProvaSincronizacao(admin.id, 2027) }),
    ).rejects.toThrow("A liberação expirou. Informe a senha do administrador novamente.");
    await expect(
      sincronizarFeriados(admin, { ano: 2026, prova: emitirProvaSincronizacao(outro.id, 2026) }),
    ).rejects.toThrow("A liberação expirou. Informe a senha do administrador novamente.");
    const expirada = emitirProvaSincronizacao(admin.id, 2026, Date.now() - 11 * 60 * 1000);
    await expect(sincronizarFeriados(admin, { ano: 2026, prova: expirada })).rejects.toThrow(
      "A liberação expirou. Informe a senha do administrador novamente.",
    );
    const [corpo, assinatura] = emitirProvaSincronizacao(admin.id, 2026).split(".");
    await expect(
      sincronizarFeriados(admin, { ano: 2026, prova: `${corpo}x.${assinatura}` }),
    ).rejects.toThrow("A liberação expirou. Informe a senha do administrador novamente.");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("libera a sincronização somente depois da senha do administrador", async () => {
    const liberacao = await desbloquearSincronizacaoFeriados(admin, {
      ano: 2026,
      senha: "senha-do-admin",
    });
    expect(conferirSenha).toHaveBeenCalledWith(admin.id, "senha-do-admin", "sincronizar-feriados");
    dados.importados = 1;
    const resumo = await sincronizarFeriados(admin, { ano: 2026, prova: liberacao.prova });
    expect(resumo.sincronizado).toBe(true);

    conferirSenha.mockRejectedValueOnce(
      new ErroHttp("A senha do administrador está incorreta.", 400),
    );
    await expect(
      desbloquearSincronizacaoFeriados(admin, { ano: 2026, senha: "errada" }),
    ).rejects.toThrow("A senha do administrador está incorreta.");
  });

  it("mantém o botão ativo quando ainda não há feriado importado", async () => {
    await expect(lerEstadoSincronizacao()).resolves.toMatchObject({ sincronizado: false });
  });
});
