// Contratos do envio automático ao salvar a chamada: chave desligada não grava,
// chave ligada leva o dia da turma de origem (aluno remanejado), queda vira
// PARCIAL e o salvamento seguinte não repete o envio. Massa com prefixo QS,
// contra o Apps Script falso.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGasFalso, type GasFalso } from "../helpers/gas-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const DIA_1 = "2026-06-15";
const DIA_2 = "2026-06-16";
const DIA_3 = "2026-06-17";

let cookieAdmin = "";
let banco: pg.Client | null = null;
let gas: GasFalso | null = null;
const turmas: Record<"A" | "B", string> = { A: "", B: "" };
const alunos: Record<"A" | "remanejado", string> = { A: "", remanejado: "" };

const daSerie =
  "select id from turmas where serie_id in (select id from series where nome = 'QS Ano')";

async function limparMassa() {
  if (!banco) return;
  await banco.query(`delete from sincronizacoes_planilha where turma_original_id in (${daSerie})`);
  await banco.query(
    `update integracoes_planilha set ativa = false, endpoint = null, token = null,
       versao_script = null, esquema = null, assinatura_esquema = null, esquema_em = null,
       modo = 'CONSERVADOR', modo_completo_ate = null, envio_automatico = false,
       atualizado_em = now()
     where id = 'principal'`,
  );
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(`delete from turmas where id in (${daSerie})`);
  await banco.query("delete from series where nome = 'QS Ano'");
}

function chamar(caminho: string, metodo: "GET" | "POST" | "PATCH", corpo?: unknown) {
  return fetch(`${APP_URL}${caminho}`, {
    method: metodo,
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

async function salvar(dia: string, turma: "A" | "B", faltas: string[], revisao = 0) {
  const resposta = await chamar("/api/frequencias", "POST", {
    dia,
    turmaId: turmas[turma],
    faltas,
    revisao,
  });
  expect(resposta.status).toBe(200);
}

function cabecalho(aba: string): string[] {
  return Array.from({ length: 8 }, (_, indice) => gas?.valor(aba, 1, indice + 1) ?? "");
}

async function esperar(condicao: () => boolean, tempoMs = 15_000): Promise<boolean> {
  const limite = Date.now() + tempoMs;
  while (Date.now() < limite) {
    if (condicao()) return true;
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  return condicao();
}

async function ultimoResultado(): Promise<string | undefined> {
  if (!banco) return undefined;
  const registro = await banco.query<{ resultado: string }>(
    "select resultado from sincronizacoes_planilha where turma_original_id = $1 order by criado_em desc limit 1",
    [turmas.A],
  );
  return registro.rows[0]?.resultado;
}

async function esperarResultado(esperado: string): Promise<boolean> {
  const limite = Date.now() + 15_000;
  while (Date.now() < limite) {
    if ((await ultimoResultado()) === esperado) return true;
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  return false;
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
    await chamar("/api/series", "POST", { nome: "QS Ano", ordem: 96 }),
  );
  for (const nome of ["A", "B"] as const) {
    const turma = await json<{ turma: { id: string } }>(
      await chamar("/api/turmas", "POST", { serieId: serie.serie.id, nome }),
    );
    turmas[nome] = turma.turma.id;
  }
  const aluno = await json<{ aluno: { id: string } }>(
    await chamar("/api/alunos", "POST", { nome: "QS Aluno A", turmaId: turmas.A }),
  );
  alunos.A = aluno.aluno.id;
  // Aluno remanejado: chamada na turma B, consolidado na aba da turma A.
  const remanejado = await json<{ aluno: { id: string } }>(
    await chamar("/api/alunos", "POST", {
      nome: "QS Aluno Remanejado",
      turmaId: turmas.B,
      turmaOriginalId: turmas.A,
    }),
  );
  alunos.remanejado = remanejado.aluno.id;
  gas.definirAba("QS Ano A", [
    ["Aluno", "Turma atual", "Total"],
    ["QS Aluno A", "QS Ano A", ""],
    ["QS Aluno Remanejado", "QS Ano B", ""],
  ]);

  const gerado = await json<{ token: string }>(
    await chamar("/api/planilha/token", "POST", { acao: "gerar", senha: SENHA_ADMIN }),
  );
  gas.definirToken(gerado.token);
  await chamar("/api/planilha", "PATCH", { ativa: true, endpoint: gas.url });
  const estrutura = await json<{ planilha: unknown; abas: unknown[] }>(
    await chamar("/api/planilha/estrutura", "POST", {}),
  );
  const mapa = await chamar("/api/planilha/mapa", "POST", {
    planilha: estrutura.planilha,
    abas: estrutura.abas,
    mapa: [{ aba: "QS Ano A", turmaOriginalId: turmas.A }],
  });
  expect(mapa.status).toBe(200);
});

afterAll(async () => {
  await chamar("/api/planilha/desconectar", "POST", {}).catch(() => undefined);
  await limparMassa();
  await gas?.fechar();
  if (banco) await banco.end();
});

describe("envio automático ao salvar a chamada", () => {
  it("com a chave desligada, salvar não grava na planilha", async () => {
    await salvar(DIA_1, "A", [alunos.A]);
    await new Promise((resolver) => setTimeout(resolver, 1500));
    expect(cabecalho("QS Ano A")).not.toContain("15/06");
  });

  it("com a chave ligada, salvar a chamada da turma B leva o dia à aba da turma de origem", async () => {
    const ligada = await chamar("/api/planilha", "PATCH", { envioAutomatico: true });
    expect(ligada.status).toBe(200);
    await salvar(DIA_2, "B", [alunos.remanejado]);
    expect(await esperar(() => cabecalho("QS Ano A").includes("16/06"))).toBe(true);
    const coluna = cabecalho("QS Ano A").indexOf("16/06") + 1;
    expect(gas?.valor("QS Ano A", 3, coluna)).toBe("F");
    expect(await esperarResultado("SUCESSO")).toBe(true);
  });

  it("queda depois de gravar vira PARCIAL e o salvamento seguinte não repete o envio", async () => {
    gas?.derrubarProximoAplicar();
    await salvar(DIA_3, "A", [alunos.A]);
    await esperar(() => cabecalho("QS Ano A").includes("17/06"));
    expect(await esperarResultado("PARCIAL")).toBe(true);

    const antes = gas?.chamadas().length ?? 0;
    await salvar(DIA_3, "A", [], 1);
    await new Promise((resolver) => setTimeout(resolver, 2000));
    expect(
      gas
        ?.chamadas()
        .slice(antes)
        .filter((acao) => acao.includes("aplicar")),
    ).toEqual([]);
    expect(await ultimoResultado()).toBe("PARCIAL");
  });
});
