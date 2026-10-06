// Reconexão OAuth preserva os destinos mensais e retoma o envio das turmas.
// Todas as credenciais e respostas do Google são sintéticas e locais.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const MES = "2026-09";
const DIA = `${MES}-30`;
const daSerie =
  "select id from turmas where serie_id in (select id from series where nome = 'QA Reconexão')";
const camposVinculo = `google_refresh_token, google_planilha_id, google_planilha_nome,
  esquema, assinatura_esquema, esquema_em, ativa, modo, modo_completo_ate, envio_automatico`;

let banco: pg.Client;
let google: GoogleFalso;
let cookieAdmin = "";
let cookieCoordenacao = "";
const turmas = { A: "", B: "" };
const alunos = { A: "", B: "" };

function chamar(caminho: string, corpo?: unknown, cookie = cookieAdmin, origem = APP_URL) {
  return fetch(`${APP_URL}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: {
      Origin: origem,
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

async function vinculo() {
  const resultado = await banco.query<Record<string, unknown>>(
    `select ${camposVinculo} from integracoes_planilha where id = 'principal'`,
  );
  const linha = resultado.rows[0];
  if (!linha) throw new Error("Vínculo sintético ausente.");
  return linha;
}

async function iniciar(opcoes: Record<string, unknown> = { reconectar: true, mes: MES }) {
  const resposta = await chamar("/api/planilha/google/iniciar", {
    finalidade: "FREQUENCIA",
    ...opcoes,
  });
  const { url } = await dados<{ url: string }>(resposta);
  const cookie = resposta.headers
    .getSetCookie()
    .find((item) => item.startsWith("frequenciapp_google_estado="))
    ?.split(";")[0];
  const state = new URL(url).searchParams.get("state");
  if (!cookie || !state) throw new Error("Estado OAuth sintético ausente.");
  return { cookie, state };
}

async function retornar(
  pedido: Awaited<ReturnType<typeof iniciar>>,
  opcoes: { state?: string; cancelar?: boolean; cookie?: string } = {},
) {
  const parametros = new URLSearchParams({
    state: opcoes.state ?? pedido.state,
    ...(opcoes.cancelar ? { error: "access_denied" } : { code: google.codigoAutorizacao() }),
  });
  const resposta = await chamar(
    `/api/planilha/google/retorno?${parametros}`,
    undefined,
    `${opcoes.cookie ?? cookieAdmin}; ${pedido.cookie}`,
  );
  expect([302, 303, 307]).toContain(resposta.status);
  const destino = resposta.headers.get("location");
  if (!destino) throw new Error("Retorno OAuth sem destino.");
  return new URL(destino);
}

async function limpar() {
  await banco.query(`delete from sincronizacoes_planilha where turma_original_id in (${daSerie})`);
  await banco.query(
    `update integracoes_planilha set ativa = false, envio_automatico = false,
      google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
      esquema = null, assinatura_esquema = null, esquema_em = null,
      modo = 'CONSERVADOR', modo_completo_ate = null where id = 'principal'`,
  );
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(`delete from turmas where id in (${daSerie})`);
  await banco.query("delete from series where nome = 'QA Reconexão'");
}

beforeAll(async () => {
  banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await banco.connect();
  await limpar();
  google = await criarGoogleFalso();
  for (const perfil of ["admin", "coordenacao"]) {
    const resposta = await chamar("/api/auth/entrar", {
      login:
        perfil === "admin"
          ? (process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo")
          : "demo@escola.exemplo",
      senha:
        perfil === "admin"
          ? (process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026")
          : "DemoFrequencia2026",
      lembrar: false,
    });
    expect(resposta.status).toBe(200);
    const cookie = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (perfil === "admin") cookieAdmin = cookie;
    else cookieCoordenacao = cookie;
  }
  const { serie } = await dados<{ serie: { id: string } }>(
    await chamar("/api/series", { nome: "QA Reconexão", ordem: 99 }),
    201,
  );
  for (const nome of ["A", "B"] as const) {
    const { turma } = await dados<{ turma: { id: string } }>(
      await chamar("/api/turmas", { serieId: serie.id, nome }),
      201,
    );
    turmas[nome] = turma.id;
    const { aluno } = await dados<{ aluno: { id: string } }>(
      await chamar("/api/alunos", { turmaId: turma.id, nome: `QA Reconexão Aluno ${nome}` }),
      201,
    );
    alunos[nome] = aluno.id;
    await dados(
      await chamar("/api/frequencias", {
        turmaId: turma.id,
        dia: DIA,
        faltas: nome === "A" ? [aluno.id] : [],
        revisao: 0,
      }),
    );
  }
  google.definirAba("QA Histórico", [["Anotação antiga"], ["Conteúdo preservado"]]);
  await google.conectar(banco);
  await dados(
    await chamar("/api/planilha/mensal", {
      turmaOriginalId: turmas.A,
      mes: MES,
    }),
  );
  await banco.query(
    "update integracoes_planilha set envio_automatico = true where id = 'principal'",
  );
});

afterAll(async () => {
  if (banco) {
    await limpar();
    await banco.end();
  }
  if (google) await google.fechar();
});

describe("reconexão Google com destinos mensais existentes", () => {
  it("exige administração e origem permitida sem alterar a integração", async () => {
    const antes = await vinculo();
    const corpo = { reconectar: true, finalidade: "FREQUENCIA", mes: MES };
    expect((await chamar("/api/planilha/google/iniciar", corpo, "")).status).toBe(401);
    expect((await chamar("/api/planilha/google/iniciar", corpo, cookieCoordenacao)).status).toBe(
      403,
    );
    expect(
      (await chamar("/api/planilha/google/iniciar", corpo, cookieAdmin, "https://externo.exemplo"))
        .status,
    ).toBe(403);
    expect(
      (await chamar("/api/planilha/google/iniciar", { ...corpo, mes: "2026-13" })).status,
    ).toBe(400);
    expect(await vinculo()).toEqual(antes);
  });

  it("mantém o vínculo ao cancelar ou receber um estado diferente", async () => {
    const antes = await vinculo();
    const cancelada = await retornar(await iniciar(), { cancelar: true });
    expect(cancelada.searchParams.get("google")).toBe("cancelado");
    const invalida = await retornar(await iniciar(), { state: "estado-invalido" });
    expect(invalida.searchParams.get("google")).not.toBe("reconectado");
    expect(await vinculo()).toEqual(antes);
  });

  it("preserva o token anterior se o Google recusar a autorização ou o acesso ao arquivo", async () => {
    for (const falha of ["autorizacao", "arquivo"]) {
      const pedido = await iniciar();
      const antes = await vinculo();
      google.recusarAutorizacao(falha === "autorizacao");
      google.recusarLeituras(falha === "arquivo");
      try {
        const destino = await retornar(pedido);
        expect(destino.searchParams.get("google")).not.toBe("reconectado");
        expect(await vinculo()).toEqual(antes);
      } finally {
        google.recusarAutorizacao(false);
        google.recusarLeituras(false);
      }
    }
  });

  it("preserva a conexão atualizada por outra sessão durante a autorização", async () => {
    const pedido = await iniciar();
    await google.conectar(banco);
    const concorrente = await vinculo();
    const destino = await retornar(pedido);
    expect(destino.searchParams.get("google")).not.toBe("reconectado");
    expect(await vinculo()).toEqual(concorrente);
  });

  it("renova a credencial preservando o mapa mensal, o arquivo e as opções", async () => {
    google.recusarAutorizacao(true);
    const falha = await chamar("/api/planilha/mensal", { turmaOriginalId: turmas.B, mes: MES });
    expect(await dados(falha, 409)).toMatchObject({ codigo: "GOOGLE_RECONECTAR" });
    const antes = await vinculo();
    const pedido = await iniciar();
    google.recusarAutorizacao(false);
    const destino = await retornar(pedido);
    expect(destino.searchParams.get("google")).toBe("reconectado");
    expect(destino.searchParams.get("googleFinalidade")).toBe("FREQUENCIA");
    expect(destino.searchParams.get("googleMes")).toBe(MES);
    const depois = await vinculo();
    expect(depois.google_refresh_token).not.toBe(antes.google_refresh_token);
    expect({ ...depois, google_refresh_token: null }).toEqual({
      ...antes,
      google_refresh_token: null,
    });
    const auditoria = await banco.query<{ acao: string }>(
      "select acao from auditoria where alvo = 'integracao:principal' order by criado_em desc limit 1",
    );
    expect(auditoria.rows[0]?.acao).toBe("planilha.google.reconectar");
    const publica = await chamar("/api/planilha");
    expect(publica.status).toBe(200);
    expect(await publica.text()).not.toContain("frequenciapp-teste:");
  });

  it("retoma o preparo e envia todas as turmas sem duplicar abas nem perder o histórico", async () => {
    const abas: string[] = [];
    for (const nome of ["A", "B"] as const) {
      const mensal = await dados<{ aba: string; criada: boolean }>(
        await chamar("/api/planilha/mensal", { turmaOriginalId: turmas[nome], mes: MES }),
      );
      expect(mensal.criada).toBe(nome === "B");
      abas.push(mensal.aba);
    }
    const previa = await dados<{
      planos: { aba: string; turmaOriginalId: string; planoHashTurma: string }[];
    }>(await chamar("/api/planilha/simular", { todas: true, de: DIA, ate: DIA }));
    expect(previa.planos).toHaveLength(2);
    for (const plano of previa.planos) {
      const envio = await dados<{ resultados: { resultado: string }[] }>(
        await chamar("/api/planilha/aplicar", {
          turmaOriginalId: plano.turmaOriginalId,
          aba: plano.aba,
          de: DIA,
          ate: DIA,
          planoHashGeral: plano.planoHashTurma,
        }),
      );
      expect(envio.resultados).toMatchObject([{ resultado: "sucesso" }]);
      const cabecalho = Array.from({ length: 32 }, (_, indice) =>
        google.valor(plano.aba, 1, indice + 1),
      );
      const coluna = cabecalho.indexOf("30/09/2026") + 1;
      expect(coluna).toBeGreaterThan(0);
      expect(google.valor(plano.aba, 2, coluna)).toBe(
        plano.turmaOriginalId === turmas.A ? "F" : "P",
      );
    }
    expect(google.abas().sort()).toEqual(["QA Histórico", ...abas].sort());
    expect(google.valor("QA Histórico", 2, 1)).toBe("Conteúdo preservado");
    const historico = await banco.query(
      `select turma_original_id from sincronizacoes_planilha
        where turma_original_id in (${daSerie}) and resultado = 'SUCESSO'`,
    );
    expect(historico.rows).toHaveLength(2);
  });

  it("preserva a estrutura ao selecionar novamente o mesmo arquivo", async () => {
    const antes = await vinculo();
    await dados(
      await chamar("/api/planilha/google/selecionar", {
        id: "planilha-sintetica",
        finalidade: "FREQUENCIA",
      }),
    );
    expect(await vinculo()).toEqual(antes);
  });

  it("mantém a troca de conta explícita com seleção de arquivo pendente", async () => {
    const destino = await retornar(await iniciar({}));
    expect(destino.searchParams.get("google")).toBe("conectado");
    const depois = await vinculo();
    expect(depois).toMatchObject({
      ativa: false,
      google_planilha_id: null,
      google_planilha_nome: null,
      esquema: null,
      assinatura_esquema: null,
      esquema_em: null,
    });
    expect(depois.google_refresh_token).toBeTruthy();
  });
});
