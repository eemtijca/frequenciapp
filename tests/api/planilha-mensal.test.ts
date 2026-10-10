// Contratos das abas mensais de frequência: destino por mês, histórico legado,
// preparação idempotente e envio automático contra a Sheets API sintética.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { rotuloData } from "../../src/domain/frequencia";
import { diasDaPlanilhaMensal } from "../../src/domain/planilha-mensal";
import { CHAVE_TRAVA_FREQUENCIA } from "../../src/infra/trava-planilha-frequencia";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const LEGADA = "QA Mensal A";
const PERIODO = { de: "2026-09-30", ate: "2026-10-01" };
const MES_CALENDARIO = "2024-02";
const daSerie =
  "select id from turmas where serie_id in (select id from series where nome = 'QA Mensal')";

interface Mensal {
  aba: string;
  mes: string;
  turmaOriginalId: string;
  destino: string;
  criada: boolean;
  atualizada: boolean;
}

interface Plano {
  aba: string;
  turmaOriginalId: string;
  dias: string[];
  semEnvio: boolean;
  planoHashTurma: string;
}

interface Esquema {
  planilha: unknown;
  abas: unknown[];
  mapa: { aba: string; turmaOriginalId: string; mes?: string; destino?: string }[];
}

let banco: pg.Client;
let google: GoogleFalso;
let cookieAdmin = "";
let cookieCoordenacao = "";
const turmas = { A: "", B: "" };
const alunos = { A: "", B: "" };
const mensais: Record<string, Mensal> = {};

function chamar(
  caminho: string,
  metodo: "GET" | "POST" | "PATCH" | "DELETE" = "POST",
  corpo?: unknown,
  cookie = cookieAdmin,
) {
  return fetch(`${APP_URL}${caminho}`, {
    method: metodo,
    headers: {
      Origin: APP_URL,
      Cookie: cookie,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function dados<T>(resposta: Response, status = 200): Promise<T> {
  expect(resposta.status).toBe(status);
  return (await resposta.json()) as T;
}

async function limpar() {
  await banco.query(
    "delete from feriados where nome like 'QA Mensal Calendário%' and dia between '2024-02-01' and '2024-02-29'",
  );
  await banco.query(`delete from sincronizacoes_planilha where turma_original_id in (${daSerie})`);
  await banco.query(
    `update integracoes_planilha set ativa = false, google_refresh_token = null,
       google_planilha_id = null, google_planilha_nome = null, esquema = null,
       assinatura_esquema = null, esquema_em = null, modo = 'CONSERVADOR',
       modo_completo_ate = null, envio_automatico = false where id = 'principal'`,
  );
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(`delete from turmas where id in (${daSerie})`);
  await banco.query("delete from series where nome = 'QA Mensal'");
}

function cabecalho(aba: string) {
  return Array.from({ length: 36 }, (_, indice) => google.valor(aba, 1, indice + 1));
}

function marca(aba: string, data: string) {
  const coluna = cabecalho(aba).indexOf(data) + 1;
  expect(coluna).toBeGreaterThan(0);
  return google.valor(aba, 2, coluna);
}

function preparar(mes: string, turmaOriginalId = turmas.A) {
  return chamar("/api/planilha/mensal", "POST", { turmaOriginalId, mes });
}

async function simular(periodo = PERIODO) {
  return dados<{ planos: Plano[] }>(
    await chamar("/api/planilha/simular", "POST", {
      turmaOriginalId: turmas.A,
      ...periodo,
    }),
  );
}

async function lerEsquema() {
  const { integracao } = await dados<{ integracao: { esquema: Esquema } }>(
    await chamar("/api/planilha", "GET"),
  );
  return integracao.esquema;
}

async function aplicar(plano: Plano, periodo = PERIODO, somenteAlteradas?: boolean) {
  return dados<{ resultados: { aba: string; resultado: string }[] }>(
    await chamar("/api/planilha/aplicar", "POST", {
      turmaOriginalId: turmas.A,
      aba: plano.aba,
      ...periodo,
      planoHashGeral: plano.planoHashTurma,
      ...(somenteAlteradas === undefined ? {} : { somenteAlteradas }),
    }),
  );
}

function planoDaAba(planos: Plano[], aba: string) {
  const plano = planos.find((item) => item.aba === aba);
  expect(plano).toBeDefined();
  if (!plano) throw new Error("Prévia mensal ausente.");
  return plano;
}

async function salvar(dia: string, faltas: string[], turmaId = turmas.A) {
  expect(
    (
      await chamar("/api/frequencias", "POST", {
        turmaId,
        dia,
        faltas,
        revisao: 0,
      })
    ).status,
  ).toBe(200);
}

async function diaLivreDoCalendario(): Promise<string> {
  const ocupadas = await banco.query<{ dia: string }>(
    `select to_char(dia, 'YYYY-MM-DD') as dia from frequencias
      where dia between '2024-02-01' and '2024-02-29'
     union select to_char(dia, 'YYYY-MM-DD') as dia from frequencias_parciais
      where dia between '2024-02-01' and '2024-02-29'
     union select to_char(dia, 'YYYY-MM-DD') as dia from feriados
      where dia between '2024-02-01' and '2024-02-29'`,
  );
  const salvas = new Set(ocupadas.rows.map((linha) => linha.dia));
  const dia = diasDaPlanilhaMensal(MES_CALENDARIO).find((data) => !salvas.has(data));
  if (!dia) throw new Error("Data útil livre ausente na massa mensal de teste.");
  return dia;
}

async function restaurarFormatoAntigo(mensal: Mensal) {
  const datas = Array.from(
    { length: 31 },
    (_, indice) => `${String(indice + 1).padStart(2, "0")}/10/2026`,
  );
  const anterior = cabecalho(mensal.aba);
  const vinculos = google.vinculos(mensal.aba);
  const valores = [
    ["Aluno", "Turma atual", ...datas],
    ...vinculos.map(({ linha }) => [
      google.valor(mensal.aba, linha, 1),
      LEGADA,
      ...datas.map((dia) => {
        const coluna = anterior.indexOf(dia) + 1;
        return coluna ? google.valor(mensal.aba, linha, coluna) : "";
      }),
    ]),
  ];
  google.definirAba(mensal.aba, valores, {
    mensal: {
      turmaOriginalId: mensal.turmaOriginalId,
      mes: mensal.mes,
      geracao: mensal.destino.split(":")[2] ?? "",
      vinculos,
    },
  });
  const antiga = `${LEGADA} · 10-2026`;
  google.renomearAba(mensal.aba, antiga);
  const estrutura = await dados<{ planilha: unknown; abas: unknown[] }>(
    await chamar("/api/planilha/estrutura", "POST", {}),
  );
  const esquema = await lerEsquema();
  await dados(
    await chamar("/api/planilha/mapa", "POST", {
      ...estrutura,
      mapa: esquema.mapa.map((item) =>
        item.destino === mensal.destino ? { ...item, aba: antiga } : item,
      ),
    }),
  );
  return antiga;
}

beforeAll(async () => {
  banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await banco.connect();
  await limpar();
  google = await criarGoogleFalso();
  for (const perfil of ["admin", "coordenacao"]) {
    const entrada = await chamar("/api/auth/entrar", "POST", {
      login: perfil === "admin" ? EMAIL_ADMIN : "demo@escola.exemplo",
      senha: perfil === "admin" ? SENHA_ADMIN : "DemoFrequencia2026",
      lembrar: false,
    });
    expect(entrada.status).toBe(200);
    const cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (perfil === "admin") cookieAdmin = cookie;
    else cookieCoordenacao = cookie;
  }
  const { serie } = await dados<{ serie: { id: string } }>(
    await chamar("/api/series", "POST", { nome: "QA Mensal", ordem: 99 }),
    201,
  );
  for (const nome of ["A", "B"] as const) {
    const { turma } = await dados<{ turma: { id: string } }>(
      await chamar("/api/turmas", "POST", { serieId: serie.id, nome }),
      201,
    );
    turmas[nome] = turma.id;
    const { aluno } = await dados<{ aluno: { id: string } }>(
      await chamar("/api/alunos", "POST", {
        turmaId: turma.id,
        nome: `QA Mensal Aluno ${nome}`,
      }),
      201,
    );
    alunos[nome] = aluno.id;
  }
  google.definirAba(
    LEGADA,
    [
      ["Aluno", "Turma atual", "30/09/2026", "Total"],
      ["QA Mensal Aluno A", LEGADA, "", ""],
    ],
    { formulas: { D2: '=COUNTIF(C2:C2;"F")' } },
  );
  await google.conectar(banco);
  const estrutura = await dados<{ planilha: unknown; abas: unknown[] }>(
    await chamar("/api/planilha/estrutura", "POST", {}),
  );
  await dados(
    await chamar("/api/planilha/mapa", "POST", {
      ...estrutura,
      mapa: [{ aba: LEGADA, turmaOriginalId: turmas.A }],
    }),
  );
  await salvar("2026-09-30", [alunos.A]);
  await salvar("2026-10-01", []);
});

afterAll(async () => {
  if (banco) {
    await limpar();
    await banco.end();
  }
  if (google) await google.fechar();
});

describe("frequência organizada por turma e mês", () => {
  it("exige administração e valida o mês sem criar abas", async () => {
    const corpo = { turmaOriginalId: turmas.A, mes: "2026-09" };
    expect((await chamar("/api/planilha/mensal", "POST", corpo, "")).status).toBe(401);
    expect((await chamar("/api/planilha/mensal", "POST", corpo, cookieCoordenacao)).status).toBe(
      403,
    );
    for (const mes of ["2026-00", "2026-13", "2026-9", "setembro"]) {
      expect((await preparar(mes)).status).toBe(400);
    }
    expect(google.abas()).toEqual([LEGADA]);
  });

  it("impede reorganização durante outro envio da frequência", async () => {
    const antes = google.chamadas();
    await banco.query("begin");
    try {
      await banco.query("select pg_advisory_xact_lock($1::int, $2::int)", [
        CHAVE_TRAVA_FREQUENCIA.namespace,
        CHAVE_TRAVA_FREQUENCIA.recurso,
      ]);
      expect((await preparar("2026-09")).status).toBe(409);
      expect(google.chamadas()).toEqual(antes);
    } finally {
      await banco.query("rollback");
    }
    // Os preparos posteriores prosseguem normalmente após liberar a trava.
  });

  it("confirma o envio legado antes da preparação mensal", async () => {
    const periodo = { de: "2026-09-30", ate: "2026-09-30" };
    const previa = await simular(periodo);
    const resultado = await aplicar(planoDaAba(previa.planos, LEGADA), periodo);
    expect(resultado.resultados).toMatchObject([{ aba: LEGADA, resultado: "sucesso" }]);
    expect(marca(LEGADA, "30/09/2026")).toBe("F");
    expect((await simular(periodo)).planos[0]?.semEnvio).toBe(true);
  });

  it("informa a autorização revogada sem perder a sessão, o mapa ou as frequências", async () => {
    const esquema = await lerEsquema();
    const abas = google.abas();
    const chamadas = google.chamadas();
    google.recusarAutorizacao(true);
    try {
      const resposta = await preparar("2026-09");
      expect(await dados(resposta, 409)).toMatchObject({ codigo: "GOOGLE_RECONECTAR" });
      expect(await lerEsquema()).toEqual(esquema);
      expect(google.abas()).toEqual(abas);
      expect(google.chamadas()).toEqual(chamadas);
      expect(marca(LEGADA, "30/09/2026")).toBe("F");
      const frequencias = await banco.query("select id from frequencias where turma_id = $1", [
        turmas.A,
      ]);
      expect(frequencias.rows).toHaveLength(2);
    } finally {
      google.recusarAutorizacao(false);
    }
  });

  it("prepara nomes de mês e dias úteis sem turma atual nem alteração da aba antiga", async () => {
    for (const [mes, nome, uteis] of [
      ["2026-09", "Setembro", "01 02 03 04 07 08 09 10 11 14 15 16 17 18 21 22 23 24 25 28 29 30"],
      ["2026-10", "Outubro", "01 02 05 06 07 08 09 12 13 14 15 16 19 20 21 22 23 26 27 28 29 30"],
    ] as const) {
      const mensal = await dados<Mensal>(await preparar(mes));
      mensais[mes] = mensal;
      expect(mensal).toMatchObject({
        aba: `${LEGADA} · ${nome}`,
        mes,
        turmaOriginalId: turmas.A,
        criada: true,
        atualizada: false,
      });
      expect(mensal.destino).toBeTruthy();
      const sufixo = `${mes.slice(5)}/${mes.slice(0, 4)}`;
      expect(cabecalho(mensal.aba).filter(Boolean)).toEqual([
        "Aluno",
        ...uteis.split(" ").map((dia) => `${dia}/${sufixo}`),
      ]);
      expect(google.valor(mensal.aba, 2, 1)).toBe("QA Mensal Aluno A");
      expect(google.vinculos(mensal.aba)).toEqual([{ linha: 2, alunoId: alunos.A }]);
    }
    expect(cabecalho(LEGADA).filter(Boolean)).toEqual([
      "Aluno",
      "Turma atual",
      "30/09/2026",
      "Total",
    ]);
    expect(marca(LEGADA, "30/09/2026")).toBe("F");
    expect(google.formulaDe(LEGADA, 2, 4)).toBe('=COUNTIF(C2:C2;"F")');
  });

  it("reutiliza o destino preparado e não duplica abas ou alunos", async () => {
    const antes = google.abas();
    const repetida = await dados<Mensal>(await preparar("2026-09"));
    expect(repetida).toEqual({ ...mensais["2026-09"], criada: false });
    expect(google.abas()).toEqual(antes);
    expect(google.vinculos(repetida.aba)).toEqual([{ linha: 2, alunoId: alunos.A }]);
  });

  it("salva a mesma turma em meses distintos e recusa duplicidade do mesmo período", async () => {
    const esquema = await lerEsquema();
    const setembro = esquema.mapa.find((item) => item.mes === "2026-09");
    const outubro = esquema.mapa.find((item) => item.mes === "2026-10");
    expect(setembro?.turmaOriginalId).toBe(turmas.A);
    expect(outubro?.turmaOriginalId).toBe(turmas.A);
    expect((await chamar("/api/planilha/mapa", "POST", esquema)).status).toBe(200);
    expect(
      (
        await chamar("/api/planilha/mapa", "POST", {
          ...esquema,
          mapa: [...esquema.mapa, setembro],
        })
      ).status,
    ).toBe(400);
  });

  it("mantém uma única aba ao preparar o mesmo mês simultaneamente", async () => {
    const estruturaAnterior = await lerEsquema();
    const respostas = await Promise.all([
      preparar("2026-10", turmas.B),
      preparar("2026-10", turmas.B),
    ]);
    expect(respostas.some((resposta) => resposta.status === 200)).toBe(true);
    const repetida = await dados<Mensal>(await preparar("2026-10", turmas.B));
    expect(repetida).toMatchObject({ criada: false, turmaOriginalId: turmas.B, mes: "2026-10" });
    expect(google.abas().filter((nome) => nome === repetida.aba)).toHaveLength(1);
    expect(google.vinculos(repetida.aba)).toEqual([{ linha: 2, alunoId: alunos.B }]);
    // Outra sessão ainda pode salvar a estrutura conferida antes do preparo.
    expect((await chamar("/api/planilha/mapa", "POST", estruturaAnterior)).status).toBe(200);
    const preservado = await lerEsquema();
    expect(preservado.mapa).toContainEqual({
      aba: repetida.aba,
      turmaOriginalId: turmas.B,
      mes: "2026-10",
      destino: repetida.destino,
    });
    expect(preservado.abas).toContainEqual(expect.objectContaining({ nome: repetida.aba }));
  });

  it("separa 30/09 e 01/10 e envia o mês novo mesmo com sucesso no legado", async () => {
    const setembro = mensais["2026-09"];
    const outubro = mensais["2026-10"];
    if (!setembro || !outubro) throw new Error("Abas mensais ausentes.");
    const previa = await simular();
    expect(previa.planos).toHaveLength(2);
    const planoSetembro = planoDaAba(previa.planos, setembro.aba);
    const planoOutubro = planoDaAba(previa.planos, outubro.aba);
    expect(planoSetembro.dias).toEqual(["2026-09-30"]);
    expect(planoOutubro.dias).toEqual(["2026-10-01"]);
    expect(planoSetembro.semEnvio).toBe(false);
    expect(planoOutubro.semEnvio).toBe(false);
    expect(
      (
        await chamar("/api/planilha/aplicar", "POST", {
          turmaOriginalId: turmas.A,
          aba: outubro.aba,
          ...PERIODO,
          planoHashGeral: planoSetembro.planoHashTurma,
        })
      ).status,
    ).toBe(409);
    expect((await aplicar(planoSetembro)).resultados).toMatchObject([
      { aba: setembro.aba, resultado: "sucesso" },
    ]);
    expect(marca(setembro.aba, "30/09/2026")).toBe("F");
    expect(marca(outubro.aba, "01/10/2026")).toBe("");
    expect((await aplicar(planoOutubro)).resultados).toMatchObject([
      { aba: outubro.aba, resultado: "sucesso" },
    ]);
    expect(marca(outubro.aba, "01/10/2026")).toBe("P");
    expect(cabecalho(setembro.aba)).not.toContain("01/10/2026");
    expect(cabecalho(outubro.aba)).not.toContain("30/09/2026");
    expect((await simular()).planos.every((plano) => plano.semEnvio)).toBe(true);
    const historico = await banco.query<{ destino: string | null }>(
      "select destino from sincronizacoes_planilha where turma_original_id = $1 and resultado = 'SUCESSO'",
      [turmas.A],
    );
    expect(historico.rows.map((item) => item.destino)).toEqual(
      expect.arrayContaining([null, setembro.destino, outubro.destino]),
    );
  });

  it("recusa mês sem aba preparada em vez de enviar para o legado", async () => {
    const antes = google.chamadas().filter((acao) => acao === "gravar").length;
    const resposta = await chamar("/api/planilha/simular", "POST", {
      turmaOriginalId: turmas.A,
      de: "2026-11-01",
      ate: "2026-11-30",
      somenteAlteradas: false,
    });
    expect(resposta.status).toBe(400);
    expect((await resposta.json()) as { error: string }).toMatchObject({
      error: expect.stringMatching(/prepar/i),
    });
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes);
    expect(cabecalho(LEGADA)).not.toContain("01/11/2026");
  });

  it("preserva uma aba manual com o nome mensal em vez de assumir sua autoria", async () => {
    const nome = "QA Mensal A · Novembro";
    google.definirAba(nome, [["Anotações da escola"], ["Conteúdo manual"]]);
    const antes = google.chamadas().filter((acao) => acao === "gravar").length;
    expect((await preparar("2026-11")).status).toBe(409);
    expect(google.valor(nome, 2, 1)).toBe("Conteúdo manual");
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes);
  });

  it("bloqueia uma aba mensal com data de outro mês sem escrever", async () => {
    const outubro = mensais["2026-10"];
    if (!outubro) throw new Error("Aba mensal ausente.");
    const antes = google.chamadas().filter((acao) => acao === "gravar").length;
    const ultimaColuna = cabecalho(outubro.aba).indexOf("30/10/2026") + 1;
    expect(ultimaColuna).toBeGreaterThan(0);
    google.definirValor(outubro.aba, 1, ultimaColuna, "30/09/2026");
    try {
      const resposta = await chamar("/api/planilha/simular", "POST", {
        turmaOriginalId: turmas.A,
        de: "2026-10-01",
        ate: "2026-10-01",
        somenteAlteradas: false,
      });
      expect(resposta.status).toBe(409);
      expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes);
      expect(marca(outubro.aba, "01/10/2026")).toBe("P");
    } finally {
      google.definirValor(outubro.aba, 1, ultimaColuna, "30/10/2026");
    }
    // A próxima conferência recupera o esquema após a correção manual.
    await dados(
      await chamar("/api/planilha/simular", "POST", {
        turmaOriginalId: turmas.A,
        de: "2026-10-01",
        ate: "2026-10-01",
        somenteAlteradas: false,
      }),
    );
  });

  it("envia a chamada de outubro somente à aba de outubro", async () => {
    const outubro = mensais["2026-10"];
    const setembro = mensais["2026-09"];
    if (!outubro || !setembro) throw new Error("Abas mensais ausentes.");
    await dados(await chamar("/api/planilha", "PATCH", { envioAutomatico: true }));
    await salvar("2026-10-02", [alunos.A]);
    await expect
      .poll(
        async () => {
          const registro = await banco.query<{ resultado: string }>(
            `select resultado from sincronizacoes_planilha where turma_original_id = $1
           and destino = $2 and de = '2026-10-02'::date order by criado_em desc limit 1`,
            [turmas.A, outubro.destino],
          );
          return registro.rows[0]?.resultado;
        },
        { timeout: 15_000 },
      )
      .toBe("SUCESSO");
    expect(marca(outubro.aba, "02/10/2026")).toBe("F");
    expect(cabecalho(setembro.aba)).not.toContain("02/10/2026");
    expect(cabecalho(LEGADA)).not.toContain("02/10/2026");
    expect(marca(setembro.aba, "30/09/2026")).toBe("F");
  });

  it("atualiza a aba antiga com dados e histórico de envio, preservando seu destino", async () => {
    const outubro = mensais["2026-10"];
    if (!outubro) throw new Error("Aba mensal ausente.");
    const antiga = await restaurarFormatoAntigo(outubro);
    expect((await lerEsquema()).mapa).toContainEqual(expect.objectContaining({ aba: antiga }));
    expect(marca(antiga, "01/10/2026")).toBe("P");
    expect(marca(antiga, "02/10/2026")).toBe("F");
    // O descarte pedido das colunas de fim de semana não altera as datas úteis.
    google.definirValor(antiga, 2, cabecalho(antiga).indexOf("03/10/2026") + 1, "FJ");
    const atualizada = await dados<Mensal>(await preparar("2026-10"));
    mensais["2026-10"] = atualizada;
    expect(atualizada).toEqual({ ...outubro, criada: false, atualizada: true });
    expect(google.abas()).not.toContain(antiga);
    expect(marca(atualizada.aba, "01/10/2026")).toBe("P");
    expect(marca(atualizada.aba, "02/10/2026")).toBe("F");
    expect(cabecalho(atualizada.aba)).not.toContain("Turma atual");
    expect(cabecalho(atualizada.aba)).not.toContain("03/10/2026");
    expect(cabecalho(atualizada.aba)).not.toContain("04/10/2026");
    expect(google.vinculos(atualizada.aba)).toEqual([{ linha: 2, alunoId: alunos.A }]);
    const esquema = await lerEsquema();
    expect(esquema.mapa.filter((item) => item.destino === outubro.destino)).toEqual([
      { aba: outubro.aba, mes: "2026-10", turmaOriginalId: turmas.A, destino: outubro.destino },
    ]);
    expect(esquema.abas).not.toContainEqual(expect.objectContaining({ nome: antiga }));
    const periodo = { de: "2026-10-01", ate: "2026-10-02" };
    expect((await simular(periodo)).planos.every((plano) => plano.semEnvio)).toBe(true);
    const escritas = google.chamadas().filter((acao) => acao === "gravar").length;
    expect(await dados<Mensal>(await preparar("2026-10"))).toEqual({
      ...atualizada,
      atualizada: false,
    });
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritas);
  });

  it("não informa sucesso ao recusar atualização e confere uma resposta perdida", async () => {
    const outubro = mensais["2026-10"];
    if (!outubro) throw new Error("Aba mensal ausente.");
    const antiga = await restaurarFormatoAntigo(outubro);
    const esquema = await lerEsquema();
    google.recusarGravacoes(true);
    try {
      expect((await preparar("2026-10")).ok).toBe(false);
      expect(google.abas()).toContain(antiga);
      expect(cabecalho(antiga)).toContain("Turma atual");
      expect(await lerEsquema()).toEqual(esquema);
    } finally {
      google.recusarGravacoes(false);
    }
    google.perderProximaResposta();
    const confirmada = await dados<Mensal>(await preparar("2026-10"));
    expect(confirmada).toMatchObject({
      aba: outubro.aba,
      destino: outubro.destino,
      criada: false,
      atualizada: true,
    });
    expect(google.abas()).not.toContain(antiga);
    expect(cabecalho(confirmada.aba)).not.toContain("Turma atual");
    expect(marca(confirmada.aba, "02/10/2026")).toBe("F");
  });

  it("envia o sábado registrado, preserva sua coluna e deixa o domingo apenas no app", async () => {
    const outubro = mensais["2026-10"];
    if (!outubro) throw new Error("Aba mensal ausente.");
    await dados(await chamar("/api/planilha", "PATCH", { envioAutomatico: false }));
    const antes = await dados<{ estado: { alteradasDepois: number } }>(
      await chamar("/api/planilha/estado", "GET"),
    );
    await salvar("2026-10-03", [alunos.A]);
    await salvar("2026-10-04", []);
    const pendente = await dados<{ estado: { alteradasDepois: number } }>(
      await chamar("/api/planilha/estado", "GET"),
    );
    expect(pendente.estado.alteradasDepois).toBe(antes.estado.alteradasDepois + 1);
    const periodo = { de: "2026-10-01", ate: "2026-10-04" };
    const previa = await dados<{ planos: Plano[] }>(
      await chamar("/api/planilha/simular", "POST", {
        turmaOriginalId: turmas.A,
        ...periodo,
        somenteAlteradas: false,
      }),
    );
    const plano = planoDaAba(previa.planos, outubro.aba);
    expect(plano.dias).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect((await aplicar(plano, periodo, false)).resultados).toMatchObject([
      { aba: outubro.aba, resultado: "sucesso" },
    ]);
    expect(marca(outubro.aba, "03/10/2026")).toBe("F");
    expect(cabecalho(outubro.aba)).not.toContain("04/10/2026");
    expect(cabecalho(outubro.aba)).not.toContain("Turma atual");
    const chamadas = await banco.query(
      "select dia from frequencias where turma_id = $1 and dia between '2026-10-03' and '2026-10-04'",
      [turmas.A],
    );
    expect(chamadas.rows).toHaveLength(2);
    const fimDeSemana = await simular({ de: "2026-10-03", ate: "2026-10-04" });
    expect(fimDeSemana.planos).toMatchObject([{ dias: [], semEnvio: true }]);
    const reparada = await dados<Mensal>(await preparar("2026-10"));
    expect(reparada.destino).toBe(outubro.destino);
    expect(marca(outubro.aba, "03/10/2026")).toBe("F");
    expect(cabecalho(outubro.aba)).not.toContain("04/10/2026");
    expect(cabecalho(outubro.aba)).not.toContain("10/10/2026");
    const depois = await dados<{ estado: { alteradasDepois: number } }>(
      await chamar("/api/planilha/estado", "GET"),
    );
    expect(depois.estado.alteradasDepois).toBe(antes.estado.alteradasDepois);
  });

  it("insere automaticamente somente o sábado registrado e mantém as marcas ao preparar", async () => {
    const outubro = mensais["2026-10"];
    if (!outubro) throw new Error("Aba mensal ausente.");
    await dados(await chamar("/api/planilha", "PATCH", { envioAutomatico: true }));
    try {
      await salvar("2026-10-10", []);
      await expect
        .poll(
          async () => {
            const registro = await banco.query<{ resultado: string }>(
              `select resultado from sincronizacoes_planilha where turma_original_id = $1
               and destino = $2 and de = '2026-10-10'::date order by criado_em desc limit 1`,
              [turmas.A, outubro.destino],
            );
            const fila = await banco.query<{ estado: string }>(
              `select estado from fila_planilha where turma_id = $1 and dia = '2026-10-10'::date
               and tipo = 'FREQUENCIA' order by sequencia desc limit 1`,
              [turmas.A],
            );
            return `${registro.rows[0]?.resultado}:${fila.rows[0]?.estado}`;
          },
          { timeout: 15_000 },
        )
        .toBe("SUCESSO:CONCLUIDO");
      expect(marca(outubro.aba, "10/10/2026")).toBe("P");
      expect(cabecalho(outubro.aba)).not.toContain("11/10/2026");
      expect(cabecalho(outubro.aba)).not.toContain("17/10/2026");
      await dados<Mensal>(await preparar("2026-10"));
      expect(marca(outubro.aba, "03/10/2026")).toBe("F");
      expect(marca(outubro.aba, "10/10/2026")).toBe("P");
    } finally {
      await dados(await chamar("/api/planilha", "PATCH", { envioAutomatico: false }));
    }
  });

  it("não libera sábados de outra origem nem recebe calendário externo no preparo", async () => {
    const preparada = await dados<Mensal>(
      await chamar("/api/planilha/mensal", "POST", {
        turmaOriginalId: turmas.B,
        mes: "2026-10",
        sabadosLetivos: ["2026-10-03", "2026-10-10"],
      }),
    );
    expect(cabecalho(preparada.aba)).not.toContain("03/10/2026");
    expect(cabecalho(preparada.aba)).not.toContain("10/10/2026");
    const previa = await dados<{ planos: Plano[] }>(
      await chamar("/api/planilha/simular", "POST", {
        turmaOriginalId: turmas.B,
        de: "2026-10-03",
        ate: "2026-10-04",
        somenteAlteradas: false,
        sabadosLetivos: ["2026-10-03"],
      }),
    );
    expect(previa.planos).toMatchObject([{ dias: [], semEnvio: true }]);
  });

  it("reenvia o histórico ao preparar novamente uma aba mensal excluída", async () => {
    const anterior = mensais["2026-09"];
    if (!anterior) throw new Error("Aba mensal ausente.");
    const periodo = { de: "2026-09-30", ate: "2026-09-30" };
    expect((await simular(periodo)).planos[0]?.semEnvio).toBe(true);
    expect(marca(anterior.aba, "30/09/2026")).toBe("F");

    google.removerAba(anterior.aba);
    const recriada = await dados<Mensal>(await preparar("2026-09"));
    mensais["2026-09"] = recriada;
    expect(recriada).toMatchObject({ aba: anterior.aba, criada: true });
    expect(recriada.destino).not.toBe(anterior.destino);
    expect(marca(recriada.aba, "30/09/2026")).toBe("");
    const previa = await simular(periodo);
    const plano = planoDaAba(previa.planos, recriada.aba);
    expect(plano.semEnvio).toBe(false);
    expect(plano.dias).toEqual(["2026-09-30"]);
    expect((await aplicar(plano, periodo)).resultados).toMatchObject([
      { aba: recriada.aba, resultado: "sucesso" },
    ]);
    expect(marca(recriada.aba, "30/09/2026")).toBe("F");
    expect((await simular(periodo)).planos[0]?.semEnvio).toBe(true);
    const historico = await banco.query<{ destino: string }>(
      `select destino from sincronizacoes_planilha where turma_original_id = $1
         and resultado = 'SUCESSO' and de = '2026-09-30'::date`,
      [turmas.A],
    );
    expect(historico.rows.map((item) => item.destino)).toEqual(
      expect.arrayContaining([anterior.destino, recriada.destino]),
    );
  });
  it("mantém aluno transferido na aba de origem sem recriar turma atual", async () => {
    const outubro = mensais["2026-10"];
    if (!outubro) throw new Error("Aba mensal ausente.");
    await dados(await chamar(`/api/alunos/${alunos.A}`, "PATCH", { turmaId: turmas.B }));
    await salvar("2026-10-05", [alunos.A], turmas.B);
    const periodo = { de: "2026-10-05", ate: "2026-10-05" };
    const plano = planoDaAba((await simular(periodo)).planos, outubro.aba);
    expect((await aplicar(plano, periodo)).resultados).toMatchObject([
      { aba: outubro.aba, resultado: "sucesso" },
    ]);
    expect(marca(outubro.aba, "05/10/2026")).toBe("F");
    expect(google.vinculos(outubro.aba)).toEqual([{ linha: 2, alunoId: alunos.A }]);
    expect(cabecalho(outubro.aba)).not.toContain("Turma atual");
    expect(await dados<Mensal>(await preparar("2026-10"))).toMatchObject({
      aba: outubro.aba,
      destino: outubro.destino,
      criada: false,
      atualizada: false,
    });
    const setembro = mensais["2026-09"];
    if (!setembro) throw new Error("Aba mensal ausente.");
    await salvar("2026-09-26", [alunos.A], turmas.B);
    const sabado = { de: "2026-09-26", ate: "2026-09-26" };
    const planoSabado = planoDaAba((await simular(sabado)).planos, setembro.aba);
    expect(planoSabado.dias).toEqual(["2026-09-26"]);
    expect((await aplicar(planoSabado, sabado)).resultados).toMatchObject([
      { aba: setembro.aba, resultado: "sucesso" },
    ]);
    expect(marca(setembro.aba, "26/09/2026")).toBe("F");
    await dados<Mensal>(await preparar("2026-09"));
    expect(marca(setembro.aba, "26/09/2026")).toBe("F");
  });
  it("alterna o mês visível, preserva o legado e mantém o envio histórico disponível", async () => {
    google.definirAba("QA Anotações", [["Anotações"], ["Preservar"]]);
    for (const [corpo, cookie, status] of [
      [{ mes: "2026-10" }, cookieCoordenacao, 403],
      [{ mes: "2026-13" }, cookieAdmin, 400],
      [{ mes: "2026-08" }, cookieAdmin, 409],
    ] as const)
      expect(
        (await chamar("/api/planilha/mensal/visibilidade", "POST", corpo, cookie)).status,
      ).toBe(status);
    expect(
      (await chamar("/api/planilha/mensal/visibilidade", "POST", { mes: "2026-10" }, "")).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${APP_URL}/api/planilha/mensal/visibilidade`, {
          method: "POST",
          headers: {
            Origin: "https://origem-invalida.exemplo",
            Cookie: cookieAdmin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mes: "2026-10" }),
        })
      ).status,
    ).toBe(403);
    expect(google.abasVisiveis()).toContain(LEGADA);
    const outubro = mensais["2026-10"]?.aba ?? "";
    const setembro = mensais["2026-09"]?.aba ?? "";
    await dados(await chamar("/api/planilha/mensal/visibilidade", "POST", { mes: "2026-10" }));
    expect(google.abasVisiveis().sort()).toEqual(
      [outubro, "QA Mensal B · Outubro", "QA Mensal A · Novembro", "QA Anotações"].sort(),
    );
    expect(marca(LEGADA, "30/09/2026")).toBe("F");
    expect(google.formulaDe(LEGADA, 2, 4)).toBe('=COUNTIF(C2:C2;"F")');
    const previa = await dados<{ planos: Plano[] }>(
      await chamar("/api/planilha/simular", "POST", {
        turmaOriginalId: turmas.A,
        ...PERIODO,
        somenteAlteradas: false,
      }),
    );
    expect(previa.planos.map((plano) => plano.aba).sort()).toEqual([setembro, outubro].sort());
    const periodo = { de: "2026-09-30", ate: "2026-09-30" };
    expect(
      (
        await aplicar(
          planoDaAba(
            (
              await dados<{ planos: Plano[] }>(
                await chamar("/api/planilha/simular", "POST", {
                  turmaOriginalId: turmas.A,
                  ...periodo,
                  somenteAlteradas: false,
                }),
              )
            ).planos,
            setembro,
          ),
          periodo,
          false,
        )
      ).resultados,
    ).toMatchObject([{ aba: setembro, resultado: "sucesso" }]);
    expect(marca(setembro, "30/09/2026")).toBe("F");
    expect(google.abasVisiveis()).not.toContain(setembro);
    await dados(await chamar("/api/planilha/mensal/visibilidade", "POST", { mes: "2026-09" }));
    expect(google.abasVisiveis().sort()).toEqual(
      [setembro, "QA Mensal A · Novembro", "QA Anotações"].sort(),
    );
    await dados(await chamar("/api/planilha/mensal/visibilidade", "POST", { mes: "2026-10" }));
    google.removerAba("QA Anotações");
  });

  it("prepara sem feriado e recria a data liberada no envio da chamada", async () => {
    const dia = await diaLivreDoCalendario();
    const nome = "QA Mensal Calendário livre";
    const periodo = { de: dia, ate: dia };
    let feriadoCriado = false;
    await dados(await chamar("/api/planilha", "PATCH", { envioAutomatico: false }));
    try {
      await dados(await chamar("/api/calendario-letivo", "POST", { dia, nome }), 201);
      feriadoCriado = true;
      const preparada = await dados<Mensal>(await preparar(MES_CALENDARIO));
      expect(preparada).toMatchObject({ mes: MES_CALENDARIO, criada: true });
      const datas = diasDaPlanilhaMensal(MES_CALENDARIO, [], [dia]).map(rotuloData);
      expect(cabecalho(preparada.aba).filter(Boolean)).toEqual(["Aluno", ...datas]);
      expect(google.feriadosDaAba(preparada.aba)).toEqual([dia]);
      expect(google.vinculos(preparada.aba)).toEqual([{ linha: 2, alunoId: alunos.A }]);
      const bloqueada = await dados<{ planos: Plano[] }>(
        await chamar("/api/planilha/simular", "POST", {
          turmaOriginalId: turmas.A,
          ...periodo,
          somenteAlteradas: false,
          feriados: [],
        }),
      );
      expect(bloqueada.planos).toMatchObject([{ dias: [], semEnvio: true }]);
      await dados(await chamar(`/api/calendario-letivo/${dia}`, "DELETE"));
      feriadoCriado = false;
      // O marcador da omissão mantém a aba válida após remover o feriado.
      expect(await dados<Mensal>(await preparar(MES_CALENDARIO))).toMatchObject({
        destino: preparada.destino,
        criada: false,
        atualizada: false,
      });
      expect(cabecalho(preparada.aba).filter(Boolean)).toEqual(["Aluno", ...datas]);
      const cadastro = await banco.query<{ turma_id: string }>(
        "select turma_id from alunos where id = $1",
        [alunos.A],
      );
      const turmaAtual = cadastro.rows[0]?.turma_id;
      if (!turmaAtual) throw new Error("Turma atual ausente na massa mensal de teste.");
      await salvar(dia, [alunos.A], turmaAtual);
      const previa = await simular(periodo);
      const plano = planoDaAba(previa.planos, preparada.aba);
      expect(plano.dias).toEqual([dia]);
      expect((await aplicar(plano, periodo)).resultados).toMatchObject([
        { aba: preparada.aba, resultado: "sucesso" },
      ]);
      expect(marca(preparada.aba, rotuloData(dia))).toBe("F");
      expect(cabecalho(preparada.aba).filter(Boolean).sort()).toEqual(
        ["Aluno", ...diasDaPlanilhaMensal(MES_CALENDARIO).map(rotuloData)].sort(),
      );
      expect(
        cabecalho(preparada.aba).filter((valor) => valor && valor !== rotuloData(dia)),
      ).toEqual(["Aluno", ...datas]);
      expect(google.vinculos(preparada.aba)).toEqual([{ linha: 2, alunoId: alunos.A }]);
      const revisada = await dados<Mensal>(await preparar(MES_CALENDARIO));
      expect(revisada).toMatchObject({ destino: preparada.destino, atualizada: false });
      expect(marca(preparada.aba, rotuloData(dia))).toBe("F");
    } finally {
      if (feriadoCriado) await dados(await chamar(`/api/calendario-letivo/${dia}`, "DELETE"));
    }
  });

  it("recusa retirar feriado com lançamento manual e preserva a coluna", async () => {
    const dia = await diaLivreDoCalendario();
    const preparada = await dados<Mensal>(await preparar(MES_CALENDARIO));
    const coluna = cabecalho(preparada.aba).indexOf(rotuloData(dia)) + 1;
    expect(coluna).toBeGreaterThan(0);
    google.definirValor(preparada.aba, 2, coluna, "FJ");
    let feriadoCriado = false;
    try {
      await dados(
        await chamar("/api/calendario-letivo", "POST", {
          dia,
          nome: "QA Mensal Calendário manual",
        }),
        201,
      );
      feriadoCriado = true;
      const cabecalhoAnterior = cabecalho(preparada.aba);
      const vinculosAnteriores = google.vinculos(preparada.aba);
      const escritas = google.chamadas().filter((acao) => acao === "gravar").length;
      expect(await dados(await preparar(MES_CALENDARIO), 409)).toMatchObject({
        error: expect.stringContaining("Há registros na coluna de um feriado"),
      });
      expect(cabecalho(preparada.aba)).toEqual(cabecalhoAnterior);
      expect(marca(preparada.aba, rotuloData(dia))).toBe("FJ");
      expect(google.vinculos(preparada.aba)).toEqual(vinculosAnteriores);
      expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritas);
      const cabecalhoRestante = cabecalhoAnterior.filter(
        (valor) => valor && valor !== rotuloData(dia),
      );
      const valoresRestantes = cabecalhoRestante.map((data) =>
        google.valor(preparada.aba, 2, cabecalhoAnterior.indexOf(data) + 1),
      );
      // A conferência manual libera somente esta coluna depois de retirar seu conteúdo.
      google.definirValor(preparada.aba, 2, coluna, "");
      expect(await dados<Mensal>(await preparar(MES_CALENDARIO))).toMatchObject({
        destino: preparada.destino,
        criada: false,
        atualizada: true,
      });
      expect(cabecalho(preparada.aba).filter(Boolean)).toEqual(cabecalhoRestante);
      expect(
        cabecalhoRestante.map((_, indice) => google.valor(preparada.aba, 2, indice + 1)),
      ).toEqual(valoresRestantes);
      expect(google.feriadosDaAba(preparada.aba)).toContain(dia);
    } finally {
      if (feriadoCriado) await dados(await chamar(`/api/calendario-letivo/${dia}`, "DELETE"));
    }
  });
});
