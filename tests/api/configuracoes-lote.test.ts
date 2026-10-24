// Contratos do rascunho total de configurações: leitura agregada, lote atômico,
// revisão otimista, autorização e chaves do BI com senha e segredo único.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { ConfiguracoesCompletas, ResultadoLote } from "@/domain/configuracoes";
import type { Feriado } from "@/domain/calendario-letivo";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Lote";
const codigoJustificativa = "QALote";
const codigoLiberador = "qalote";
const diaFeriado = "1991-05-01";
let cookieAdmin = "";
let cookieCoordenacao = "";
let resumoDiarioOriginal = true;
let liberadorEmUso = "";

async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await fetch(`${url}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  expect(resposta.status).toBe(200);
  return resposta.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function chamar(caminho: string, cookie: string, metodo = "GET", corpo?: unknown) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: cookie, Origin: url, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function lerCompleto(cookie = cookieAdmin): Promise<ConfiguracoesCompletas> {
  const resposta = await chamar("/api/configuracoes/completo", cookie);
  expect(resposta.status).toBe(200);
  expect(resposta.headers.get("cache-control")).toContain("no-store");
  return (await resposta.json()) as ConfiguracoesCompletas;
}

async function salvarLote(corpo: unknown, cookie = cookieAdmin) {
  return chamar("/api/configuracoes/lote", cookie, "POST", corpo);
}

async function limpar() {
  await banco.query("delete from justificativas where codigo = $1", [codigoJustificativa]);
  await banco.query("delete from liberadores where codigo = $1", [codigoLiberador]);
  await banco.query("delete from feriados where nome like $1", [`${prefixo}%`]);
  await banco.query("delete from beneficios_frequencia where nome like $1", [`${prefixo}%`]);
  await banco.query("delete from chaves_bi where rotulo like $1", [`${prefixo}%`]);
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  cookieAdmin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  cookieCoordenacao = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  resumoDiarioOriginal = (await lerCompleto()).notificacoes.resumoDiario;
  liberadorEmUso =
    (
      await banco.query<{ codigo: string }>(
        "select liberado_por_codigo as codigo from saidas_antecipadas where liberado_por_codigo is not null group by 1 order by count(*) desc limit 1",
      )
    ).rows[0]?.codigo ?? "";
});

afterAll(async () => {
  try {
    const completo = await lerCompleto();
    await salvarLote({
      revisoes: completo.revisoes,
      desejado: {
        notificacoes: {
          ...completo.notificacoes,
          resumoDiario: resumoDiarioOriginal,
        },
      },
    });
  } catch {
    // A limpeza direta abaixo ainda remove os registros sintéticos.
  }
  await limpar();
  await banco.end();
});

describe("leitura agregada", () => {
  it("exige a administração e devolve todas as seções com revisões", async () => {
    expect((await chamar("/api/configuracoes/completo", "")).status).toBe(401);
    expect((await chamar("/api/configuracoes/completo", cookieCoordenacao)).status).toBe(403);

    const completo = await lerCompleto();
    expect(completo.configuracoes).toBeTruthy();
    expect(completo.notificacoes).toBeTruthy();
    expect(completo.acesso).toBeTruthy();
    expect(completo.ordemAlmoco).toHaveLength(6);
    expect(Array.isArray(completo.beneficios)).toBe(true);
    expect(Array.isArray(completo.justificativas)).toBe(true);
    expect(Array.isArray(completo.liberadores)).toBe(true);
    expect(Array.isArray(completo.feriados)).toBe(true);
    expect(Array.isArray(completo.chavesBi)).toBe(true);
    expect(Object.keys(completo.revisoes).sort()).toEqual(
      [
        "acesso",
        "beneficios",
        "chavesBi",
        "configuracao",
        "feriados",
        "justificativas",
        "liberadores",
        "notificacoes",
        "ordemAlmoco",
      ].sort(),
    );
    expect(JSON.stringify(completo.chavesBi)).not.toContain("segredo");
  });
});

describe("lote atômico", () => {
  it("grava catálogos, calendário, benefícios e notificações em uma única chamada", async () => {
    const antes = await lerCompleto();
    const resposta = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        notificacoes: {
          ...antes.notificacoes,
          resumoDiario: !antes.notificacoes.resumoDiario,
        },
        justificativas: [
          ...antes.justificativas,
          { codigo: codigoJustificativa, rotulo: `${prefixo} Justificativa`, ativo: true },
        ],
        beneficios: [
          ...antes.beneficios,
          {
            id: `novo-${codigoJustificativa}`,
            nome: `${prefixo} Benefício`,
            percentualMinimoFrequencia: 75,
            aulasPorDia: null,
            faltasJustificadasContam: false,
            ativo: true,
          },
        ],
        feriados: [...antes.feriados, { dia: diaFeriado, nome: `${prefixo} Feriado` }],
      },
    });
    expect(resposta.status).toBe(200);
    const resultado = (await resposta.json()) as ResultadoLote;

    expect(resultado.completo.notificacoes.resumoDiario).toBe(!antes.notificacoes.resumoDiario);
    expect(
      resultado.completo.justificativas.some((item) => item.codigo === codigoJustificativa),
    ).toBe(true);
    expect(resultado.completo.beneficios.some((item) => item.nome === `${prefixo} Benefício`)).toBe(
      true,
    );
    expect(resultado.completo.feriados).toContainEqual({
      dia: diaFeriado,
      nome: `${prefixo} Feriado`,
    });
    expect(resultado.completo.revisoes.justificativas).not.toBe(antes.revisoes.justificativas);
    expect(resultado.segredosBi).toEqual([]);

    const auditoria = await banco.query<{ alvo: string }>(
      "select alvo from auditoria where acao = 'configuracao.lote' order by criado_em desc limit 1",
    );
    expect(auditoria.rows[0]?.alvo).toContain("justificativas");

    // A leitura seguinte enxerga o lote inteiro.
    const depois = await lerCompleto();
    expect(depois.notificacoes.resumoDiario).toBe(!antes.notificacoes.resumoDiario);
    expect(depois.justificativas.some((item) => item.codigo === codigoJustificativa)).toBe(true);
  });

  it("recusa o lote inteiro quando uma seção está em uso", async () => {
    const antes = await lerCompleto();
    const alvo = antes.liberadores.find((item) => item.codigo === liberadorEmUso);
    if (!alvo) return;
    const resposta = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        notificacoes: {
          ...antes.notificacoes,
          resumoDiario: !antes.notificacoes.resumoDiario,
        },
        liberadores: antes.liberadores.filter((item) => item.codigo !== alvo.codigo),
      },
    });
    expect(resposta.status).toBe(409);
    const erro = (await resposta.json()) as { error: string; codigo?: string };
    expect(erro.codigo).toBe("LIBERADOR_EM_USO");
    expect(erro.error).toContain("em uso");
    expect(erro.error).not.toContain("internet");

    const depois = await lerCompleto();
    expect(depois.notificacoes.resumoDiario).toBe(antes.notificacoes.resumoDiario);
    expect(depois.liberadores).toContainEqual(alvo);
  });

  it("recusa revisão vencida e informa a seção divergente", async () => {
    const antes = await lerCompleto();
    const primeira = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        notificacoes: {
          ...antes.notificacoes,
          resumoDiario: !antes.notificacoes.resumoDiario,
        },
      },
    });
    expect(primeira.status).toBe(200);

    const segunda = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        acesso: { ...antes.acesso, validadePalavraDias: antes.acesso.validadePalavraDias + 1 },
      },
    });
    expect(segunda.status).toBe(409);
    const erro = (await segunda.json()) as { error: string; codigo?: string };
    expect(erro.codigo).toBe("CONFIGURACOES_ALTERADAS");
    expect(erro.error).toContain("Notificações");

    const depois = await lerCompleto();
    expect(depois.acesso.validadePalavraDias).toBe(antes.acesso.validadePalavraDias);
  });

  it("exige senha e devolve o segredo do BI uma única vez", async () => {
    const antes = await lerCompleto();
    const semSenha = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        chavesBi: [
          ...antes.chavesBi,
          { id: `novo-${codigoJustificativa}`, rotulo: `${prefixo} Chave`, escopo: {} },
        ],
      },
    });
    expect(semSenha.status).toBe(400);
    expect(((await semSenha.json()) as { codigo?: string }).codigo).toBe("SENHA_BI_OBRIGATORIA");

    const senhaErrada = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        chavesBi: [
          ...antes.chavesBi,
          { id: `novo-${codigoJustificativa}`, rotulo: `${prefixo} Chave`, escopo: {} },
        ],
      },
      senhaBi: "senha-errada",
    });
    expect(senhaErrada.status).toBe(400);
    expect(((await senhaErrada.json()) as { error: string }).error).toContain(
      "senha do administrador",
    );

    const comSenha = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        chavesBi: [
          ...antes.chavesBi,
          { id: `novo-${codigoJustificativa}`, rotulo: `${prefixo} Chave`, escopo: {} },
        ],
      },
      senhaBi: "DirecaoFrequencia2026",
    });
    expect(comSenha.status).toBe(200);
    const resultado = (await comSenha.json()) as ResultadoLote;
    expect(resultado.segredosBi).toHaveLength(1);
    expect(resultado.segredosBi[0]?.rotulo).toBe(`${prefixo} Chave`);
    expect(resultado.segredosBi[0]?.segredo).toMatch(/^fbi_/);
    expect(JSON.stringify(resultado.completo.chavesBi)).not.toContain(
      resultado.segredosBi[0]?.segredo,
    );

    // A segunda leitura não repete o segredo.
    const depois = await lerCompleto();
    expect(JSON.stringify(depois)).not.toContain(resultado.segredosBi[0]?.segredo);

    // Revoga e limpa o histórico para não deixar chave de teste.
    const revogada = depois.chavesBi.map((item) =>
      item.rotulo === `${prefixo} Chave` ? { ...item, revogada: true } : item,
    );
    const revogar = await salvarLote({
      revisoes: depois.revisoes,
      desejado: { chavesBi: revogada },
      senhaBi: "DirecaoFrequencia2026",
    });
    expect(revogar.status).toBe(200);
    const comRevogada = (await revogar.json()) as ResultadoLote;
    const restantes = comRevogada.completo.chavesBi.filter((item) => item.estado === "ativa");
    const limpar = await salvarLote({
      revisoes: comRevogada.completo.revisoes,
      desejado: { chavesBi: restantes, limparChavesBi: true },
      senhaBi: "DirecaoFrequencia2026",
    });
    expect(limpar.status).toBe(200);
    expect(
      ((await limpar.json()) as ResultadoLote).completo.chavesBi.some(
        (item) => item.rotulo === `${prefixo} Chave`,
      ),
    ).toBe(false);
  });

  it("só a administração grava o lote", async () => {
    const antes = await lerCompleto();
    const resposta = await salvarLote(
      { revisoes: antes.revisoes, desejado: {} },
      cookieCoordenacao,
    );
    expect(resposta.status).toBe(403);
  });

  it("restaura o estado inicial da suíte", async () => {
    const antes = await lerCompleto();
    const resposta = await salvarLote({
      revisoes: antes.revisoes,
      desejado: {
        notificacoes: {
          ...antes.notificacoes,
          resumoDiario: resumoDiarioOriginal,
        },
        justificativas: antes.justificativas.filter((item) => item.codigo !== codigoJustificativa),
        beneficios: antes.beneficios.filter((item) => !item.nome.startsWith(prefixo)),
        feriados: antes.feriados.filter((item: Feriado) => item.dia !== diaFeriado),
      },
    });
    expect(resposta.status).toBe(200);
  });
});
