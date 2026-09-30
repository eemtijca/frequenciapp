// Contratos dos diretores de turma: cadastro pela administração, emissão,
// troca e revogação da palavra-chave, entrada pelo identificador, recusa de
// toda rota da equipe, estatísticas da turma de origem e parâmetros de acesso.
// Massa com prefixo QD.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { diaDaSemanaIso, diaLocal, diaSeguinte } from "@/domain/frequencia";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const EMAIL_COORD = process.env.TESTE_EMAIL ?? "demo@escola.exemplo";
const SENHA_COORD = process.env.TESTE_SENHA ?? "DemoFrequencia2026";
const IDENTIFICADOR = "qd-diretora";
const NOVA_PALAVRA = "NovaPalavra2026";

let banco: pg.Client | null = null;
let cookieAdmin = "";
let cookieCoord = "";
let cookieDiretor = "";
let serieId = "";
let turmaId = "";
let diretorId = "";
let palavraChave = "";
let alunoRiscoId = "";

interface Diretor {
  id: string;
  identificador: string;
  estado: string;
  primeiroUsoEm: string | null;
  turmas: { turmaId: string; turma: string; inicio: string; fim: string | null }[];
}

interface Parametros {
  validadePalavraDias: number;
  tentativasPorOrigem: number;
  categoriasDiretor: string[];
}

async function conectarBanco(): Promise<pg.Client | null> {
  const conexao = process.env.DATABASE_URL;
  if (!conexao || !conexao.startsWith("postgresql://")) return null;
  const cliente = new pg.Client({ connectionString: conexao });
  await cliente.connect();
  return cliente;
}

async function limparMassa() {
  if (!banco) return;
  await banco.query("delete from usuarios where email like 'qd-%'");
  await banco.query("delete from tentativas_entrada where chave like '%qd-%'");
  const daSerie =
    "select t.id from turmas t join series s on s.id = t.serie_id where s.nome = 'QD Ano'";
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QD Ano')",
  );
  await banco.query("delete from series where nome = 'QD Ano'");
  await banco.query(
    `update parametros_acesso set validade_palavra_dias = 90, sessao_diretor_horas = 12,
       tentativas_por_origem = 10, tentativas_por_login = 30, janela_minutos = 15,
       categorias_diretor = '{faltas}', limite_risco_percentual = 25
     where id = 'principal'`,
  );
}

function chamar(caminho: string, opcoes: RequestInit = {}, cookie = ""): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  if (cookie) cabecalhos.set("Cookie", cookie);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos, redirect: "manual" });
}

async function json<T>(resposta: Response): Promise<T> {
  return (await resposta.json()) as T;
}

async function entrar(corpo: Record<string, unknown>): Promise<Response> {
  return chamar("/api/auth/entrar", { method: "POST", body: JSON.stringify(corpo) });
}

/** Dia letivo mais recente até hoje, no fuso da escola. */
function diaUtilRecente(): string {
  let dia = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
  while (diaDaSemanaIso(dia) > 5) dia = diaSeguinte(dia, -1);
  return dia;
}

function hojeNaEscola(): string {
  return diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
}

function cookieDe(resposta: Response): string {
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Rotas e métodos da API, lidos dos arquivos, com parâmetro trocado por um uuid. */
function rotasDaApi(): { caminho: string; metodo: string }[] {
  const raiz = path.resolve("src/app/api");
  const arquivos: string[] = [];
  const visitar = (diretorio: string) => {
    for (const nome of readdirSync(diretorio)) {
      const caminho = path.join(diretorio, nome);
      if (statSync(caminho).isDirectory()) visitar(caminho);
      else if (nome === "route.ts") arquivos.push(caminho);
    }
  };
  visitar(raiz);
  return arquivos.flatMap((arquivo) => {
    const rota = path
      .relative(raiz, path.dirname(arquivo))
      .split(path.sep)
      .map((parte) => (parte.startsWith("[") ? "00000000-0000-4000-8000-000000000000" : parte))
      .join("/");
    const metodos = [
      ...readFileSync(arquivo, "utf8").matchAll(/export async function (GET|POST|PATCH|DELETE)\b/g),
    ].map((achado) => achado[1] ?? "");
    return metodos.map((metodo) => ({ caminho: `/api/${rota}`, metodo }));
  });
}

beforeAll(async () => {
  banco = await conectarBanco();
  await limparMassa();
  cookieAdmin = cookieDe(await entrar({ email: EMAIL_ADMIN, senha: SENHA_ADMIN }));
  cookieCoord = cookieDe(await entrar({ email: EMAIL_COORD, senha: SENHA_COORD, lembrar: false }));
  const serie = await json<{ serie: { id: string } }>(
    await chamar(
      "/api/series",
      { method: "POST", body: JSON.stringify({ nome: "QD Ano", ordem: 91 }) },
      cookieAdmin,
    ),
  );
  serieId = serie.serie.id;
  const turma = await json<{ turma: { id: string } }>(
    await chamar(
      "/api/turmas",
      { method: "POST", body: JSON.stringify({ serieId, nome: "A" }) },
      cookieAdmin,
    ),
  );
  turmaId = turma.turma.id;
});

afterAll(async () => {
  await limparMassa();
  if (banco) await banco.end();
});

describe("cadastro de diretores pela administração", () => {
  it("recusa a coordenação", async () => {
    const lista = await chamar("/api/diretores", {}, cookieCoord);
    expect(lista.status).toBe(403);
    const parametros = await chamar("/api/parametros-acesso", {}, cookieCoord);
    expect(parametros.status).toBe(403);
  });

  it("cria o diretor com turma, sem palavra-chave", async () => {
    const resposta = await chamar(
      "/api/diretores",
      {
        method: "POST",
        body: JSON.stringify({
          nome: "QD Diretora",
          identificador: IDENTIFICADOR,
          turmaIds: [turmaId],
        }),
      },
      cookieAdmin,
    );
    expect(resposta.status).toBe(201);
    const { diretor } = await json<{ diretor: Diretor }>(resposta);
    diretorId = diretor.id;
    expect(diretor.identificador).toBe(IDENTIFICADOR);
    expect(diretor.estado).toBe("sem_palavra");
    expect(diretor.turmas.map((item) => item.turmaId)).toEqual([turmaId]);
    expect(diretor.turmas[0]?.turma).toBe("QD Ano A");
  });

  it("recusa identificador repetido ou fora do padrão", async () => {
    const repetido = await chamar(
      "/api/diretores",
      { method: "POST", body: JSON.stringify({ nome: "QD Outra", identificador: IDENTIFICADOR }) },
      cookieAdmin,
    );
    expect(repetido.status).toBe(409);
    const invalido = await chamar(
      "/api/diretores",
      { method: "POST", body: JSON.stringify({ nome: "QD Outra", identificador: "qd@escola" }) },
      cookieAdmin,
    );
    expect(invalido.status).toBe(400);
  });

  it("não lista nem altera o diretor pela Equipe", async () => {
    const equipe = await json<{ usuarios: { id: string }[] }>(
      await chamar("/api/usuarios", {}, cookieAdmin),
    );
    expect(equipe.usuarios.some((usuario) => usuario.id === diretorId)).toBe(false);
    const alterar = await chamar(
      `/api/usuarios/${diretorId}`,
      { method: "PATCH", body: JSON.stringify({ papel: "ADMIN" }) },
      cookieAdmin,
    );
    expect(alterar.status).toBe(404);
  });

  it("não deixa entrar antes da emissão", async () => {
    const resposta = await entrar({ login: IDENTIFICADOR, senha: "qualquer-coisa-1" });
    expect(resposta.status).toBe(401);
  });
});

describe("palavra-chave e entrada do diretor", () => {
  it("emite a palavra-chave uma vez, em blocos", async () => {
    const resposta = await chamar(
      `/api/diretores/${diretorId}/palavra-chave`,
      { method: "POST", body: JSON.stringify({}) },
      cookieAdmin,
    );
    expect(resposta.status).toBe(200);
    const dados = await json<{ palavraChave: string; diretor: Diretor }>(resposta);
    palavraChave = dados.palavraChave;
    expect(palavraChave).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(dados.diretor.estado).toBe("emitida");
  });

  it("entra pelo identificador e registra o primeiro uso", async () => {
    const resposta = await entrar({ login: IDENTIFICADOR.toUpperCase(), senha: palavraChave });
    expect(resposta.status).toBe(200);
    const dados = await json<{ usuario: { papel: string } }>(resposta);
    expect(dados.usuario.papel).toBe("DIRETOR_TURMA");
    cookieDiretor = cookieDe(resposta);
    expect(resposta.headers.get("set-cookie")).not.toMatch(/Expires=/i);
    const lista = await json<{ diretores: Diretor[] }>(
      await chamar("/api/diretores", {}, cookieAdmin),
    );
    expect(lista.diretores.find((item) => item.id === diretorId)?.primeiroUsoEm).not.toBeNull();
  });

  it("exige a troca da palavra-chave antes das estatísticas", async () => {
    const hoje = hojeNaEscola();
    const resposta = await chamar(
      `/api/diretor/estatisticas?turmaId=${turmaId}&de=${hoje}&ate=${hoje}`,
      {},
      cookieDiretor,
    );
    expect(resposta.status).toBe(403);
    expect((await json<{ error: string }>(resposta)).error).toContain("Troque a palavra-chave");
  });

  it("recusa toda rota da equipe para o diretor", async () => {
    const publicas = new Set([
      "GET /api/diretor/estatisticas",
      "POST /api/auth/entrar",
      "POST /api/auth/sair",
      "GET /api/auth/sessao",
      "GET /api/saude",
      "POST /api/conta/senha",
      "GET /api/notificacoes/assinatura",
      "POST /api/notificacoes/assinatura",
      "DELETE /api/notificacoes/assinatura",
      "POST /api/notificacoes/teste",
    ]);
    const rotas = rotasDaApi().filter((rota) => !publicas.has(`${rota.metodo} ${rota.caminho}`));
    expect(rotas.length).toBeGreaterThan(50);
    const liberadas: string[] = [];
    for (const rota of rotas) {
      const resposta = await chamar(
        rota.caminho,
        { method: rota.metodo, ...(rota.metodo === "GET" ? {} : { body: "{}" }) },
        cookieDiretor,
      );
      if (resposta.status !== 403)
        liberadas.push(`${rota.metodo} ${rota.caminho} ${resposta.status}`);
    }
    expect(liberadas).toEqual([]);
  });

  it("exige palavra nova diferente da atual e renova a validade", async () => {
    const igual = await chamar(
      "/api/conta/senha",
      {
        method: "POST",
        body: JSON.stringify({ senhaAtual: palavraChave, senhaNova: palavraChave }),
      },
      cookieDiretor,
    );
    expect(igual.status).toBe(400);
    const troca = await chamar(
      "/api/conta/senha",
      {
        method: "POST",
        body: JSON.stringify({ senhaAtual: palavraChave, senhaNova: NOVA_PALAVRA }),
      },
      cookieDiretor,
    );
    expect(troca.status).toBe(200);
    const lista = await json<{ diretores: Diretor[] }>(
      await chamar("/api/diretores", {}, cookieAdmin),
    );
    expect(lista.diretores.find((item) => item.id === diretorId)?.estado).toBe("em_uso");
  });

  it("mostra só a turma do vínculo e recusa consulta malformada", async () => {
    const outra = await json<{ turma: { id: string } }>(
      await chamar(
        "/api/turmas",
        { method: "POST", body: JSON.stringify({ serieId, nome: "B" }) },
        cookieAdmin,
      ),
    );
    const hoje = hojeNaEscola();
    const alheia = await chamar(
      `/api/diretor/estatisticas?turmaId=${outra.turma.id}&de=${hoje}&ate=${hoje}`,
      {},
      cookieDiretor,
    );
    expect(alheia.status).toBe(403);
    expect((await json<{ error: string }>(alheia)).error).toContain("não está entre as suas");
    const invertida = await chamar(
      `/api/diretor/estatisticas?turmaId=${turmaId}&de=${hoje}&ate=${diaSeguinte(hoje, -1)}`,
      {},
      cookieDiretor,
    );
    expect(invertida.status).toBe(400);
    const coordenacao = await chamar(
      `/api/diretor/estatisticas?turmaId=${turmaId}&de=${hoje}&ate=${hoje}`,
      {},
      cookieCoord,
    );
    expect(coordenacao.status).toBe(403);
  });

  it("recorta o período ao vínculo e mostra só as categorias liberadas", async () => {
    if (!banco) return;
    const hoje = hojeNaEscola();
    const inicio = diaSeguinte(hoje, -10);
    await banco.query(
      "update vinculos_diretor set inicio = $2::date where usuario_id = $1 and fim is null",
      [diretorId, inicio],
    );
    const alunos: string[] = [];
    for (const nome of ["QD Aluna Risco", "QD Aluno Presente"]) {
      const criado = await json<{ aluno: { id: string } }>(
        await chamar(
          "/api/alunos",
          { method: "POST", body: JSON.stringify({ nome, turmaId }) },
          cookieAdmin,
        ),
      );
      alunos.push(criado.aluno.id);
    }
    alunoRiscoId = alunos[0] ?? "";
    const salvar = await chamar(
      "/api/frequencias",
      {
        method: "POST",
        body: JSON.stringify({
          dia: diaUtilRecente(),
          turmaId,
          faltas: [alunoRiscoId],
          revisao: 0,
        }),
      },
      cookieCoord,
    );
    expect(salvar.status).toBe(200);

    const consulta = `/api/diretor/estatisticas?turmaId=${turmaId}&de=${diaSeguinte(hoje, -40)}&ate=${hoje}`;
    interface Resposta {
      periodo: { de: string; ate: string } | null;
      estatisticas: {
        alunos: {
          alunoId: string;
          ausencias: number;
          faltas: number | null;
          saidas: number | null;
          diasComChamada: number;
          emRisco: boolean;
        }[];
        resumo: { alunos: number; emRisco: number };
      } | null;
    }
    const resposta = await chamar(consulta, {}, cookieDiretor);
    expect(resposta.status).toBe(200);
    const dados = await json<Resposta>(resposta);
    expect(dados.periodo).toEqual({ de: inicio, ate: hoje });
    expect(dados.estatisticas?.resumo).toMatchObject({ alunos: 2, emRisco: 1 });
    const risco = dados.estatisticas?.alunos.find((aluno) => aluno.alunoId === alunoRiscoId);
    expect(risco).toMatchObject({
      ausencias: 1,
      diasComChamada: 1,
      emRisco: true,
      faltas: null,
      saidas: null,
    });

    await chamar(
      "/api/parametros-acesso",
      {
        method: "PATCH",
        body: JSON.stringify({ categoriasDiretor: ["faltas", "justificativas", "saidas"] }),
      },
      cookieAdmin,
    );
    const liberada = await json<Resposta>(await chamar(consulta, {}, cookieDiretor));
    const detalhado = liberada.estatisticas?.alunos.find((aluno) => aluno.alunoId === alunoRiscoId);
    expect(detalhado).toMatchObject({ faltas: 1, saidas: 0 });
    await chamar(
      "/api/parametros-acesso",
      { method: "PATCH", body: JSON.stringify({ categoriasDiretor: ["faltas"] }) },
      cookieAdmin,
    );

    const antes = await json<Resposta>(
      await chamar(
        `/api/diretor/estatisticas?turmaId=${turmaId}&de=${diaSeguinte(inicio, -5)}&ate=${diaSeguinte(inicio, -1)}`,
        {},
        cookieDiretor,
      ),
    );
    expect(antes.periodo).toBeNull();
    expect(antes.estatisticas).toBeNull();
    await banco.query(
      "update vinculos_diretor set inicio = $2::date where usuario_id = $1 and fim is null",
      [diretorId, hoje],
    );
  });

  it("retira a turma na hora, sem apagar o histórico", async () => {
    const resposta = await chamar(
      `/api/diretores/${diretorId}`,
      { method: "PATCH", body: JSON.stringify({ turmaIds: [] }) },
      cookieAdmin,
    );
    expect(resposta.status).toBe(200);
    expect((await json<{ diretor: Diretor }>(resposta)).diretor.turmas).toEqual([]);
    const devolve = await chamar(
      `/api/diretores/${diretorId}`,
      { method: "PATCH", body: JSON.stringify({ turmaIds: [turmaId] }) },
      cookieAdmin,
    );
    expect((await json<{ diretor: Diretor }>(devolve)).diretor.turmas).toHaveLength(1);
  });

  it("encerra o vínculo antigo ontem, sem apagar", async () => {
    if (!banco) return;
    await banco.query(
      "update vinculos_diretor set inicio = current_date - 10 where usuario_id = $1 and fim is null",
      [diretorId],
    );
    const resposta = await chamar(
      `/api/diretores/${diretorId}`,
      { method: "PATCH", body: JSON.stringify({ turmaIds: [] }) },
      cookieAdmin,
    );
    expect(resposta.status).toBe(200);
    expect((await json<{ diretor: Diretor }>(resposta)).diretor.turmas).toEqual([]);
    const linhas = await banco.query<{ fim: string | null }>(
      "select to_char(fim, 'YYYY-MM-DD') as fim from vinculos_diretor where usuario_id = $1",
      [diretorId],
    );
    const ontem = diaSeguinte(diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza"), -1);
    expect(linhas.rows.map((linha) => linha.fim)).toContain(ontem);
    await chamar(
      `/api/diretores/${diretorId}`,
      { method: "PATCH", body: JSON.stringify({ turmaIds: [turmaId] }) },
      cookieAdmin,
    );
  });

  it("recusa a entrada com palavra-chave vencida", async () => {
    if (!banco) return;
    await banco.query(
      "update credenciais_diretor set expira_em = now() - interval '1 minute', emitida_em = now() - interval '1 day' where usuario_id = $1",
      [diretorId],
    );
    const resposta = await entrar({ login: IDENTIFICADOR, senha: NOVA_PALAVRA });
    expect(resposta.status).toBe(403);
    expect((await json<{ error: string }>(resposta)).error).toContain("vencida");
    await banco.query(
      "update credenciais_diretor set expira_em = now() + interval '30 days' where usuario_id = $1",
      [diretorId],
    );
  });

  it("revoga, derruba a sessão e recusa a entrada", async () => {
    const sessaoAntes = await json<{ usuario: unknown }>(
      await chamar("/api/auth/sessao", {}, cookieDiretor),
    );
    expect(sessaoAntes.usuario).not.toBeNull();
    const semMotivo = await chamar(
      `/api/diretores/${diretorId}/revogar`,
      { method: "POST", body: JSON.stringify({}) },
      cookieAdmin,
    );
    expect(semMotivo.status).toBe(400);
    const revogar = await chamar(
      `/api/diretores/${diretorId}/revogar`,
      { method: "POST", body: JSON.stringify({ motivo: "Teste de revogação" }) },
      cookieAdmin,
    );
    expect(revogar.status).toBe(200);
    expect((await json<{ diretor: Diretor }>(revogar)).diretor.estado).toBe("revogada");
    const sessaoDepois = await json<{ usuario: unknown }>(
      await chamar("/api/auth/sessao", {}, cookieDiretor),
    );
    expect(sessaoDepois.usuario).toBeNull();
    const entrada = await entrar({ login: IDENTIFICADOR, senha: NOVA_PALAVRA });
    expect(entrada.status).toBe(401);
  });
});

describe("parâmetros de acesso", () => {
  it("valida as faixas e mantém as faltas visíveis", async () => {
    const semFaltas = await chamar(
      "/api/parametros-acesso",
      { method: "PATCH", body: JSON.stringify({ categoriasDiretor: ["saidas"] }) },
      cookieAdmin,
    );
    expect(semFaltas.status).toBe(400);
    const foraDaFaixa = await chamar(
      "/api/parametros-acesso",
      { method: "PATCH", body: JSON.stringify({ validadePalavraDias: 0 }) },
      cookieAdmin,
    );
    expect(foraDaFaixa.status).toBe(400);
    const valido = await chamar(
      "/api/parametros-acesso",
      {
        method: "PATCH",
        body: JSON.stringify({ validadePalavraDias: 30, categoriasDiretor: ["faltas", "saidas"] }),
      },
      cookieAdmin,
    );
    expect(valido.status).toBe(200);
    const { parametros } = await json<{ parametros: Parametros }>(valido);
    expect(parametros.validadePalavraDias).toBe(30);
    expect(parametros.categoriasDiretor).toEqual(["faltas", "saidas"]);
  });

  it("limita as tentativas de entrada pelo parâmetro, com contagem no banco", async () => {
    await chamar(
      "/api/parametros-acesso",
      { method: "PATCH", body: JSON.stringify({ tentativasPorOrigem: 2 }) },
      cookieAdmin,
    );
    const statuses: number[] = [];
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      statuses.push((await entrar({ login: "qd-inexistente", senha: "errada-123" })).status);
    }
    expect(statuses).toEqual([401, 401, 429]);
    if (banco) {
      const linhas = await banco.query(
        "select contagem from tentativas_entrada where chave like '%qd-inexistente'",
      );
      expect(linhas.rowCount).toBeGreaterThan(0);
    }
  });
});
