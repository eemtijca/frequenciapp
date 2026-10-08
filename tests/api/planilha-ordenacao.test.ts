// Transferência e ordenação das linhas de frequência contra a Sheets API sintética.
// Confere os vínculos por aluno, as marcas antigas e as células auxiliares.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SERIE = "QA Ordenação";
const ABA = `${SERIE} A`;
const DIA = "2026-09-10";
const daSerie = "select id from turmas where serie_id in (select id from series where nome = $1)";
let banco: pg.Client;
let google: GoogleFalso;
let cookie = "";
const turmas = { A: "", B: "" };
const alunos = { agata: "", bruna: "", erica: "" };

function chamar(caminho: string, corpo: unknown, method = "POST") {
  return fetch(`${APP_URL}${caminho}`, {
    method,
    headers: { Origin: APP_URL, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function dados<T>(resposta: Response, status = 200): Promise<T> {
  expect(resposta.status).toBe(status);
  return (await resposta.json()) as T;
}

async function limpar() {
  await banco.query(`delete from sincronizacoes_planilha where turma_original_id in (${daSerie})`, [
    SERIE,
  ]);
  await banco.query(
    `update integracoes_planilha set ativa = false, google_refresh_token = null,
      google_planilha_id = null, google_planilha_nome = null, esquema = null,
      assinatura_esquema = null, esquema_em = null, modo = 'CONSERVADOR',
      modo_completo_ate = null, envio_automatico = false where id = 'principal'`,
  );
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`, [SERIE]);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`, [SERIE]);
  await banco.query(`delete from turmas where id in (${daSerie})`, [SERIE]);
  await banco.query("delete from series where nome = $1", [SERIE]);
}

async function salvar(turmaId: string, dia: string, faltas: string[]) {
  expect((await chamar("/api/frequencias", { turmaId, dia, faltas, revisao: 0 })).status).toBe(200);
}

async function enviar(turmaOriginalId: string, ate = DIA) {
  const entrada = { turmaOriginalId, de: DIA, ate, somenteAlteradas: false };
  const previa = await dados<{ planoHashGeral: string; planos: { bloqueado: boolean }[] }>(
    await chamar("/api/planilha/simular", entrada),
  );
  expect(previa.planos.every((plano) => !plano.bloqueado)).toBe(true);
  const resultado = await dados<{ resultados: { resultado: string }[] }>(
    await chamar("/api/planilha/aplicar", { ...entrada, planoHashGeral: previa.planoHashGeral }),
  );
  expect(resultado.resultados).toHaveLength(1);
  expect(resultado.resultados[0]?.resultado).toBe("sucesso");
}

beforeAll(async () => {
  banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await banco.connect();
  await limpar();
  google = await criarGoogleFalso();
  const entrada = await chamar("/api/auth/entrar", {
    email: process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo",
    senha: process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
  });
  expect(entrada.status).toBe(200);
  cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
  const serie = await dados<{ serie: { id: string } }>(
    await chamar("/api/series", { nome: SERIE, ordem: 93 }),
    201,
  );
  for (const nome of ["A", "B"] as const) {
    const turma = await dados<{ turma: { id: string } }>(
      await chamar("/api/turmas", { serieId: serie.serie.id, nome }),
      201,
    );
    turmas[nome] = turma.turma.id;
  }
  for (const [chave, nome, turmaId] of [
    ["bruna", "QA Bruna", turmas.A],
    ["erica", "QA Érica", turmas.A],
    ["agata", "QA Ágata", turmas.B],
  ] as const) {
    const aluno = await dados<{ aluno: { id: string } }>(
      await chamar("/api/alunos", { nome, turmaId }),
      201,
    );
    alunos[chave] = aluno.aluno.id;
  }
  google.definirAba(
    ABA,
    [
      ["Aluno", "10/09/2026", "Observação"],
      ["QA Bruna", "", "Auxiliar Bruna"],
      ["QA Érica", "", "Auxiliar Érica"],
      ["Conferência manual", "Texto manual", "Auxiliar manual"],
    ],
    { formulas: { C2: "=1+2", C3: "=4+5" } },
  );
  google.definirAba(`${SERIE} B`, [["Aluno", "10/09/2026"]]);
  await google.conectar(banco);
  const estrutura = await dados<{ planilha: unknown; abas: unknown[] }>(
    await chamar("/api/planilha/estrutura", {}),
  );
  expect(
    (
      await chamar("/api/planilha/mapa", {
        ...estrutura,
        mapa: [
          { aba: ABA, turmaOriginalId: turmas.A },
          { aba: `${SERIE} B`, turmaOriginalId: turmas.B },
        ],
      })
    ).status,
  ).toBe(200);
});

afterAll(async () => {
  await chamar("/api/planilha/desconectar", {}).catch(() => undefined);
  if (banco) {
    await limpar();
    await banco.end();
  }
  await google?.fechar();
});

describe("ordenação da planilha após a transferência", () => {
  it("move a aluna para a posição alfabética e mantém os envios seguintes no aluno correto", async () => {
    await salvar(turmas.A, DIA, [alunos.bruna]);
    await salvar(turmas.B, DIA, []);
    await enviar(turmas.A);
    await enviar(turmas.B);
    expect(google.vinculos(ABA)).toEqual([
      { linha: 2, alunoId: alunos.bruna },
      { linha: 3, alunoId: alunos.erica },
    ]);
    expect(
      (
        await chamar(
          `/api/alunos/${alunos.agata}`,
          {
            turmaId: turmas.A,
            turmaOriginalId: turmas.A,
          },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    await enviar(turmas.A);
    const vinculos = [
      { linha: 2, alunoId: alunos.agata },
      { linha: 3, alunoId: alunos.bruna },
      { linha: 5, alunoId: alunos.erica },
    ];
    expect(google.vinculos(ABA)).toEqual(vinculos);
    expect([2, 3, 4, 5].map((linha) => google.valor(ABA, linha, 1))).toEqual([
      "QA Ágata",
      "QA Bruna",
      "Conferência manual",
      "QA Érica",
    ]);
    expect(google.valor(ABA, 2, 2)).toBe("P");
    expect(google.valor(ABA, 3, 2)).toBe("F");
    expect(google.valor(ABA, 5, 2)).toBe("P");
    expect(google.valor(ABA, 4, 2)).toBe("Texto manual");
    expect(google.valor(ABA, 4, 3)).toBe("Auxiliar manual");
    expect(google.formulaDe(ABA, 3, 3)).toBe("=1+2");
    expect(google.formulaDe(ABA, 5, 3)).toBe("=4+5");

    await salvar(turmas.A, "2026-09-11", [alunos.agata]);
    await enviar(turmas.A, "2026-09-11");
    const cabecalho = Array.from({ length: 10 }, (_, indice) => google.valor(ABA, 1, indice + 1));
    const coluna = cabecalho.indexOf("11/09/2026") + 1;
    expect(coluna).toBeGreaterThan(0);
    expect(google.valor(ABA, 2, coluna)).toBe("F");
    expect(google.valor(ABA, 3, coluna)).toBe("P");
    expect(google.valor(ABA, 5, coluna)).toBe("P");
    expect(google.valor(ABA, 3, 2)).toBe("F");
    expect(google.vinculos(ABA)).toEqual(vinculos);

    const escritas = google.chamadas().filter((acao) => acao === "gravar").length;
    await enviar(turmas.A, "2026-09-11");
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritas);
    expect(google.vinculos(ABA)).toEqual(vinculos);
    expect(google.valor(ABA, 6, 1)).toBe("");
  });
});
