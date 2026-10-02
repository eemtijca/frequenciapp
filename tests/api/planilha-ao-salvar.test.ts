// Contratos do envio ao salvar: remanejamento, idempotência, pendências e
// versão do script, com massa sintética QS contra o Apps Script falso.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGasFalso, type GasFalso } from "../helpers/gas-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const DIA_1 = "2026-06-15";
const DIA_2 = "2026-06-16";
const DIA_3 = "2026-06-17";
const DIA_4 = "2026-06-18";
const DIA_5 = "2026-06-19";
const DIA_6 = "2026-06-22";
const DIA_7 = "2026-06-23";
const DIA_8 = "2026-06-24";

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
  return Array.from({ length: 20 }, (_, indice) => gas?.valor(aba, 1, indice + 1) ?? "");
}

function quantidadeAplicacoes(): number {
  return gas?.chamadas().filter((acao) => acao === "aplicar").length ?? 0;
}

async function diasPendentes(): Promise<string[]> {
  const resposta = await chamar("/api/planilha/simular", "POST", {
    turmaOriginalId: turmas.A,
    de: "2026-06-01",
    ate: "2026-06-30",
    somenteAlteradas: true,
    permitirInserirColunas: true,
    permitirNovosAlunos: false,
  });
  expect(resposta.status).toBe(200);
  const previa = await json<{ planos: { dias: string[] }[] }>(resposta);
  return previa.planos[0]?.dias ?? [];
}

async function quantidadeChamadasPendentes(): Promise<number> {
  const resposta = await chamar("/api/planilha", "GET");
  expect(resposta.status).toBe(200);
  const estado = await json<{ integracao: { alteradasDepois: number } }>(resposta);
  return estado.integracao.alteradasDepois;
}

async function esperar(condicao: () => boolean, tempoMs = 15_000): Promise<boolean> {
  const limite = Date.now() + tempoMs;
  while (Date.now() < limite) {
    if (condicao()) return true;
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  return condicao();
}

async function ultimoResultado(dia?: string): Promise<string | undefined> {
  if (!banco) return undefined;
  const registro = await banco.query<{ resultado: string }>(
    `select resultado from sincronizacoes_planilha where turma_original_id = $1
       ${dia ? "and de <= $2::date and ate >= $2::date" : ""}
       order by criado_em desc limit 1`,
    dia ? [turmas.A, dia] : [turmas.A],
  );
  return registro.rows[0]?.resultado;
}

async function esperarResultado(esperado: string, dia?: string): Promise<boolean> {
  const limite = Date.now() + 15_000;
  while (Date.now() < limite) {
    if ((await ultimoResultado(dia)) === esperado) return true;
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
  const scriptTestado = await chamar("/api/planilha/testar", "POST", { endpoint: gas.url });
  expect(scriptTestado.status).toBe(200);
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
    expect(cabecalho("QS Ano A")).not.toContain("15/06/2026");
  });

  it("com a chave ligada, salvar a chamada da turma B leva o dia à aba da turma de origem", async () => {
    const ligada = await chamar("/api/planilha", "PATCH", { envioAutomatico: true });
    expect(ligada.status).toBe(200);
    await salvar(DIA_2, "B", [alunos.remanejado]);
    expect(await esperar(() => cabecalho("QS Ano A").includes("16/06/2026"))).toBe(true);
    const coluna = cabecalho("QS Ano A").indexOf("16/06/2026") + 1;
    expect(gas?.valor("QS Ano A", 3, coluna)).toBe("F");
    expect(await esperarResultado("SUCESSO")).toBe(true);
  });

  it("envia o dia seguinte após um envio bem-sucedido sem reconferir o mapa", async () => {
    const antes = quantidadeAplicacoes();
    await salvar(DIA_4, "A", [alunos.A]);
    expect(await esperarResultado("SUCESSO", DIA_4)).toBe(true);
    expect(cabecalho("QS Ano A").filter((valor) => valor === "18/06/2026")).toHaveLength(1);
    const coluna = cabecalho("QS Ano A").indexOf("18/06/2026") + 1;
    expect(gas?.valor("QS Ano A", 2, coluna)).toBe("F");
    expect(quantidadeAplicacoes()).toBe(antes + 1);
  });

  it("salvar as mesmas marcas de novo não repete a escrita nem duplica o dia", async () => {
    const antes = quantidadeAplicacoes();
    await salvar(DIA_4, "A", [alunos.A], 1);
    await new Promise((resolver) => setTimeout(resolver, 2000));
    expect(quantidadeAplicacoes()).toBe(antes);
    expect(cabecalho("QS Ano A").filter((valor) => valor === "18/06/2026")).toHaveLength(1);
    expect(await ultimoResultado(DIA_4)).toBe("SUCESSO");
    expect(await diasPendentes()).not.toContain(DIA_4);
  });

  it("mantém a correção conservadora pendente mesmo após enviar outro dia com sucesso", async () => {
    const antes = quantidadeAplicacoes();
    const pendentesAntes = await quantidadeChamadasPendentes();
    await salvar(DIA_4, "A", [], 2);
    await new Promise((resolver) => setTimeout(resolver, 2000));
    const coluna = cabecalho("QS Ano A").indexOf("18/06/2026") + 1;
    expect(gas?.valor("QS Ano A", 2, coluna)).toBe("F");
    expect(quantidadeAplicacoes()).toBe(antes);

    await salvar(DIA_5, "A", []);
    expect(await esperarResultado("SUCESSO", DIA_5)).toBe(true);
    const colunaNova = cabecalho("QS Ano A").indexOf("19/06/2026") + 1;
    expect(gas?.valor("QS Ano A", 2, colunaNova)).toBe("P");
    expect(await diasPendentes()).toContain(DIA_4);
    expect(await quantidadeChamadasPendentes()).toBe(pendentesAntes + 1);
  });

  it("uma divergência ocupada impede o envio automático das outras células vazias do dia", async () => {
    const coluna = cabecalho("QS Ano A").indexOf("18/06/2026") + 1;
    expect(gas?.valor("QS Ano A", 2, coluna)).toBe("F");
    expect(gas?.valor("QS Ano A", 3, coluna)).toBe("");
    const antes = quantidadeAplicacoes();
    await salvar(DIA_4, "B", [alunos.remanejado]);
    await new Promise((resolver) => setTimeout(resolver, 2000));
    expect(quantidadeAplicacoes()).toBe(antes);
    expect(gas?.valor("QS Ano A", 2, coluna)).toBe("F");
    expect(gas?.valor("QS Ano A", 3, coluna)).toBe("");

    await salvar(DIA_6, "A", []);
    expect(await esperarResultado("SUCESSO", DIA_6)).toBe(true);
    expect(await diasPendentes()).toContain(DIA_4);
  });

  it.each([
    { versao: null, descricao: "desconhecida", dia: DIA_7, rotulo: "23/06/2026" },
    { versao: "6", descricao: "anterior à mínima", dia: DIA_8, rotulo: "24/06/2026" },
  ])(
    "versão $descricao não cria PARCIAL, e testar a versão 7 libera novo envio",
    async ({ versao, dia, rotulo }) => {
      if (!banco) throw new Error("O teste exige a conexão com o banco de dados.");
      await banco.query(
        "update integracoes_planilha set versao_script = $1 where id = 'principal'",
        [versao],
      );
      const antes = quantidadeAplicacoes();
      try {
        await salvar(dia, "A", [alunos.A]);
        await new Promise((resolver) => setTimeout(resolver, 2000));
        expect(quantidadeAplicacoes()).toBe(antes);
        expect(cabecalho("QS Ano A")).not.toContain(rotulo);
        expect(await ultimoResultado(dia)).not.toBe("PARCIAL");
      } finally {
        const testado = await chamar("/api/planilha/testar", "POST", { endpoint: gas?.url });
        expect(testado.status).toBe(200);
      }

      await salvar(dia, "A", [alunos.A], 1);
      expect(await esperarResultado("SUCESSO", dia)).toBe(true);
      expect(cabecalho("QS Ano A").filter((valor) => valor === rotulo)).toHaveLength(1);
      const coluna = cabecalho("QS Ano A").indexOf(rotulo) + 1;
      expect(gas?.valor("QS Ano A", 2, coluna)).toBe("F");
      expect(quantidadeAplicacoes()).toBe(antes + 1);
    },
  );

  it("queda depois de gravar vira PARCIAL e o salvamento seguinte não repete o envio", async () => {
    gas?.derrubarProximoAplicar();
    await salvar(DIA_3, "A", [alunos.A]);
    await esperar(() => cabecalho("QS Ano A").includes("17/06/2026"));
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
