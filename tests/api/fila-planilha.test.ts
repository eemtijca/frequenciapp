// Fila FIFO dos envios automáticos às planilhas: ordem de entrada, espera entre tentativas,
// reserva com prazo, falha esgotada sem travar os seguintes e ações da administração.
// Massa com prefixo QF, contra o Google falso e o PostgreSQL de teste.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const EMAIL_COORDENACAO = process.env.TESTE_COORDENACAO_EMAIL ?? "demo@escola.exemplo";
const SENHA_COORDENACAO = process.env.TESTE_COORDENACAO_SENHA ?? "DemoFrequencia2026";
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
let cookieCoordenacao = "";
let adminId = "";
let banco: pg.Client | null = null;
let google: GoogleFalso | null = null;
const alunos: string[] = [];

interface ResumoFila {
  processados: number;
  concluidos: number;
  falhas: number;
  abertos: number;
  aguardandoAte: string | null;
}

interface LinhaFila {
  id: string;
  estado: string;
  resultado: string | null;
  tentativas: number;
  dia: string;
}

function sql(): pg.Client {
  if (!banco) throw new Error("Banco sintético indisponível.");
  return banco;
}

async function limparMassa() {
  if (!banco) return;
  await banco.query("delete from fila_planilha where tipo = 'SAIDAS'");
  // Os envios consomem o limitador do autor; a massa de teste o zera antes e depois.
  await banco.query("delete from tentativas_entrada where chave like 'planilha-saidas:%'");
  await banco.query("delete from sincronizacoes_planilha where finalidade = 'SAIDAS'");
  await banco.query(
    "delete from saidas_antecipadas where aluno_id in (select id from alunos where nome like 'QF %')",
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
  await banco.query("delete from alunos where nome like 'QF %'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QF Ano')",
  );
  await banco.query("delete from series where nome = 'QF Ano'");
  await banco.query("delete from liberadores where codigo = 'QFLIB'");
}

function chamar(
  caminho: string,
  metodo: "GET" | "POST" | "PATCH",
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

async function json<T>(resposta: Response): Promise<T> {
  return (await resposta.json()) as T;
}

async function entrar(email: string, senha: string): Promise<string> {
  const entrada = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha, lembrar: false }),
  });
  return entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function registrar(indice: number, dia: string) {
  const resposta = await chamar("/api/saidas", "POST", {
    alunoId: alunos[indice],
    dia,
    horario: "09:15",
    momento: "aula_2",
    justificativa: "C",
    liberadoPorCodigo: "QFLIB",
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

async function fila(): Promise<LinhaFila[]> {
  const resultado = await sql().query<LinhaFila>(
    `select id, estado, resultado, tentativas, to_char(dia, 'YYYY-MM-DD') as dia
       from fila_planilha where tipo = 'SAIDAS' order by sequencia`,
  );
  return resultado.rows;
}

async function inserirItem(dia: string, tentativas = 0): Promise<string> {
  const resultado = await sql().query<{ id: string }>(
    `insert into fila_planilha (tipo, dia, autor_id, tentativas, atualizado_em)
     values ('SAIDAS', $1, $2, $3, now())
     returning id`,
    [dia, adminId, tentativas],
  );
  return resultado.rows[0]?.id ?? "";
}

async function vencerEspera(id: string) {
  await sql().query(
    "update fila_planilha set proxima_tentativa_em = now() - interval '1 second' where id = $1",
    [id],
  );
}

function linhaDe(aluno: string): number {
  for (let linha = 2; linha < 60; linha++) {
    if (google?.valor(ABA, linha, 2) === aluno) return linha;
  }
  return 0;
}

function ultimaLinhaDe(aluno: string): number {
  let ultima = 0;
  for (let linha = 2; linha < 60; linha++) {
    if (google?.valor(ABA, linha, 2) === aluno) ultima = linha;
  }
  return ultima;
}

async function processar(): Promise<ResumoFila> {
  const resposta = await chamar("/api/planilha/fila/processar", "POST", {});
  expect(resposta.status).toBe(200);
  return json<ResumoFila>(resposta);
}

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (conexao?.startsWith("postgresql://")) {
    banco = new pg.Client({ connectionString: conexao });
    await banco.connect();
  }
  await limparMassa();
  await banco?.query("insert into liberadores (codigo, rotulo) values ('QFLIB', 'QF Libera')");
  google = await criarGoogleFalso();
  cookieAdmin = await entrar(EMAIL_ADMIN, SENHA_ADMIN);
  cookieCoordenacao = await entrar(EMAIL_COORDENACAO, SENHA_COORDENACAO);
  const admin = await sql().query<{ id: string }>("select id from usuarios where email = $1", [
    EMAIL_ADMIN,
  ]);
  adminId = admin.rows[0]?.id ?? "";

  const serie = await json<{ serie: { id: string } }>(
    await chamar("/api/series", "POST", { nome: "QF Ano", ordem: 94 }),
  );
  const turma = await json<{ turma: { id: string } }>(
    await chamar("/api/turmas", "POST", { serieId: serie.serie.id, nome: "A" }),
  );
  for (const nome of [
    "QF Ana",
    "QF Bia",
    "QF Caio",
    "QF Davi",
    "QF Eva",
    "QF Fabio",
    "QF Gil",
    "QF Hugo",
  ]) {
    const aluno = await json<{ aluno: { id: string } }>(
      await chamar("/api/alunos", "POST", { nome, turmaId: turma.turma.id }),
    );
    alunos.push(aluno.aluno.id);
  }
  google.definirAba(ABA, [CABECALHO]);
  await google.conectar(sql(), "SAIDAS");
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

describe("acesso à fila", () => {
  it("só a administração lê e controla a fila", async () => {
    expect((await fetch(`${APP_URL}/api/planilha/fila`)).status).toBe(401);
    expect((await chamar("/api/planilha/fila", "GET", undefined, cookieCoordenacao)).status).toBe(
      403,
    );
    expect(
      (await chamar("/api/planilha/fila/processar", "POST", {}, cookieCoordenacao)).status,
    ).toBe(403);
    const lida = await chamar("/api/planilha/fila", "GET");
    expect(lida.status).toBe(200);
    expect(await json<{ contagens: Record<string, number> }>(lida)).toHaveProperty("contagens");
  });

  it("a agenda recusa chamadas sem o segredo", async () => {
    expect((await fetch(`${APP_URL}/api/planilha/fila/agenda`)).status).toBe(403);
    const errado = await fetch(`${APP_URL}/api/planilha/fila/agenda`, {
      headers: { Authorization: "Bearer segredo-errado-com-pelo-menos-32-caracteres" },
    });
    expect(errado.status).toBe(403);
    // Um cookie de administrador não autoriza a agenda.
    expect((await chamar("/api/planilha/fila/agenda", "GET")).status).toBe(403);
  });
});

describe("ordem de entrada", () => {
  it("com a chave desligada, registrar não coloca nada na fila", async () => {
    await registrar(0, "2026-09-01");
    await registrar(1, "2026-09-02");
    await registrar(2, "2026-09-03");
    await new Promise((resolver) => setTimeout(resolver, 800));
    expect(await fila()).toHaveLength(0);
  });

  it("processa os itens na ordem de entrada e a planilha recebe as linhas nessa ordem", async () => {
    const ligada = await chamar("/api/planilha-saidas", "PATCH", { envioAutomatico: true });
    expect(ligada.status).toBe(200);
    await inserirItem("2026-09-01");
    await inserirItem("2026-09-02");
    await inserirItem("2026-09-03");
    // Dois pedidos ao mesmo tempo não duplicam o envio de nenhum item.
    await Promise.all([processar(), processar()]);
    expect(
      await esperar(async () => (await fila()).every((item) => item.estado === "CONCLUIDO")),
    ).toBe(true);
    const itens = await fila();
    expect(itens.map((item) => item.resultado)).toEqual(["enviado", "enviado", "enviado"]);
    expect(itens.map((item) => item.tentativas)).toEqual([1, 1, 1]);
    const [ana, bia, caio] = [linhaDe("QF Ana"), linhaDe("QF Bia"), linhaDe("QF Caio")];
    expect(ana).toBeGreaterThan(0);
    expect(bia).toBe(ana + 1);
    expect(caio).toBe(bia + 1);
  });

  it("registrar com a chave ligada enfileira e esvazia a fila sozinho", async () => {
    await sql().query("delete from fila_planilha where tipo = 'SAIDAS'");
    await registrar(3, "2026-09-04");
    expect(
      await esperar(async () => {
        const itens = await fila();
        return itens.length === 1 && itens[0]?.estado === "CONCLUIDO";
      }),
    ).toBe(true);
    expect(linhaDe("QF Davi")).toBeGreaterThan(0);
  });

  it("registros iguais aguardando a vez viram um só item", async () => {
    await sql().query("delete from fila_planilha where tipo = 'SAIDAS'");
    // Uma reserva viva na frente impede qualquer envio durante o teste.
    const frente = await inserirItem("2026-09-08");
    await sql().query(
      "update fila_planilha set estado = 'EM_ANDAMENTO', reservado_ate = now() + interval '5 minutes' where id = $1",
      [frente],
    );
    await inserirItem("2026-09-09");
    await registrar(4, "2026-09-09");
    await new Promise((resolver) => setTimeout(resolver, 1000));
    const itens = await fila();
    expect(
      itens.filter((item) => item.dia === "2026-09-09" && item.estado === "AGUARDANDO"),
    ).toHaveLength(1);
    expect(itens).toHaveLength(2);
  });
});

describe("falhas e retentativas", () => {
  it("a falha confirmada agenda nova tentativa e o item de trás espera a vez", async () => {
    await sql().query("delete from fila_planilha where tipo = 'SAIDAS'");
    google?.recusarGravacoes(true);
    await registrar(5, "2026-09-06");
    expect(
      await esperar(async () => {
        const itens = await fila();
        return itens.length === 1 && itens[0]?.estado === "AGUARDANDO" && itens[0].tentativas === 1;
      }),
    ).toBe(true);
    await registrar(3, "2026-09-07");
    const [frente, atras] = await fila();
    expect(frente).toMatchObject({ resultado: "falhou", tentativas: 1, dia: "2026-09-06" });
    // O item de trás não passa à frente enquanto o da frente espera a nova tentativa.
    const bloqueada = await processar();
    expect(bloqueada.processados).toBe(0);
    expect(bloqueada.aguardandoAte).not.toBeNull();
    expect((await fila())[1]).toMatchObject({ id: atras?.id, estado: "AGUARDANDO", tentativas: 0 });
    // Vencida a espera e com o Google de volta, a frente sai primeiro e depois o de trás.
    google?.recusarGravacoes(false);
    await vencerEspera(frente?.id ?? "");
    const liberada = await processar();
    expect(liberada.processados).toBe(2);
    expect((await fila()).map((item) => item.estado)).toEqual(["CONCLUIDO", "CONCLUIDO"]);
    expect(ultimaLinhaDe("QF Davi")).toBe(linhaDe("QF Fabio") + 1);
  });

  it("esgotadas as tentativas o item vai a falhou e a fila segue", async () => {
    await sql().query("delete from fila_planilha where tipo = 'SAIDAS'");
    google?.recusarGravacoes(true);
    await registrar(6, "2026-09-10");
    await esperar(async () => (await fila())[0]?.tentativas === 1);
    await registrar(7, "2026-09-11");
    const [condenado, seguinte] = await fila();
    await sql().query("update fila_planilha set tentativas = 4 where id = $1", [condenado?.id]);
    await vencerEspera(condenado?.id ?? "");
    const resumo = await processar();
    expect(resumo.processados).toBe(2);
    const itens = await fila();
    expect(itens[0]).toMatchObject({ id: condenado?.id, estado: "FALHOU", tentativas: 5 });
    // O seguinte foi tentado, não ficou preso atrás do item esgotado.
    expect(itens[1]).toMatchObject({ id: seguinte?.id, estado: "AGUARDANDO", tentativas: 1 });
    google?.recusarGravacoes(false);
    await vencerEspera(seguinte?.id ?? "");
    await processar();
    expect((await fila())[1]?.estado).toBe("CONCLUIDO");
    expect(linhaDe("QF Hugo")).toBeGreaterThan(0);
  });
});

describe("reserva com prazo", () => {
  it("uma reserva viva de outro consumidor bloqueia; a vencida é retomada", async () => {
    await sql().query("delete from fila_planilha where tipo = 'SAIDAS'");
    const id = await inserirItem("2026-09-01");
    await sql().query(
      "update fila_planilha set estado = 'EM_ANDAMENTO', tentativas = 1, reservado_ate = now() + interval '5 minutes' where id = $1",
      [id],
    );
    const bloqueada = await processar();
    expect(bloqueada.processados).toBe(0);
    expect(bloqueada.aguardandoAte).not.toBeNull();
    await sql().query(
      "update fila_planilha set reservado_ate = now() - interval '1 second' where id = $1",
      [id],
    );
    const retomada = await processar();
    expect(retomada.processados).toBe(1);
    expect((await fila()).find((item) => item.id === id)).toMatchObject({
      estado: "CONCLUIDO",
      tentativas: 2,
    });
  });
});

describe("ações da administração", () => {
  it("reenfileira o que falhou, descarta o que aguarda e recusa os outros estados", async () => {
    await sql().query("delete from fila_planilha where tipo = 'SAIDAS'");
    const falho = await inserirItem("2026-09-01");
    await sql().query("update fila_planilha set estado = 'FALHOU', tentativas = 5 where id = $1", [
      falho,
    ]);
    const aguardando = await inserirItem("2026-09-02");
    const concluido = await inserirItem("2026-09-03");
    await sql().query("update fila_planilha set estado = 'CONCLUIDO' where id = $1", [concluido]);
    // Aguarda a vez atrás de um item aberto mais antigo: nada o processa durante o teste.
    await sql().query(
      "update fila_planilha set estado = 'EM_ANDAMENTO', reservado_ate = now() + interval '5 minutes' where id = $1",
      [aguardando],
    );
    await sql().query("update fila_planilha set estado = 'AGUARDANDO' where id = $1", [aguardando]);

    expect(
      (await chamar(`/api/planilha/fila/${concluido}/descartar`, "POST", {}, cookieAdmin)).status,
    ).toBe(409);
    expect(
      (await chamar(`/api/planilha/fila/${aguardando}/reenfileirar`, "POST", {}, cookieAdmin))
        .status,
    ).toBe(409);
    expect(
      (await chamar("/api/planilha/fila/nao-e-um-id/descartar", "POST", {}, cookieAdmin)).status,
    ).toBe(400);
    expect(
      (await chamar(`/api/planilha/fila/${falho}/reenfileirar`, "POST", {}, cookieCoordenacao))
        .status,
    ).toBe(403);

    const descartado = await chamar(`/api/planilha/fila/${aguardando}/descartar`, "POST", {});
    expect(descartado.status).toBe(200);
    const reenfileirado = await chamar(`/api/planilha/fila/${falho}/reenfileirar`, "POST", {});
    expect(reenfileirado.status).toBe(200);
    const itens = await fila();
    expect(itens.find((item) => item.id === aguardando)?.estado).toBe("DESCARTADO");
    expect(itens.find((item) => item.id === falho)).toBeUndefined();
    const novo = itens.find((item) => item.dia === "2026-09-01");
    expect(novo).toMatchObject({ estado: "AGUARDANDO", tentativas: 0 });
    const auditoria = await sql().query(
      "select acao from auditoria where acao like 'fila_planilha.%' order by criado_em desc limit 2",
    );
    expect(auditoria.rows.map((linha: { acao: string }) => linha.acao).sort()).toEqual([
      "fila_planilha.descartar",
      "fila_planilha.reenfileirar",
    ]);
  });
});

describe("agenda com segredo", () => {
  it.skipIf(!process.env.CRON_SECRET)("recolhe o que sobrou na fila", async () => {
    await sql().query("delete from fila_planilha where tipo = 'SAIDAS'");
    const id = await inserirItem("2026-09-01");
    const resposta = await fetch(`${APP_URL}/api/planilha/fila/agenda`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(resposta.status).toBe(200);
    const resumo = await json<ResumoFila>(resposta);
    expect(resumo.processados).toBeGreaterThanOrEqual(1);
    expect((await fila()).find((item) => item.id === id)?.estado).toBe("CONCLUIDO");
  });
});
