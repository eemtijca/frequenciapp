// Contratos do envio incremental à planilha de frequência: só os dias
// alterados, dois dias seguidos sem reconferir a estrutura, queda depois de
// gravar registrada como PARCIAL com reenvio sem coluna duplicada e uma turma
// por requisição. Massa com prefixo QN, contra o Apps Script falso.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGasFalso, type GasFalso } from "../helpers/gas-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
// Segunda, terça e quarta; a aula padrão da turma nova vale todos os dias.
const DIA_1 = "2026-06-15";
const DIA_2 = "2026-06-16";
const DIA_3 = "2026-06-17";
const MES = { de: "2026-06-01", ate: "2026-06-30" };

let cookieAdmin = "";
let banco: pg.Client | null = null;
let gas: GasFalso | null = null;
const turmas: Record<"A" | "B", string> = { A: "", B: "" };
const alunos: Record<"A" | "B", string> = { A: "", B: "" };

interface Plano {
  turmaOriginalId: string;
  dias: string[];
  semEnvio: boolean;
  planoHashTurma: string;
  avisos: string[];
  resumo: { preencher: number; novasColunas: number };
}

interface Resultado {
  resultados: { turmaOriginalId: string; resultado: string; erro?: string }[];
}

const daSerie =
  "select id from turmas where serie_id in (select id from series where nome = 'QN Ano')";

async function limparMassa() {
  if (!banco) return;
  await banco.query(`delete from sincronizacoes_planilha where turma_original_id in (${daSerie})`);
  await banco.query(
    `update integracoes_planilha set ativa = false, endpoint = null, token = null,
       versao_script = null, esquema = null, assinatura_esquema = null, esquema_em = null,
       modo = 'CONSERVADOR', modo_completo_ate = null, atualizado_em = now()
     where id = 'principal'`,
  );
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(`delete from turmas where id in (${daSerie})`);
  await banco.query("delete from series where nome = 'QN Ano'");
}

function chamar(caminho: string, corpo?: unknown): Promise<Response> {
  return fetch(`${APP_URL}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: {
      Origin: APP_URL,
      Cookie: cookieAdmin,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function json<T>(resposta: Response): Promise<T> {
  return (await resposta.json()) as T;
}

async function chamada(dia: string, turma: "A" | "B", faltas: string[] = [], revisao = 0) {
  const resposta = await chamar("/api/frequencias", {
    dia,
    turmaId: turmas[turma],
    faltas,
    revisao,
  });
  expect(resposta.status).toBe(200);
}

async function simular(turma: "A" | "B" | "todas"): Promise<Plano[]> {
  const resposta = await chamar("/api/planilha/simular", {
    ...(turma === "todas" ? { todas: true } : { turmaOriginalId: turmas[turma] }),
    ...MES,
    permitirInserirColunas: true,
    permitirNovosAlunos: true,
  });
  expect(resposta.status).toBe(200);
  return (await json<{ planos: Plano[] }>(resposta)).planos;
}

async function aplicar(plano: Plano): Promise<Response> {
  return chamar("/api/planilha/aplicar", {
    turmaOriginalId: plano.turmaOriginalId,
    ...MES,
    permitirInserirColunas: true,
    permitirNovosAlunos: true,
    planoHashGeral: plano.planoHashTurma,
  });
}

function cabecalho(aba: string): string[] {
  return Array.from({ length: 8 }, (_, indice) => gas?.valor(aba, 1, indice + 1) ?? "");
}

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (conexao?.startsWith("postgresql://")) {
    banco = new pg.Client({ connectionString: conexao });
    await banco.connect();
  }
  await limparMassa();
  gas = await criarGasFalso();
  const entrada = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ login: EMAIL_ADMIN, senha: SENHA_ADMIN, lembrar: false }),
  });
  cookieAdmin = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";

  const serie = await json<{ serie: { id: string } }>(
    await chamar("/api/series", { nome: "QN Ano", ordem: 95 }),
  );
  for (const nome of ["A", "B"] as const) {
    const turma = await json<{ turma: { id: string } }>(
      await chamar("/api/turmas", { serieId: serie.serie.id, nome }),
    );
    turmas[nome] = turma.turma.id;
    const aluno = await json<{ aluno: { id: string } }>(
      await chamar("/api/alunos", { nome: `QN Aluno ${nome}`, turmaId: turma.turma.id }),
    );
    alunos[nome] = aluno.aluno.id;
    gas.definirAba(`QN Ano ${nome}`, [
      ["Aluno", "Turma atual", "Total"],
      [`QN Aluno ${nome}`, `QN Ano ${nome}`, ""],
    ]);
  }

  const gerado = await json<{ token: string }>(
    await chamar("/api/planilha/token", { acao: "gerar", senha: SENHA_ADMIN }),
  );
  gas.definirToken(gerado.token);
  await fetch(`${APP_URL}/api/planilha`, {
    method: "PATCH",
    headers: { Origin: APP_URL, Cookie: cookieAdmin, "Content-Type": "application/json" },
    body: JSON.stringify({ ativa: true, endpoint: gas.url }),
  });
  const estrutura = await json<{ planilha: unknown; abas: unknown[] }>(
    await chamar("/api/planilha/estrutura", {}),
  );
  const mapa = await chamar("/api/planilha/mapa", {
    planilha: estrutura.planilha,
    abas: estrutura.abas,
    mapa: [
      { aba: "QN Ano A", turmaOriginalId: turmas.A },
      { aba: "QN Ano B", turmaOriginalId: turmas.B },
    ],
  });
  expect(mapa.status).toBe(200);
});

afterAll(async () => {
  await chamar("/api/planilha/desconectar", {}).catch(() => undefined);
  await limparMassa();
  await gas?.fechar();
  if (banco) await banco.end();
});

describe("envio incremental à planilha", () => {
  it("sem envio anterior, cobre os dias com chamada do período e cria a coluna do dia", async () => {
    await chamada(DIA_1, "A", [alunos.A]);
    const [plano] = await simular("A");
    expect(plano?.dias).toEqual([DIA_1]);
    const resposta = await aplicar(plano as Plano);
    expect(resposta.status).toBe(200);
    expect((await json<Resultado>(resposta)).resultados[0]?.resultado).toBe("sucesso");
    expect(cabecalho("QN Ano A").slice(0, 4)).toEqual(["Aluno", "Turma atual", "15/06", "Total"]);
    expect(gas?.valor("QN Ano A", 2, 3)).toBe("F");
  });

  it("sem nada alterado desde o último envio, não há o que enviar", async () => {
    const [plano] = await simular("A");
    expect(plano).toMatchObject({ dias: [], semEnvio: true });
  });

  it("no dia seguinte, envia só o dia novo e cria a coluna sem reconferir a estrutura", async () => {
    await chamada(DIA_2, "A");
    const [plano] = await simular("A");
    expect(plano?.dias).toEqual([DIA_2]);
    expect(plano?.avisos.join(" ")).not.toContain("estrutura da aba mudou");
    const resposta = await aplicar(plano as Plano);
    expect((await json<Resultado>(resposta)).resultados[0]?.resultado).toBe("sucesso");
    expect(cabecalho("QN Ano A").slice(0, 5)).toEqual([
      "Aluno",
      "Turma atual",
      "15/06",
      "16/06",
      "Total",
    ]);
    expect(gas?.valor("QN Ano A", 2, 4)).toBe("P");
  });

  it("queda depois de gravar vira PARCIAL, e o reenvio não duplica a coluna", async () => {
    await chamada(DIA_3, "A", [alunos.A]);
    const [plano] = await simular("A");
    expect(plano?.dias).toEqual([DIA_3]);
    gas?.derrubarProximoAplicar();
    const resposta = await aplicar(plano as Plano);
    expect(resposta.status).toBe(200);
    const [resultado] = (await json<Resultado>(resposta)).resultados;
    expect(resultado?.resultado).toBe("parcial");
    expect(resultado?.erro).toContain("Não foi possível confirmar o resultado");
    expect(resultado?.erro).not.toContain("Nada foi alterado");
    if (banco) {
      const registro = await banco.query<{ resultado: string }>(
        "select resultado from sincronizacoes_planilha where turma_original_id = $1 order by criado_em desc limit 1",
        [turmas.A],
      );
      expect(registro.rows[0]?.resultado).toBe("PARCIAL");
    }
    // A planilha recebeu o dia, mas sem confirmação ele continua pendente.
    expect(cabecalho("QN Ano A").filter((valor) => valor === "17/06")).toHaveLength(1);

    const [reenvio] = await simular("A");
    expect(reenvio?.dias).toEqual([DIA_3]);
    expect(reenvio?.resumo.novasColunas).toBe(0);
    expect(reenvio?.avisos.join(" ")).toContain("estrutura da aba mudou");
    const segunda = await aplicar(reenvio as Plano);
    expect((await json<Resultado>(segunda)).resultados[0]?.resultado).toBe("sucesso");
    expect(cabecalho("QN Ano A").filter((valor) => valor === "17/06")).toHaveLength(1);
    expect(gas?.valor("QN Ano A", 2, 5)).toBe("F");
  });

  it("envia uma turma por requisição, e a falha de uma não impede a outra", async () => {
    await chamada(DIA_3, "B");
    await chamada(DIA_3, "A", [], 1);
    const planos = await simular("todas");
    expect(planos.map((item) => item.dias)).toEqual([[DIA_3], [DIA_3]]);

    const todas = await chamar("/api/planilha/aplicar", {
      todas: true,
      ...MES,
      planoHashGeral: planos[0]?.planoHashTurma,
    });
    expect(todas.status).toBe(400);

    // A aba da turma B some depois da prévia: o envio dela falha, o da A segue.
    const planoB = planos.find((item) => item.turmaOriginalId === turmas.B) as Plano;
    const planoA = planos.find((item) => item.turmaOriginalId === turmas.A) as Plano;
    gas?.renomearAba("QN Ano B", "QN Ano B antiga");
    const falha = await aplicar(planoB);
    expect(falha.status).not.toBe(200);
    const sucesso = await aplicar(planoA);
    expect((await json<Resultado>(sucesso)).resultados[0]?.resultado).toBe("sucesso");
  });
});
