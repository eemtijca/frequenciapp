// Contratos do envio automático ao registrar saídas: chave desligada não grava,
// chave ligada acrescenta a linha do dia, queda depois de gravar vira PARCIAL
// e o registro seguinte não repete o envio. Massa com prefixo QG, contra o
// Google falso. Saídas e entradas usam a autorização Google; aqui só
// se confirma que o registro nunca falha por causa do envio.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
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
const alunos: string[] = [];

async function limparMassa() {
  if (!banco) return;
  await banco.query("delete from sincronizacoes_planilha where finalidade = 'SAIDAS'");
  await banco.query(
    "delete from saidas_antecipadas where aluno_id in (select id from alunos where nome like 'QG %')",
  );
  await banco.query(
    "delete from entradas_atrasadas where aluno_id in (select id from alunos where nome like 'QG %')",
  );
  await banco.query(
    `insert into integracoes_planilha (id, finalidade, ativa, modo, atualizado_em)
     values ('saidas', 'SAIDAS', false, 'CONSERVADOR', now())
     on conflict (id) do update set
       finalidade = 'SAIDAS', ativa = false, google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
       esquema = null, assinatura_esquema = null, esquema_em = null,
       modo = 'CONSERVADOR', modo_completo_ate = null, envio_automatico = false,
       atualizado_em = now()`,
  );
  await banco.query("delete from alunos where nome like 'QG %'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QG Ano')",
  );
  await banco.query("delete from series where nome = 'QG Ano'");
  await banco.query("delete from liberadores where codigo = 'QGLIB'");
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

async function registrar(indice: number, dia: string) {
  const resposta = await chamar("/api/saidas", "POST", {
    alunoId: alunos[indice],
    dia,
    horario: "09:15",
    momento: "aula_2",
    justificativa: "C",
    liberadoPorCodigo: "QGLIB",
  });
  expect(resposta.status).toBe(201);
}

async function esperar(
  condicao: () => boolean | Promise<boolean>,
  tempoMs = 15_000,
): Promise<boolean> {
  const limite = Date.now() + tempoMs;
  while (Date.now() < limite) {
    if (await condicao()) return true;
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  return condicao();
}

function linhasDe(aluno: string): number {
  let total = 0;
  for (let linha = 2; linha < 40; linha++) {
    if (google?.valor(ABA, linha, 2) === aluno) total += 1;
  }
  return total;
}

async function ultimoResultado(): Promise<string | undefined> {
  const registro = await banco?.query<{ resultado: string }>(
    "select resultado from sincronizacoes_planilha where finalidade = 'SAIDAS' order by criado_em desc limit 1",
  );
  return registro?.rows[0]?.resultado;
}

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (conexao?.startsWith("postgresql://")) {
    banco = new pg.Client({ connectionString: conexao });
    await banco.connect();
  }
  await limparMassa();
  await banco?.query("insert into liberadores (codigo, rotulo) values ('QGLIB', 'QG Libera')");
  google = await criarGoogleFalso();
  const entrada = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL_ADMIN, senha: SENHA_ADMIN, lembrar: false }),
  });
  cookieAdmin = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";

  const serie = await json<{ serie: { id: string } }>(
    await chamar("/api/series", "POST", { nome: "QG Ano", ordem: 95 }),
  );
  const turma = await json<{ turma: { id: string } }>(
    await chamar("/api/turmas", "POST", { serieId: serie.serie.id, nome: "A" }),
  );
  for (const nome of ["QG Ana", "QG Bia", "QG Caio", "QG Davi"]) {
    const aluno = await json<{ aluno: { id: string } }>(
      await chamar("/api/alunos", "POST", { nome, turmaId: turma.turma.id }),
    );
    alunos.push(aluno.aluno.id);
  }
  google.definirAba(ABA, [CABECALHO]);
  if (!banco) throw new Error("Banco sintético indisponível.");
  await google.conectar(banco, "SAIDAS");
  const estrutura = await json<{ planilha: unknown; abas: unknown[] }>(
    await chamar("/api/planilha-saidas/estrutura", "POST", {}),
  );
  const mapa = await chamar("/api/planilha-saidas/mapa", "POST", {
    planilha: estrutura.planilha,
    abas: estrutura.abas,
    aba: ABA,
  });
  expect(mapa.status).toBe(200);
});

afterAll(async () => {
  await chamar("/api/planilha-saidas/desconectar", "POST", {}).catch(() => undefined);
  await limparMassa();
  await google?.fechar();
  if (banco) await banco.end();
});

describe("envio automático ao registrar a saída", () => {
  it("com a chave desligada, registrar não grava na planilha", async () => {
    await registrar(0, "2026-08-11");
    await new Promise((resolver) => setTimeout(resolver, 1500));
    expect(linhasDe("QG Ana")).toBe(0);
  });

  it("a chave aparece na leitura da integração e liga pela Gestão", async () => {
    const ligada = await json<{ integracao: { envioAutomatico: boolean } }>(
      await chamar("/api/planilha-saidas", "PATCH", { envioAutomatico: true }),
    );
    expect(ligada.integracao.envioAutomatico).toBe(true);
  });

  it("com a chave ligada, registrar acrescenta a linha do dia sem repetir", async () => {
    await registrar(1, "2026-08-12");
    expect(await esperar(() => linhasDe("QG Bia") === 1)).toBe(true);
    expect(google?.valor(ABA, 2, 4) ?? "").not.toBe("");
    // Outro registro no mesmo dia não duplica a linha da Bia.
    await registrar(2, "2026-08-12");
    expect(await esperar(() => linhasDe("QG Caio") === 1)).toBe(true);
    expect(linhasDe("QG Bia")).toBe(1);
  });

  it("queda depois de gravar fica parcial e permite conferência manual sem duplicar", async () => {
    const antes = google?.chamadas().filter((acao) => acao === "gravar").length ?? 0;
    google?.perderProximaResposta();
    await registrar(3, "2026-08-13");
    expect(await esperar(() => linhasDe("QG Davi") === 1)).toBe(true);
    expect(await esperar(async () => (await ultimoResultado()) === "PARCIAL")).toBe(true);
    await new Promise((resolver) => setTimeout(resolver, 1000));
    expect(google?.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes + 1);
    const previa = await json<{ resumo: { criar: number } }>(
      await chamar("/api/planilha-saidas/simular", "POST", { de: "2026-08-13", ate: "2026-08-13" }),
    );
    expect(previa.resumo.criar).toBe(0);
    expect(linhasDe("QG Davi")).toBe(1);
  });

  it("depois de um envio sem confirmação (PARCIAL), o registro seguinte não repete o envio", async () => {
    await banco?.query(
      `insert into sincronizacoes_planilha (finalidade, de, ate, modalidade, plano_hash, resultado, criado_em)
       values ('SAIDAS', date '2026-08-13', date '2026-08-13', 'CONSERVADOR', 'qgparcial', 'PARCIAL', now() + interval '1 minute')`,
    );
    const antes = google?.chamadas().length ?? 0;
    await registrar(0, "2026-08-14");
    await new Promise((resolver) => setTimeout(resolver, 2000));
    expect(
      google
        ?.chamadas()
        .slice(antes)
        .filter((acao) => acao === "gravar"),
    ).toEqual([]);
    expect(linhasDe("QG Ana")).toBe(0);
  });
});

describe("consulta de saídas por período", () => {
  it("de e até valem juntos: não traz saída de antes do início", async () => {
    const dados = await json<{ saidas: { dia: string; alunoId: string }[] }>(
      await chamar("/api/saidas?de=2026-08-13&ate=2026-08-13", "GET"),
    );
    const nossas = dados.saidas.filter((saida) => alunos.includes(saida.alunoId));
    expect(nossas.length).toBeGreaterThan(0);
    expect(nossas.every((saida) => saida.dia === "2026-08-13")).toBe(true);
  });
});
