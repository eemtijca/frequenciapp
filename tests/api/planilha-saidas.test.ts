// Contratos da planilha de saídas, contra a Sheets API sintética: conexão,
// estrutura da aba única, envio, correção no modo completo e remoção.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";
import { CABECALHO_ENTRADAS, CABECALHO_ENTRADAS_ANTERIOR } from "@/domain/planilha-entradas";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
// Mês distinto dos dados sintéticos do seed, enviados no teste OAuth real.
const DIA = "2026-08-10";
const DE = "2026-08-01";
const ATE = "2026-08-31";
const ABA = "Saiu mais cedo";

const CABECALHO = [
  "Data",
  "Aluno",
  "Turma",
  "Momento",
  "Justificativa",
  "Observação",
  "Liberado por",
];

let cookieAdmin = "";
let banco: pg.Client | null = null;
let google: GoogleFalso | null = null;
let serieId = "";
let turmaId = "";
let alunoAnaId = "";
let saidaAnaId = "";

async function conectarBanco(): Promise<pg.Client | null> {
  const conexao = process.env.DATABASE_URL;
  if (!conexao || !conexao.startsWith("postgresql://")) return null;
  const cliente = new pg.Client({ connectionString: conexao });
  await cliente.connect();
  return cliente;
}

async function limparMassa() {
  if (!banco) return;
  await banco.query("delete from sincronizacoes_planilha where finalidade = 'SAIDAS'");
  await banco.query(
    "delete from saidas_antecipadas where aluno_id in (select id from alunos where nome like 'QS %')",
  );
  await banco.query(
    `insert into integracoes_planilha (id, finalidade, ativa, modo, atualizado_em)
     values ('saidas', 'SAIDAS', false, 'CONSERVADOR', now())
     on conflict (id) do update set
       finalidade = 'SAIDAS',
       ativa = false,
       google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
       esquema = null,
       assinatura_esquema = null,
       esquema_em = null,
       modo = 'CONSERVADOR',
       modo_completo_ate = null,
       atualizado_em = now()`,
  );
  await banco.query("delete from alunos where nome like 'QS %'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QS Ano')",
  );
  await banco.query("delete from series where nome = 'QS Ano'");
  await banco.query("delete from liberadores where codigo like 'QPS%'");
}

// A migração não semeia quem libera; a suíte cria e limpa a própria massa.
const LIBERADORES_QA = [
  { codigo: "QPS1", rotulo: "QA Planilha Um" },
  { codigo: "QPS2", rotulo: "QA Planilha Dois" },
];

async function prepararLiberadores() {
  if (!banco) return;
  for (const item of LIBERADORES_QA) {
    await banco.query(
      "insert into liberadores (codigo, rotulo) values ($1, $2) on conflict do nothing",
      [item.codigo, item.rotulo],
    );
  }
}

async function requisicao(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos });
}

async function autenticado(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  cabecalhos.set("Cookie", cookieAdmin);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos });
}

async function json<T>(resposta: Response): Promise<T> {
  return (await resposta.json()) as T;
}

beforeAll(async () => {
  banco = await conectarBanco();
  await limparMassa();
  await prepararLiberadores();
  google = await criarGoogleFalso();

  const entrada = await requisicao("/api/auth/entrar", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL_ADMIN, senha: SENHA_ADMIN }),
  });
  cookieAdmin = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";

  const serie = await json<{ serie: { id: string } }>(
    await autenticado("/api/series", {
      method: "POST",
      body: JSON.stringify({ nome: "QS Ano", ordem: 91 }),
    }),
  );
  serieId = serie.serie.id;

  const turma = await json<{ turma: { id: string } }>(
    await autenticado("/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId, nome: "A" }),
    }),
  );
  turmaId = turma.turma.id;

  const ana = await json<{ aluno: { id: string } }>(
    await autenticado("/api/alunos", {
      method: "POST",
      body: JSON.stringify({ nome: "QS Ana", turmaId }),
    }),
  );
  alunoAnaId = ana.aluno.id;
  await autenticado("/api/alunos", {
    method: "POST",
    body: JSON.stringify({ nome: "QS Bruno", turmaId }),
  });

  const saida = await json<{ saida: { id: string } }>(
    await autenticado("/api/saidas", {
      method: "POST",
      body: JSON.stringify({
        horario: "08:30",
        alunoId: alunoAnaId,
        dia: DIA,
        momento: "aula_1",
        justificativa: "C",
        liberadoPorCodigo: "QPS1",
      }),
    }),
  );
  saidaAnaId = saida.saida.id;

  google.definirAba(ABA, [
    CABECALHO,
    // Linha manual existente, que a integração deve ignorar.
    ["10/08/2026", "QS Bruno", "QS Ano A", "1ª aula", "Consulta", "", "Direção"],
  ]);
});

afterAll(async () => {
  await autenticado("/api/planilha-saidas/desconectar", {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() => undefined);
  await limparMassa();
  await google?.fechar();
  if (banco) await banco.end();
});

describe("planilha de saídas", () => {
  it("coordenação não configura a integração de saídas", async () => {
    const entrada = await requisicao("/api/auth/entrar", {
      method: "POST",
      body: JSON.stringify({
        email: "demo@escola.exemplo",
        senha: "DemoFrequencia2026",
        lembrar: false,
      }),
    });
    const cookieCoord = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
    const resposta = await fetch(`${APP_URL}/api/planilha-saidas`, {
      headers: { Cookie: cookieCoord, Origin: APP_URL },
    });
    expect(resposta.status).toBe(403);
  });

  it("usa a conta Google e lê a estrutura da aba única", async () => {
    if (!google || !banco) throw new Error("Google sintético indisponível.");
    await google.conectar(banco, "SAIDAS");
    const estrutura = await json<{
      planilha: { nome: string; url: string; fuso: string };
      abas: unknown[];
      sugestao: { aba: string } | null;
    }>(
      await autenticado("/api/planilha-saidas/estrutura", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(estrutura.sugestao?.aba).toBe(ABA);

    const mapa = await autenticado("/api/planilha-saidas/mapa", {
      method: "POST",
      body: JSON.stringify({ planilha: estrutura.planilha, abas: estrutura.abas, aba: ABA }),
    });
    expect(mapa.status).toBe(200);
  });

  it("prepara Entradas, remove Sheet1 vazia e reaplica a apresentação sem apagar registros", async () => {
    if (!google) throw new Error("Google sintético indisponível.");
    google.definirAba("Sheet1", []);
    const preparar = () => autenticado("/api/planilha-entradas/preparar", { method: "POST" });
    const criada = await preparar();
    expect(criada.status).toBe(200);
    expect(await criada.json()).toMatchObject({
      criada: true,
      organizada: true,
      sheet1: "removida",
    });
    expect(google.abas()).toEqual([ABA, "Entradas"]);
    expect(CABECALHO_ENTRADAS.map((_, indice) => google?.valor("Entradas", 1, indice + 1))).toEqual(
      CABECALHO_ENTRADAS,
    );
    google.definirValor("Entradas", 2, 2, "QA Entrada manual preservada");
    const repetida = await preparar();
    expect(repetida.status).toBe(200);
    expect(await repetida.json()).toMatchObject({
      criada: false,
      organizada: true,
      sheet1: "ausente",
    });
    expect(google.valor("Entradas", 2, 2)).toBe("QA Entrada manual preservada");
    expect(google.valor(ABA, 2, 2)).toBe("QS Bruno");
    const apresentacao = google.apresentacao("Entradas");
    expect(apresentacao.congeladasLinhas).toBe(1);
    expect(apresentacao.faixas).toHaveLength(1);
    expect(apresentacao.faixas[0]).toMatchObject({
      rowProperties: {
        headerColor: { red: 22 / 255, green: 101 / 255, blue: 52 / 255 },
      },
    });
  });

  it("preserva Sheet1 com conteúdo ou fórmula sem resultado", async () => {
    if (!google) throw new Error("Google sintético indisponível.");
    for (const formulas of [undefined, { Z100: '=IF(TRUE,"","")' }]) {
      google.definirAba("Sheet1", formulas ? [] : [["QA Anotação manual"]], { formulas });
      const resposta = await autenticado("/api/planilha-entradas/preparar", { method: "POST" });
      expect(resposta.status).toBe(200);
      expect(await resposta.json()).toMatchObject({ sheet1: "mantida" });
      expect(google.abas()).toContain("Sheet1");
    }
    google.removerAba("Sheet1");
  });

  it("recusa cabeçalho incompatível sem remover Sheet1 nem substituir conteúdo", async () => {
    if (!google) throw new Error("Google sintético indisponível.");
    google.definirAba("Sheet1", []);
    google.definirAba("Entradas", [["QA Cabeçalho da escola"], ["QA Conteúdo preservado"]]);
    const resposta = await autenticado("/api/planilha-entradas/preparar", { method: "POST" });
    expect(resposta.status).toBe(409);
    expect(google.abas()).toContain("Sheet1");
    expect(google.valor("Entradas", 2, 1)).toBe("QA Conteúdo preservado");
    google.definirAba("Entradas", [CABECALHO_ENTRADAS]);
    google.removerAba("Sheet1");
  });

  it("realinha a aba Entradas do formato anterior e preserva as linhas já enviadas", async () => {
    if (!google) throw new Error("Google sintético indisponível.");
    google.definirAba("Entradas", [
      CABECALHO_ENTRADAS_ANTERIOR,
      [
        "15/06/2026",
        "QS Ana",
        "QS Ano A",
        "08:00 · 1ª aula",
        "Transporte",
        "QA Coordenação",
        "aluno:2026-06-15",
      ],
    ]);
    const resposta = await autenticado("/api/planilha-entradas/preparar", { method: "POST" });
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ criada: false, realinhada: true });
    expect(CABECALHO_ENTRADAS.map((_, indice) => google?.valor("Entradas", 1, indice + 1))).toEqual(
      CABECALHO_ENTRADAS,
    );
    expect([1, 2, 3, 4, 5, 6, 7].map((coluna) => google?.valor("Entradas", 2, coluna))).toEqual([
      "15/06/2026",
      "QS Ana",
      "QS Ano A",
      "08:00 · 1ª aula",
      "Transporte",
      "",
      "QA Coordenação",
    ]);
    // Preparar de novo reconhece o formato atual e não mexe nas linhas.
    const repetida = await autenticado("/api/planilha-entradas/preparar", { method: "POST" });
    expect(await repetida.json()).toMatchObject({ realinhada: false });
    expect(google.valor("Entradas", 2, 7)).toBe("QA Coordenação");
    google.definirAba("Entradas", [CABECALHO_ENTRADAS]);
  });

  it("simula e aplica as saídas novas, sem tocar na linha manual", async () => {
    const simulado = await json<{
      modalidade: string;
      planoHash: string;
      aba: string;
      resumo: { criar: number; substituir: number; remover: number; puladasOcupadas: number };
    }>(
      await autenticado("/api/planilha-saidas/simular", {
        method: "POST",
        body: JSON.stringify({ de: DE, ate: ATE }),
      }),
    );
    expect(simulado.modalidade).toBe("conservador");
    expect(simulado.aba).toBe(ABA);
    expect(simulado.resumo.criar).toBe(1);
    expect(simulado.resumo.puladasOcupadas).toBe(0);

    // Uma recusa vira o último erro do cartão até o próximo envio dar certo.
    google?.recusarGravacoes(true);
    const recusado = await json<{ resultado: string }>(
      await autenticado("/api/planilha-saidas/aplicar", {
        method: "POST",
        body: JSON.stringify({ de: DE, ate: ATE, planoHash: simulado.planoHash }),
      }),
    );
    google?.recusarGravacoes(false);
    expect(recusado.resultado).toBe("falha");
    const comErro = await json<{
      integracao: { ultimoErro: { resultado: string; erro: string | null } | null };
    }>(await autenticado("/api/planilha-saidas"));
    expect(comErro.integracao.ultimoErro?.resultado).toBe("FALHA");
    expect(comErro.integracao.ultimoErro?.erro).toContain(
      "O Google recusou a alteração da planilha",
    );

    const aplicado = await json<{ resultado: string; contagens: Record<string, number> }>(
      await autenticado("/api/planilha-saidas/aplicar", {
        method: "POST",
        body: JSON.stringify({ de: DE, ate: ATE, planoHash: simulado.planoHash }),
      }),
    );
    expect(aplicado.resultado).toBe("sucesso");
    expect(aplicado.contagens.linhasCriadas).toBe(1);
    expect(google?.valor(ABA, 3, 1)).toBe("10/08/2026");
    expect(google?.valor(ABA, 3, 2)).toBe("QS Ana");

    const semErro = await json<{
      integracao: {
        ultimoErro: unknown;
        fuso: string;
        sincronizacoes: { resultado: string; criadoEm: string }[];
      };
    }>(await autenticado("/api/planilha-saidas"));
    expect(semErro.integracao.ultimoErro).toBeNull();
    expect(semErro.integracao.sincronizacoes[0]?.resultado).toBe("SUCESSO");
    expect(semErro.integracao.fuso).toBeTruthy();

    const repetido = await json<{ resumo: { criar: number } }>(
      await autenticado("/api/planilha-saidas/simular", {
        method: "POST",
        body: JSON.stringify({ de: DE, ate: ATE }),
      }),
    );
    expect(repetido.resumo.criar).toBe(0);
  });

  it("exige a prévia antes de aplicar", async () => {
    const resposta = await autenticado("/api/planilha-saidas/aplicar", {
      method: "POST",
      body: JSON.stringify({ de: DE, ate: ATE }),
    });
    expect(resposta.status).toBe(400);
  });

  it("corrige e remove linhas criadas pela integração no modo completo", async () => {
    const destrave = await autenticado("/api/planilha-saidas/modo-completo", {
      method: "POST",
      body: JSON.stringify({ frase: "EDITAR PLANILHA", senha: SENHA_ADMIN, duracaoMinutos: 5 }),
    });
    expect(destrave.status).toBe(200);

    // Troca a justificativa e quem liberou: duas células da linha criada divergem.
    await autenticado(`/api/saidas/${saidaAnaId}`, { method: "DELETE" });
    const nova = await json<{ saida: { id: string } }>(
      await autenticado("/api/saidas", {
        method: "POST",
        body: JSON.stringify({
          horario: "08:30",
          alunoId: alunoAnaId,
          dia: DIA,
          momento: "aula_1",
          justificativa: "O",
          texto: "Liberada mais cedo",
          liberadoPorCodigo: "QPS2",
        }),
      }),
    );
    saidaAnaId = nova.saida.id;

    const simulado = await json<{
      planoHash: string;
      resumo: { substituir: number };
      candidatosRemocao: { linha: number }[];
    }>(
      await autenticado("/api/planilha-saidas/simular", {
        method: "POST",
        body: JSON.stringify({ de: DE, ate: ATE }),
      }),
    );
    expect(simulado.resumo.substituir).toBe(2);
    expect(simulado.candidatosRemocao).toHaveLength(0);

    const aplicado = await json<{ resultado: string }>(
      await autenticado("/api/planilha-saidas/aplicar", {
        method: "POST",
        body: JSON.stringify({ de: DE, ate: ATE, planoHash: simulado.planoHash }),
      }),
    );
    expect(aplicado.resultado).toBe("sucesso");
    expect(google?.valor(ABA, 3, 5)).toBe("Outros");
    expect(google?.valor(ABA, 3, 6)).toBe("Liberada mais cedo");
    expect(google?.valor(ABA, 3, 7)).toBe("QA Planilha Dois");

    // Sem a saída, a linha criada pela integração é candidata e pode sair.
    await autenticado(`/api/saidas/${saidaAnaId}`, { method: "DELETE" });
    const remocao = await json<{
      planoHash: string;
      resumo: { remover: number };
      candidatosRemocao: { linha: number; nome: string }[];
    }>(
      await autenticado("/api/planilha-saidas/simular", {
        method: "POST",
        body: JSON.stringify({ de: DE, ate: ATE, removerLinhas: [3] }),
      }),
    );
    expect(remocao.candidatosRemocao).toHaveLength(1);
    expect(remocao.resumo.remover).toBe(1);

    const removido = await json<{ resultado: string }>(
      await autenticado("/api/planilha-saidas/aplicar", {
        method: "POST",
        body: JSON.stringify({
          de: DE,
          ate: ATE,
          removerLinhas: [3],
          planoHash: remocao.planoHash,
        }),
      }),
    );
    expect(removido.resultado).toBe("sucesso");
    expect(google?.valor(ABA, 3, 2)).toBe("");
  });

  it("volta ao conservador e desconecta", async () => {
    const conservador = await autenticado("/api/planilha-saidas/modo-conservador", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(conservador.status).toBe(200);

    const desconectado = await autenticado("/api/planilha-saidas/desconectar", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(desconectado.status).toBe(200);
    const config = await json<{ integracao: { ativa: boolean; googlePlanilha: unknown } }>(
      await autenticado("/api/planilha-saidas"),
    );
    expect(config.integracao.ativa).toBe(false);
    expect(config.integracao.googlePlanilha).toBeNull();
  });
});
