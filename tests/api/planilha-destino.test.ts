// Contratos da identidade dos envios: arquivo e aba estável isolam a confirmação
// e mantêm tentativas antigas sem destino protegidas até conferência manual.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const ARQUIVO_A = "planilha-destino-sintetica-a";
const ARQUIVO_B = "planilha-destino-sintetica-b";
const ABA = "QA Destino A";
const DIA = "2026-06-15";
const DIA_SEGUINTE = "2026-06-16";
const daSerie =
  "select id from turmas where serie_id in (select id from series where nome = 'QA Destino')";

let banco: pg.Client;
let google: GoogleFalso;
let cookie = "";
let adminId = "";
let turmaId = "";

interface Plano {
  dias: string[];
  semEnvio: boolean;
  planoHashTurma: string;
}

function chamar(caminho: string, corpo?: unknown, metodo = corpo === undefined ? "GET" : "POST") {
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
  const corpo: unknown = await resposta.json();
  expect(resposta.status, JSON.stringify(corpo)).toBe(status);
  return corpo as T;
}

async function limpar() {
  await banco.query(`delete from fila_planilha where turma_id in (${daSerie})`);
  await banco.query(`delete from sincronizacoes_planilha where turma_original_id in (${daSerie})`);
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(`delete from turmas where id in (${daSerie})`);
  await banco.query("delete from series where nome = 'QA Destino'");
  await banco.query(
    `update integracoes_planilha set ativa = false, envio_automatico = false,
       google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
       esquema = null, assinatura_esquema = null, esquema_em = null,
       modo = 'CONSERVADOR', modo_completo_ate = null where id = 'principal'`,
  );
}

function esvaziarAba(nome = ABA) {
  google.definirAba(nome, [
    ["Aluno", "15/06/2026", "16/06/2026"],
    ["QA Destino Aluno", "", ""],
  ]);
}

async function mapear(nome = ABA) {
  await dados(await chamar("/api/planilha", { ativa: true }, "PATCH"));
  const estrutura = await dados<{ planilha: unknown; abas: unknown[]; conferenciaHash: string }>(
    await chamar("/api/planilha/estrutura", {}),
  );
  await dados(
    await chamar("/api/planilha/mapa", {
      ...estrutura,
      mapa: [{ aba: nome, turmaOriginalId: turmaId }],
    }),
  );
}

async function selecionar(arquivo: string) {
  await dados(await chamar("/api/planilha/google/selecionar", { id: arquivo }));
}

async function simular(somenteAlteradas = true) {
  const previa = await dados<{ planos: Plano[] }>(
    await chamar("/api/planilha/simular", {
      turmaOriginalId: turmaId,
      de: DIA,
      ate: DIA,
      somenteAlteradas,
    }),
  );
  const plano = previa.planos[0];
  if (!plano) throw new Error("Plano sintético ausente.");
  return plano;
}

function aplicar(plano: Plano, somenteAlteradas = true) {
  return chamar("/api/planilha/aplicar", {
    turmaOriginalId: turmaId,
    de: DIA,
    ate: DIA,
    somenteAlteradas,
    planoHashGeral: plano.planoHashTurma,
  });
}

async function confirmar(plano?: Plano) {
  const envio = await dados<{ resultados: { resultado: string }[] }>(
    await aplicar(plano ?? (await simular())),
  );
  expect(envio.resultados[0]?.resultado).toBe("sucesso");
}

async function estado() {
  const { integracao } = await dados<{
    integracao: { alteradasDepois: number; ultimoErro: { resultado: string } | null };
  }>(await chamar("/api/planilha"));
  return integracao;
}

async function salvar(dia = DIA, revisao = 0) {
  await dados(await chamar("/api/frequencias", { turmaId, dia, revisao, faltas: [] }));
}

async function esperarFila(dia: string, resultado: string) {
  const limite = Date.now() + 15_000;
  while (Date.now() < limite) {
    const consulta = await banco.query<{ resultado: string }>(
      `select resultado from fila_planilha where turma_id = $1 and dia = $2::date
       order by sequencia desc limit 1`,
      [turmaId, dia],
    );
    if (consulta.rows[0]?.resultado === resultado) return;
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  throw new Error(`A fila sintética não concluiu com ${resultado}.`);
}

beforeAll(async () => {
  banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await banco.connect();
  await limpar();
  google = await criarGoogleFalso();
  const entrada = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ login: EMAIL_ADMIN, senha: SENHA_ADMIN }),
  });
  expect(entrada.status).toBe(200);
  cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
  adminId = (await dados<{ usuario: { id: string } }>(entrada)).usuario.id;
  const { serie } = await dados<{ serie: { id: string } }>(
    await chamar("/api/series", { nome: "QA Destino", ordem: 97 }),
    201,
  );
  const { turma } = await dados<{ turma: { id: string } }>(
    await chamar("/api/turmas", { nome: "A", serieId: serie.id }),
    201,
  );
  turmaId = turma.id;
  await dados(await chamar("/api/alunos", { nome: "QA Destino Aluno", turmaId }), 201);
});

beforeEach(async () => {
  await banco.query("delete from tentativas_entrada where chave = ANY($1::text[])", [
    [`planilha:simular:${adminId}`, `planilha:envio:${adminId}`],
  ]);
  await banco.query(
    "update integracoes_planilha set envio_automatico = false where id = 'principal'",
  );
  await banco.query("delete from fila_planilha where turma_id = $1", [turmaId]);
  await banco.query("delete from sincronizacoes_planilha where turma_original_id = $1", [turmaId]);
  await banco.query("delete from frequencias where turma_id = $1", [turmaId]);
  google.recusarGravacoes(false);
  for (const nome of google.abas()) google.removerAba(nome);
  esvaziarAba();
  await google.conectar(banco);
  await selecionar(ARQUIVO_A);
  await mapear();
  await salvar();
});

afterAll(async () => {
  await limpar();
  await google?.fechar();
  await banco.end();
});

describe("isolamento do destino da frequência legada", () => {
  it("não usa o sucesso do arquivo anterior para esconder dias pendentes no novo arquivo", async () => {
    await confirmar();
    expect((await simular()).dias).toEqual([]);
    const pendentes = (await estado()).alteradasDepois;
    const historicoA = await banco.query<{ destino: string }>(
      "select destino from sincronizacoes_planilha where turma_original_id = $1",
      [turmaId],
    );
    expect(historicoA.rows[0]?.destino).toMatch(/^frequencia:/);

    await selecionar(ARQUIVO_B);
    esvaziarAba();
    await mapear();
    expect((await estado()).alteradasDepois).toBe(pendentes + 1);
    const previa = await simular();
    expect(previa.dias).toEqual([DIA]);
    await confirmar(previa);
    expect(google.valor(ABA, 2, 2)).toBe("P");
    const historico = await banco.query<{ destino: string }>(
      "select destino from sincronizacoes_planilha where turma_original_id = $1",
      [turmaId],
    );
    expect(historico.rows).toHaveLength(2);
    expect(new Set(historico.rows.map((item) => item.destino)).size).toBe(2);
    expect(historico.rows).toEqual(expect.arrayContaining(historicoA.rows));
  });

  it("rejeita a prévia de outro arquivo mesmo com nomes e células idênticos", async () => {
    const anterior = await simular(false);
    await selecionar(ARQUIVO_B);
    await mapear();
    const atual = await simular(false);
    expect(atual.planoHashTurma).not.toBe(anterior.planoHashTurma);
    expect((await aplicar(anterior, false)).status).toBe(409);
    expect(google.valor(ABA, 2, 2)).toBe("");
  });

  it("reconhece a aba recriada com o mesmo nome como um destino novo", async () => {
    await confirmar();
    const anterior = await simular(false);
    google.removerAba(ABA);
    esvaziarAba();
    expect(
      (
        await chamar("/api/planilha/simular", {
          turmaOriginalId: turmaId,
          de: DIA,
          ate: DIA,
        })
      ).status,
    ).toBe(409);
    await mapear();
    const atual = await simular();
    expect(atual.dias).toEqual([DIA]);
    expect((await aplicar(anterior, false)).status).toBe(409);
    await confirmar(atual);
    expect(google.valor(ABA, 2, 2)).toBe("P");
  });

  it("preserva a confirmação quando a mesma aba é renomeada e mapeada novamente", async () => {
    await confirmar();
    google.renomearAba(ABA, `${ABA} renomeada`);
    await mapear(`${ABA} renomeada`);
    expect((await simular()).dias).toEqual([]);
  });

  it("reconfere sucessos antigos sem destino e preserva o histórico e as marcas existentes", async () => {
    await confirmar();
    await banco.query(
      "update sincronizacoes_planilha set destino = null where turma_original_id = $1",
      [turmaId],
    );
    const previa = await simular();
    expect(previa.dias).toEqual([DIA]);
    await confirmar(previa);
    expect(google.valor(ABA, 2, 2)).toBe("P");
    expect((await simular()).dias).toEqual([]);
    const historico = await banco.query<{ destino: string | null }>(
      "select destino from sincronizacoes_planilha where turma_original_id = $1",
      [turmaId],
    );
    expect(historico.rows).toHaveLength(2);
    expect(historico.rows.some((item) => item.destino === null)).toBe(true);
  });

  it("mantém a falha do arquivo antigo no histórico sem exibi-la como erro do arquivo atual", async () => {
    const previa = await simular();
    google.recusarGravacoes(true);
    await dados(await aplicar(previa));
    expect((await estado()).ultimoErro?.resultado).toBe("FALHA");
    google.recusarGravacoes(false);
    await selecionar(ARQUIVO_B);
    await mapear();
    expect((await estado()).ultimoErro).toBeNull();
    const historico = await banco.query<{ resultado: string }>(
      "select resultado from sincronizacoes_planilha where turma_original_id = $1",
      [turmaId],
    );
    expect(historico.rows).toEqual([{ resultado: "FALHA" }]);
  });

  it("não deixa um sucesso sem destino encobrir a tentativa parcial do destino identificado", async () => {
    const previa = await simular();
    google.perderProximaResposta();
    await dados(await aplicar(previa));
    await banco.query(
      `insert into sincronizacoes_planilha
         (turma_original_id, destino, de, ate, modalidade, plano_hash, resultado, criado_em)
       select turma_original_id, null, de, ate, modalidade, plano_hash, 'SUCESSO', now()
       from sincronizacoes_planilha where turma_original_id = $1 limit 1`,
      [turmaId],
    );
    expect((await estado()).ultimoErro?.resultado).toBe("PARCIAL");
    await dados(await chamar("/api/planilha", { envioAutomatico: true }, "PATCH"));
    const gravacoes = google.chamadas().filter((acao) => acao === "gravar").length;
    await salvar(DIA, 1);
    await esperarFila(DIA, "sem_confirmacao");
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(gravacoes);
  });

  it("bloqueia a automação após tentativa antiga sem destino até a conferência manual", async () => {
    await confirmar();
    await banco.query(
      "update sincronizacoes_planilha set destino = null, resultado = 'PARCIAL' where turma_original_id = $1",
      [turmaId],
    );
    await dados(await chamar("/api/planilha", { envioAutomatico: true }, "PATCH"));
    const gravacoes = google.chamadas().filter((acao) => acao === "gravar").length;
    await salvar(DIA, 1);
    await esperarFila(DIA, "sem_confirmacao");
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(gravacoes);
    expect((await estado()).ultimoErro?.resultado).toBe("PARCIAL");
    await confirmar();
    expect((await estado()).ultimoErro).toBeNull();
    await salvar(DIA_SEGUINTE);
    await esperarFila(DIA_SEGUINTE, "enviado");
    expect(google.valor(ABA, 2, 3)).toBe("P");
  });

  it("não bloqueia a automação no arquivo novo pela tentativa parcial do arquivo anterior", async () => {
    const previa = await simular();
    google.perderProximaResposta();
    await dados(await aplicar(previa));
    expect((await estado()).ultimoErro?.resultado).toBe("PARCIAL");
    await selecionar(ARQUIVO_B);
    esvaziarAba();
    await mapear();
    await dados(await chamar("/api/planilha", { envioAutomatico: true }, "PATCH"));
    await salvar(DIA, 1);
    await esperarFila(DIA, "enviado");
    expect(google.valor(ABA, 2, 2)).toBe("P");
  });
});
