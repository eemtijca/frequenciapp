// Diagnóstico administrativo mensal contra o Google sintético, sem gravação externa.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import type { AbaEsquema } from "../../src/domain/planilha";
import type { DiagnosticoPlanilha } from "../../src/domain/planilha-diagnostico";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const ABA = "QA Diagnóstico A";
const MENSAL = "QA Diagnóstico B · Outubro";
const GERACAO = "9434cfdd-3b68-478b-938f-dc2bf34e41b8";
const valores = [
  ["Aluno", "01/10/2026"],
  ["QA Nome reservado", "P"],
];
let banco: pg.Client;
let google: GoogleFalso;
let cookieAdmin = "";
let cookieCoordenacao = "";
let serieId = "";
const turmas = { A: "", B: "" };

function chamar(caminho: string, cookie = cookieAdmin) {
  return fetch(`${APP_URL}${caminho}`, { headers: { Cookie: cookie, Origin: APP_URL } });
}

function enviar(caminho: string, corpo: unknown) {
  return fetch(`${APP_URL}${caminho}`, {
    method: "POST",
    headers: { Cookie: cookieAdmin, Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function diagnostico(mes = "2026-10"): Promise<DiagnosticoPlanilha> {
  const resposta = await chamar(`/api/planilha/diagnostico?mes=${mes}`);
  expect(resposta.status).toBe(200);
  expect(resposta.headers.get("cache-control")).toContain("no-store");
  return ((await resposta.json()) as { diagnostico: DiagnosticoPlanilha }).diagnostico;
}

async function limpar() {
  await banco.query(
    `update integracoes_planilha set ativa = false, envio_automatico = false,
      google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
      esquema = null, assinatura_esquema = null, esquema_em = null,
      modo = 'CONSERVADOR', modo_completo_ate = null where id = 'principal'`,
  );
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QA Diagnóstico')",
  );
  await banco.query("delete from series where nome = 'QA Diagnóstico'");
}

beforeAll(async () => {
  banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await banco.connect();
  await limpar();
  google = await criarGoogleFalso();
  for (const admin of [true, false]) {
    const resposta = await fetch(`${APP_URL}/api/auth/entrar`, {
      method: "POST",
      headers: { Origin: APP_URL, "Content-Type": "application/json" },
      body: JSON.stringify({
        login: admin
          ? (process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo")
          : "demo@escola.exemplo",
        senha: admin
          ? (process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026")
          : "DemoFrequencia2026",
      }),
    });
    expect(resposta.status).toBe(200);
    const cookie = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (admin) cookieAdmin = cookie;
    else cookieCoordenacao = cookie;
  }
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ('QA Diagnóstico', 99) returning id",
  );
  serieId = serie.rows[0]?.id ?? "";
  for (const nome of ["A", "B"] as const) {
    const turma = await banco.query<{ id: string }>(
      "insert into turmas (nome, serie_id) values ($1, $2::uuid) returning id",
      [nome, serieId],
    );
    turmas[nome] = turma.rows[0]?.id ?? "";
  }
});

beforeEach(async () => {
  google.recusarAutorizacao(false);
  google.recusarLeituras(false);
  google.definirAba(ABA, valores);
  google.definirAba(MENSAL, valores, {
    mensal: { turmaOriginalId: turmas.B, mes: "2026-10", geracao: GERACAO, vinculos: [] },
  });
  await google.conectar(banco);
  await banco.query("update integracoes_planilha set esquema = null where id = 'principal'");
  const resposta = await fetch(`${APP_URL}/api/planilha/estrutura`, {
    method: "POST",
    headers: { Cookie: cookieAdmin, Origin: APP_URL, "Content-Type": "application/json" },
    body: "{}",
  });
  expect(resposta.status).toBe(200);
  const estrutura = (await resposta.json()) as { abas: AbaEsquema[] };
  const mensal = estrutura.abas.find((aba) => aba.nome === MENSAL)?.mensal;
  expect(mensal).toBeDefined();
  const esquema = {
    planilha: { nome: "Planilha de teste", url: "https://docs.google.com/spreadsheets/d/teste" },
    mapa: [
      { aba: ABA, turmaOriginalId: turmas.A },
      { aba: MENSAL, ...mensal },
    ],
    abas: estrutura.abas,
    atualizadoEm: new Date().toISOString(),
  };
  await banco.query(
    `update integracoes_planilha set esquema = $1::jsonb, envio_automatico = false,
      modo = 'CONSERVADOR', modo_completo_ate = null where id = 'principal'`,
    [JSON.stringify(esquema)],
  );
});

afterAll(async () => {
  await limpar();
  await google.fechar();
  await banco.end();
});

describe("diagnóstico da configuração mensal", () => {
  it("exige administração e mês válido", async () => {
    expect((await chamar("/api/planilha/diagnostico?mes=2026-10", "")).status).toBe(401);
    expect((await chamar("/api/planilha/diagnostico?mes=2026-10", cookieCoordenacao)).status).toBe(
      403,
    );
    expect((await chamar("/api/planilha/diagnostico?mes=2026-13")).status).toBe(400);
    expect((await chamar("/api/planilha/diagnostico")).status).toBe(400);
    expect((await enviar("/api/planilha/estrutura", { mes: "2026-13" })).status).toBe(400);
    expect((await enviar("/api/planilha/estrutura", { mes: 202610 })).status).toBe(400);
    expect((await enviar("/api/planilha/estrutura", { desconhecido: true })).status).toBe(400);
  });

  it("confere a planilha pausada sem ativar envios nem expor nomes de alunos", async () => {
    await banco.query("update integracoes_planilha set ativa = false where id = 'principal'");
    const antes = google.chamadas().length;
    const resultado = await diagnostico();
    expect(resultado.conexao).toEqual({ conectada: true, verificada: true, erro: null });
    expect(resultado.ativa).toBe(false);
    expect(resultado.envioAutomatico).toBe(false);
    expect(resultado.turmas.find((turma) => turma.id === turmas.A)).toMatchObject({
      tipo: "legado",
      situacao: "pronta",
    });
    expect(resultado.turmas.find((turma) => turma.id === turmas.B)).toMatchObject({
      tipo: "mensal",
      situacao: "pronta",
    });
    expect(JSON.stringify(resultado)).not.toContain("QA Nome reservado");
    expect(google.chamadas().slice(antes)).not.toContain("gravar");
    const estado = await banco.query<{ ativa: boolean; envio_automatico: boolean }>(
      "select ativa, envio_automatico from integracoes_planilha where id = 'principal'",
    );
    expect(estado.rows[0]).toEqual({ ativa: false, envio_automatico: false });
  });

  it("mantém erro de autorização como diagnóstico sem apagar a configuração", async () => {
    google.recusarAutorizacao(true);
    const resultado = await diagnostico();
    expect(resultado.conexao).toMatchObject({ conectada: true, verificada: false });
    expect(resultado.conexao.erro).toBeTruthy();
    expect(resultado.estruturaPronta).toBe(false);
    expect(resultado.turmas.find((turma) => turma.id === turmas.A)?.situacao).toBe("indisponivel");
  });

  it("sem conexão não consulta o Google nem apresenta estrutura pronta", async () => {
    await banco.query(
      "update integracoes_planilha set google_refresh_token = null where id = 'principal'",
    );
    const antes = google.chamadas().length;
    const resultado = await diagnostico();
    expect(resultado.conexao).toMatchObject({ conectada: false, verificada: false });
    expect(resultado.estruturaPronta).toBe(false);
    expect(google.chamadas()).toHaveLength(antes);
  });

  it("identifica mês ausente sem usar outro mês ou fazer leituras de seu conteúdo", async () => {
    const antes = google.chamadas().length;
    const resultado = await diagnostico("2026-09");
    expect(resultado.turmas.find((turma) => turma.id === turmas.B)).toMatchObject({
      tipo: "ausente",
      situacao: "sem_aba",
      aba: null,
    });
    expect(
      google
        .chamadas()
        .slice(antes)
        .filter((acao) => acao === "ler"),
    ).toHaveLength(1);
  });

  it("relê cabeçalhos e identifica aba removida sem modificar outras células", async () => {
    google.definirValor(ABA, 1, 2, "02/10/2026");
    google.removerAba(MENSAL);
    const antes = google.chamadas().length;
    const resultado = await diagnostico();
    expect(resultado.turmas.find((turma) => turma.id === turmas.A)?.situacao).toBe(
      "estrutura_alterada",
    );
    expect(resultado.turmas.find((turma) => turma.id === turmas.B)?.situacao).toBe("sem_aba");
    expect(resultado.estruturaPronta).toBe(false);
    expect(google.valor(ABA, 2, 2)).toBe("P");
    expect(google.chamadas().slice(antes)).not.toContain("gravar");
  });

  it("recupera o cabeçalho do mês escolhido sem reler ou gravar os demais meses", async () => {
    const historica = "QA Diagnóstico B · Setembro";
    google.definirAba(
      historica,
      [
        ["Aluno", "01/09/2026"],
        ["QA Nome reservado", "P"],
      ],
      {
        mensal: {
          turmaOriginalId: turmas.B,
          mes: "2026-09",
          geracao: "9c051cbf-718e-4081-ad4a-1e3869b45a86",
          vinculos: [],
        },
      },
    );
    try {
      const resposta = await enviar("/api/planilha/estrutura", {});
      expect(resposta.status).toBe(200);
      const inicial = (await resposta.json()) as {
        abas: AbaEsquema[];
        conferenciaHash: string;
      };
      const mapa = inicial.abas.map((aba) =>
        aba.mensal
          ? { aba: aba.nome, ...aba.mensal }
          : { aba: aba.nome, turmaOriginalId: turmas.A },
      );
      expect((await enviar("/api/planilha/mapa", { ...inicial, mapa })).status).toBe(200);
      google.definirValor(MENSAL, 1, 2, "02/10/2026");
      google.definirValor(historica, 1, 2, "02/09/2026");
      const alterado = await diagnostico();
      expect(alterado.turmas.find((turma) => turma.id === turmas.B)?.situacao).toBe(
        "estrutura_alterada",
      );
      const antes = google.chamadas().length;
      const conferida = await enviar("/api/planilha/estrutura", { mes: "2026-10" });
      expect(conferida.status).toBe(200);
      const atual = (await conferida.json()) as typeof inicial;
      const historicaAnterior = inicial.abas.find((aba) => aba.nome === historica);
      const historicaAtual = atual.abas.find((aba) => aba.nome === historica);
      expect(historicaAtual?.assinatura).toBe(historicaAnterior?.assinatura);
      expect(historicaAtual?.colunas.some((coluna) => coluna.data === "2026-09-01")).toBe(true);
      expect(
        atual.abas
          .find((aba) => aba.nome === MENSAL)
          ?.colunas.some((coluna) => coluna.data === "2026-10-02"),
      ).toBe(true);
      expect((await enviar("/api/planilha/mapa", { ...atual, mapa })).status).toBe(200);
      const recuperado = await diagnostico();
      expect(recuperado.turmas.find((turma) => turma.id === turmas.B)?.situacao).toBe("pronta");
      expect(recuperado.resumo.prontas).toBe(alterado.resumo.prontas + 1);
      expect(recuperado.resumo.revisar).toBe(alterado.resumo.revisar - 1);
      expect(google.chamadas().slice(antes)).not.toContain("gravar");
      expect(google.valor(MENSAL, 2, 2)).toBe("P");
      expect(google.valor(historica, 2, 2)).toBe("P");
    } finally {
      google.removerAba(historica);
    }
  });

  it("recusa uma aba recriada mesmo com cabeçalho idêntico", async () => {
    await banco.query(
      `update integracoes_planilha set esquema = jsonb_set(esquema, '{abas,0,abaId}', '999999')
       where id = 'principal'`,
    );
    const resultado = await diagnostico();
    expect(resultado.turmas.find((turma) => turma.id === turmas.A)).toMatchObject({
      situacao: "bloqueada",
      mensagem: "A aba foi substituída. Confira o vínculo antes de enviar.",
    });
  });

  it("recusa identificação mensal ou datas que não correspondem ao mês", async () => {
    google.definirAba(MENSAL, valores, {
      mensal: {
        turmaOriginalId: turmas.B,
        mes: "2026-09",
        geracao: GERACAO,
        vinculos: [],
      },
    });
    expect((await diagnostico()).turmas.find((turma) => turma.id === turmas.B)?.situacao).toBe(
      "bloqueada",
    );
    google.definirAba(MENSAL, [["Aluno", "01/09/2026"]], {
      mensal: {
        turmaOriginalId: turmas.B,
        mes: "2026-10",
        geracao: GERACAO,
        vinculos: [],
      },
    });
    expect((await diagnostico()).turmas.find((turma) => turma.id === turmas.B)).toMatchObject({
      situacao: "bloqueada",
      mensagem: "A aba mensal contém datas de outro mês.",
    });
  });
});
