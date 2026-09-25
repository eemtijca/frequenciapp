// Contratos da API contra o aplicativo no ar (APP_URL), com banco migrado e
// contas de teste. A suíte cria e limpa a própria massa em dias isolados.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const EMAIL_COORD = process.env.TESTE_EMAIL ?? "demo@escola.exemplo";
const SENHA_COORD = process.env.TESTE_SENHA ?? "DemoFrequencia2026";
const DIAS_TESTE = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"];
const DIA_TESTE = DIAS_TESTE[0] as string;
const DIA_TESTE_2 = DIAS_TESTE[1] as string;
const DIA_TESTE_3 = DIAS_TESTE[2] as string;
const DIA_TESTE_4 = DIAS_TESTE[3] as string;
const DIA_TESTE_5 = DIAS_TESTE[4] as string;

let cookieAdmin = "";
let cookieCoord = "";
let banco: pg.Client | null = null;

async function limparMassa() {
  const conexao = process.env.DATABASE_URL;
  if (!conexao || !conexao.startsWith("postgresql://")) return;
  banco = new pg.Client({ connectionString: conexao });
  await banco.connect();
  await banco.query("delete from frequencias where dia = any($1::date[])", [DIAS_TESTE]);
  await banco.query("delete from alunos where nome like 'QA%'");
  await banco.query(
    "delete from sessoes where usuario_id in (select id from usuarios where email like 'qa-%')",
  );
  await banco.query("delete from usuarios where email like 'qa-%'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QA Ano')",
  );
  await banco.query("delete from series where nome = 'QA Ano'");
  await banco.query("delete from auditoria where alvo like '%qa-%' or alvo like 'QA%'");
}

async function requisicao(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos });
}

/** Requisição autenticada com o cookie indicado. */
async function autenticado(
  cookie: string,
  caminho: string,
  opcoes: RequestInit = {},
): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  cabecalhos.set("Cookie", cookie);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos });
}

async function entrar(email: string, senha: string): Promise<{ status: number; cookie: string }> {
  const resposta = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: APP_URL },
    body: JSON.stringify({ email, senha }),
  });
  const bruto = resposta.headers.get("set-cookie") ?? "";
  return { status: resposta.status, cookie: bruto.split(";")[0] ?? "" };
}

/** Validade da sessão mais recente de um e-mail, em milissegundos. */
async function validadeDaSessaoMaisNova(email: string): Promise<number> {
  if (!banco) return 0;
  const { rows } = await banco.query<{ expira_em: Date }>(
    `select s.expira_em
       from sessoes s
       join usuarios u on u.id = s.usuario_id
      where u.email = $1
      order by s.criado_em desc
      limit 1`,
    [email],
  );
  const expiraEm = rows[0]?.expira_em;
  return expiraEm ? expiraEm.getTime() - Date.now() : 0;
}

interface Serie {
  id: string;
  nome: string;
}
interface HorarioApi {
  id: string;
  turmaId: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  ativo: boolean;
}
interface TurmaApi {
  id: string;
  nome: string;
  rotulo: string;
  serieId: string;
  horarios: HorarioApi[];
}
interface AlunoApi {
  id: string;
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  ativo: boolean;
}
interface UsuarioApi {
  id: string;
  nome: string;
  email: string;
  papel: "ADMIN" | "COORDENACAO";
  ativo: boolean;
}
interface FrequenciaApi {
  dia: string;
  turmaId: string;
  revisao: number;
  atualizadoPorNome: string | null;
  faltas: { alunoId: string; horarios: string[]; justificativa?: string | null }[];
}

let serieQA: Serie | null = null;
let turmaQA: TurmaApi | null = null;
let turmaQB: TurmaApi | null = null;
let aulaQA: HorarioApi | null = null;
let coordQA: UsuarioApi | null = null;
let alunoQA: AlunoApi | null = null;
let saidaQA: { id: string; alunoId: string; momento: string } | null = null;

beforeAll(async () => {
  await limparMassa();
});

afterAll(async () => {
  await limparMassa();
  if (banco) await banco.end();
});

describe("autenticação", () => {
  it("recusa credenciais erradas com mensagem genérica", async () => {
    const resposta = await requisicao("/api/auth/entrar", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL_COORD, senha: "errada" }),
    });
    expect(resposta.status).toBe(401);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toBe("E-mail ou senha incorretos.");
  });

  it("entra com o admin e devolve o papel", async () => {
    const resposta = await requisicao("/api/auth/entrar", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL_ADMIN, senha: SENHA_ADMIN }),
    });
    expect(resposta.status).toBe(200);
    const bruto = resposta.headers.get("set-cookie") ?? "";
    expect(bruto).toContain("frequenciapp_sessao=");
    expect(bruto).toContain("HttpOnly");
    cookieAdmin = bruto.split(";")[0] ?? "";
    const dados = (await resposta.json()) as { usuario: UsuarioApi };
    expect(dados.usuario.papel).toBe("ADMIN");
  });

  it("entra com a coordenação de teste", async () => {
    const resultado = await entrar(EMAIL_COORD, SENHA_COORD);
    expect(resultado.status).toBe(200);
    cookieCoord = resultado.cookie;
    const resposta = await autenticado(cookieCoord, "/api/auth/sessao");
    const dados = (await resposta.json()) as { usuario: UsuarioApi | null };
    expect(dados.usuario?.papel).toBe("COORDENACAO");
  });

  it("mantém a sessão por 30 dias quando pede para lembrar", async () => {
    const resposta = await requisicao("/api/auth/entrar", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL_COORD, senha: SENHA_COORD, lembrar: true }),
    });
    expect(resposta.status).toBe(200);
    const bruto = resposta.headers.get("set-cookie") ?? "";
    expect(bruto).toMatch(/Expires=/i);
    const validade = await validadeDaSessaoMaisNova(EMAIL_COORD);
    expect(validade).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it("usa cookie de sessão e validade curta sem lembrar", async () => {
    const resposta = await requisicao("/api/auth/entrar", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL_COORD, senha: SENHA_COORD, lembrar: false }),
    });
    expect(resposta.status).toBe(200);
    const bruto = resposta.headers.get("set-cookie") ?? "";
    expect(bruto).not.toMatch(/Expires=/i);
    expect(bruto).not.toMatch(/Max-Age=/i);
    const validade = await validadeDaSessaoMaisNova(EMAIL_COORD);
    expect(validade).toBeGreaterThan(11 * 60 * 60 * 1000);
    expect(validade).toBeLessThan(13 * 60 * 60 * 1000);
  });

  it("exige sessão para listar turmas", async () => {
    const resposta = await requisicao("/api/turmas");
    expect(resposta.status).toBe(401);
  });

  it("recusa JSON inválido com mensagem clara", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: "{isso não é json",
    });
    expect(resposta.status).toBe(400);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("Não foi possível ler os dados");
  });

  it("recusa corpo grande demais", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({ x: "a".repeat(300000) }),
    });
    expect(resposta.status).toBe(413);
  });

  it("bloqueia mutações de origem externa (CSRF)", async () => {
    const resposta = await fetch(`${APP_URL}/api/frequencias`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://externo.example",
        Cookie: cookieCoord,
      },
      body: JSON.stringify({ dia: DIA_TESTE, turmaId: "x", faltas: [], revisao: 0 }),
    });
    expect(resposta.status).toBe(403);
  });
});

describe("gestão de séries e turmas (admin)", () => {
  it("coordenação não cria série", async () => {
    const resposta = await autenticado(cookieCoord, "/api/series", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Ano", ordem: 9 }),
    });
    expect(resposta.status).toBe(403);
  });

  it("admin cria a série de teste", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/series", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Ano", ordem: 9 }),
    });
    expect(resposta.status).toBe(201);
    const dados = (await resposta.json()) as { serie: Serie };
    serieQA = dados.serie;
    expect(serieQA?.nome).toBe("QA Ano");
  });

  it("recusa série duplicada mesmo com caixa diferente", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/series", {
      method: "POST",
      body: JSON.stringify({ nome: "qa ano", ordem: 10 }),
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("série");
  });

  it("recusa série com dados inválidos", async () => {
    const semNome = await autenticado(cookieAdmin, "/api/series", {
      method: "POST",
      body: JSON.stringify({ nome: "", ordem: 1 }),
    });
    expect(semNome.status).toBe(400);
    const ordemQuebrada = await autenticado(cookieAdmin, "/api/series", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Outro", ordem: "dois" }),
    });
    expect(ordemQuebrada.status).toBe(400);
  });

  it("cria duas turmas na série com aula padrão", async () => {
    const respostaA = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: serieQA?.id, nome: "A" }),
    });
    expect(respostaA.status).toBe(201);
    turmaQA = ((await respostaA.json()) as { turma: TurmaApi }).turma;
    expect(turmaQA?.rotulo).toBe("QA Ano A");
    expect(turmaQA?.horarios).toHaveLength(1);
    expect(turmaQA?.horarios[0]?.ordem).toBe(1);
    expect(turmaQA?.horarios[0]?.inicio).toBe("00:00");
    expect(turmaQA?.horarios[0]?.fim).toBe("23:59");
    expect(turmaQA?.horarios[0]?.diasSemana).toHaveLength(7);
    aulaQA = turmaQA?.horarios[0] ?? null;

    const respostaB = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: serieQA?.id, nome: "B" }),
    });
    expect(respostaB.status).toBe(201);
    turmaQB = ((await respostaB.json()) as { turma: TurmaApi }).turma;
  });

  it("recusa turma duplicada na mesma série mesmo com caixa diferente", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: serieQA?.id, nome: "a" }),
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("turma");
  });

  it("recusa turma em série inexistente", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: "00000000-0000-0000-0000-000000000000", nome: "Z" }),
    });
    expect(resposta.status).toBe(404);
  });
});

describe("gestão de aulas (admin)", () => {
  it("coordenação não cria aula", async () => {
    const resposta = await autenticado(cookieCoord, "/api/horarios", {
      method: "POST",
      body: JSON.stringify({
        turmaId: turmaQA?.id,
        ordem: 2,
        inicio: "07:00",
        fim: "07:50",
        diasSemana: [1, 2, 3, 4, 5],
      }),
    });
    expect(resposta.status).toBe(403);
  });

  it("admin cria aula com horário e dias da semana", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/horarios", {
      method: "POST",
      body: JSON.stringify({
        turmaId: turmaQA?.id,
        ordem: 2,
        inicio: "07:00",
        fim: "07:50",
        diasSemana: [1, 2, 3, 4, 5],
      }),
    });
    expect(resposta.status).toBe(201);
    const dados = (await resposta.json()) as { horario: HorarioApi };
    expect(dados.horario.ordem).toBe(2);
    expect(dados.horario.diasSemana).toEqual([1, 2, 3, 4, 5]);
    aulaQA = dados.horario;
  });

  it("recusa horário invertido, dias vazios e ordem repetida", async () => {
    const invertido = await autenticado(cookieAdmin, "/api/horarios", {
      method: "POST",
      body: JSON.stringify({
        turmaId: turmaQA?.id,
        ordem: 3,
        inicio: "10:00",
        fim: "09:00",
        diasSemana: [1],
      }),
    });
    expect(invertido.status).toBe(400);
    const semDias = await autenticado(cookieAdmin, "/api/horarios", {
      method: "POST",
      body: JSON.stringify({
        turmaId: turmaQA?.id,
        ordem: 3,
        inicio: "09:00",
        fim: "09:50",
        diasSemana: [],
      }),
    });
    expect(semDias.status).toBe(400);
    const repetida = await autenticado(cookieAdmin, "/api/horarios", {
      method: "POST",
      body: JSON.stringify({
        turmaId: turmaQA?.id,
        ordem: 2,
        inicio: "09:00",
        fim: "09:50",
        diasSemana: [1],
      }),
    });
    expect(repetida.status).toBe(409);
  });

  it("admin edita a janela e desativa a aula", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/horarios/${aulaQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ inicio: "07:10", ativo: false }),
    });
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { horario: HorarioApi };
    expect(dados.horario.inicio).toBe("07:10");
    expect(dados.horario.ativo).toBe(false);

    const reativar = await autenticado(cookieAdmin, `/api/horarios/${aulaQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: true }),
    });
    expect(reativar.status).toBe(200);
  });
});

describe("gestão de equipe (admin)", () => {
  it("coordenação não lista usuários", async () => {
    const resposta = await autenticado(cookieCoord, "/api/usuarios");
    expect(resposta.status).toBe(403);
  });

  it("recusa senha fora da política", async () => {
    const curta = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Equipe", email: "qa-equipe@escola.exemplo", senha: "123" }),
    });
    expect(curta.status).toBe(400);

    const semNumero = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Equipe",
        email: "qa-equipe@escola.exemplo",
        senha: "semnumeros",
      }),
    });
    expect(semNumero.status).toBe(400);
  });

  it("cria conta de coordenação de teste", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Equipe",
        email: "qa-equipe@escola.exemplo",
        senha: "QaEquipe2026",
      }),
    });
    expect(resposta.status).toBe(201);
    coordQA = ((await resposta.json()) as { usuario: UsuarioApi }).usuario;
    expect(coordQA?.papel).toBe("COORDENACAO");
  });

  it("recusa e-mail duplicado mesmo com caixa diferente", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Equipe",
        email: "QA-EQUIPE@escola.exemplo",
        senha: "QaEquipe2026",
      }),
    });
    expect(resposta.status).toBe(409);
  });

  it("atualiza o nome da conta", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/usuarios/${coordQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ nome: "QA Equipe Dois" }),
    });
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { usuario: UsuarioApi };
    expect(dados.usuario.nome).toBe("QA Equipe Dois");
  });

  it("admin não rebaixa nem desativa a própria conta", async () => {
    const lista = await autenticado(cookieAdmin, "/api/usuarios");
    const usuarios = ((await lista.json()) as { usuarios: UsuarioApi[] }).usuarios;
    const eu = usuarios.find((usuario) => usuario.email === EMAIL_ADMIN);
    expect(eu).toBeDefined();

    const demove = await autenticado(cookieAdmin, `/api/usuarios/${eu?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ papel: "COORDENACAO" }),
    });
    expect(demove.status).toBe(400);
    const desativa = await autenticado(cookieAdmin, `/api/usuarios/${eu?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    expect(desativa.status).toBe(400);
  });

  it("conta desativada não entra e volta ao reativar", async () => {
    await autenticado(cookieAdmin, `/api/usuarios/${coordQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    const tentativa = await entrar("qa-equipe@escola.exemplo", "QaEquipe2026");
    expect(tentativa.status).toBe(403);

    await autenticado(cookieAdmin, `/api/usuarios/${coordQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: true }),
    });
    const reativada = await entrar("qa-equipe@escola.exemplo", "QaEquipe2026");
    expect(reativada.status).toBe(200);
  });
});

describe("gestão de alunos (admin)", () => {
  it("coordenação não cadastra aluno", async () => {
    const resposta = await autenticado(cookieCoord, "/api/alunos", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Aluno", turmaId: turmaQA?.id }),
    });
    expect(resposta.status).toBe(403);
  });

  it("admin cadastra aluno com origem padrão na própria turma", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/alunos", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Aluno Um", turmaId: turmaQA?.id }),
    });
    expect(resposta.status).toBe(201);
    alunoQA = ((await resposta.json()) as { aluno: AlunoApi }).aluno;
    expect(alunoQA?.turmaOriginalId).toBe(turmaQA?.id);
    expect(alunoQA?.ordem).toBe(1);
  });

  it("cadastra segundo aluno na ordem seguinte", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/alunos", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Aluno Dois", turmaId: turmaQA?.id }),
    });
    const aluno = ((await resposta.json()) as { aluno: AlunoApi }).aluno;
    expect(aluno.ordem).toBe(2);
  });

  it("move o aluno de turma preservando a origem", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/alunos/${alunoQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ turmaId: turmaQB?.id }),
    });
    expect(resposta.status).toBe(200);
    const aluno = ((await resposta.json()) as { aluno: AlunoApi }).aluno;
    expect(aluno.turmaId).toBe(turmaQB?.id);
    expect(aluno.turmaOriginalId).toBe(turmaQA?.id);

    await autenticado(cookieAdmin, `/api/alunos/${alunoQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ turmaId: turmaQA?.id }),
    });
  });

  it("recusa aluno em turma inexistente", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/alunos", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Aluno Três",
        turmaId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(resposta.status).toBe(404);
  });
});

describe("frequências (uma por turma e dia)", () => {
  it("coordenação de QA entra", async () => {
    const resultado = await entrar("qa-equipe@escola.exemplo", "QaEquipe2026");
    expect(resultado.status).toBe(200);
    cookieCoord = resultado.cookie;
  });

  it("salva a frequência do dia com falta em todas as aulas", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE,
        turmaId: turmaQA?.id,
        faltas: [alunoQA?.id],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { frequencia: FrequenciaApi };
    expect(dados.frequencia.revisao).toBe(1);
    expect(dados.frequencia.atualizadoPorNome).toBe("QA Equipe Dois");
    expect(dados.frequencia.faltas).toHaveLength(1);
    expect(dados.frequencia.faltas[0]?.alunoId).toBe(alunoQA?.id);
    expect(dados.frequencia.faltas[0]?.horarios.length).toBeGreaterThan(1);
  });

  it("bloqueia duplicata do mesmo dia e turma com conflito 409", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({ dia: DIA_TESTE, turmaId: turmaQA?.id, faltas: [], revisao: 0 }),
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { conflito: boolean };
    expect(dados.conflito).toBe(true);
  });

  it("salvamentos concorrentes: apenas um vence, o outro recebe 409", async () => {
    const corpo = JSON.stringify({
      dia: DIA_TESTE_2,
      turmaId: turmaQA?.id,
      faltas: [],
      revisao: 0,
    });
    const [primeira, segunda] = await Promise.all([
      fetch(`${APP_URL}/api/frequencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_URL, Cookie: cookieCoord },
        body: corpo,
      }),
      fetch(`${APP_URL}/api/frequencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_URL, Cookie: cookieCoord },
        body: corpo,
      }),
    ]);
    const codigos = [primeira.status, segunda.status].sort();
    expect(codigos).toEqual([200, 409]);
  });

  it("atualiza com a revisão vigente e recusa revisão obsoleta", async () => {
    const atualizacao = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({ dia: DIA_TESTE, turmaId: turmaQA?.id, faltas: [], revisao: 1 }),
    });
    expect(atualizacao.status).toBe(200);
    const dados = (await atualizacao.json()) as { frequencia: FrequenciaApi };
    expect(dados.frequencia.revisao).toBe(2);
    expect(dados.frequencia.faltas).toEqual([]);

    const obsoleta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE,
        turmaId: turmaQA?.id,
        faltas: [alunoQA?.id],
        revisao: 1,
      }),
    });
    expect(obsoleta.status).toBe(409);
  });

  it("salva falta apenas nas aulas informadas", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_3,
        turmaId: turmaQA?.id,
        faltas: [{ alunoId: alunoQA?.id, horarios: [aulaQA?.id] }],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { frequencia: FrequenciaApi };
    expect(dados.frequencia.faltas).toEqual([{ alunoId: alunoQA?.id, horarios: [aulaQA?.id] }]);
  });

  it("recusa aula de outra turma", async () => {
    const aulaDeFora = turmaQB?.horarios[0]?.id;
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_4,
        turmaId: turmaQA?.id,
        faltas: [{ alunoId: alunoQA?.id, horarios: [aulaDeFora] }],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(400);
  });

  it("recusa aula que não acontece no dia da semana", async () => {
    const criada = await autenticado(cookieAdmin, "/api/horarios", {
      method: "POST",
      body: JSON.stringify({
        turmaId: turmaQA?.id,
        ordem: 9,
        inicio: "12:00",
        fim: "12:50",
        diasSemana: [7],
      }),
    });
    expect(criada.status).toBe(201);
    const aulaDeDomingo = ((await criada.json()) as { horario: HorarioApi }).horario;
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_5,
        turmaId: turmaQA?.id,
        faltas: [{ alunoId: alunoQA?.id, horarios: [aulaDeDomingo.id] }],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(400);
  });

  it("aceita aluno desativado que já tinha falta registrada", async () => {
    await autenticado(cookieAdmin, `/api/alunos/${alunoQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_3,
        turmaId: turmaQA?.id,
        faltas: [{ alunoId: alunoQA?.id, horarios: [aulaQA?.id] }],
        revisao: 1,
      }),
    });
    expect(resposta.status).toBe(200);
    await autenticado(cookieAdmin, `/api/alunos/${alunoQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: true }),
    });
  });

  it("recusa falta de aluno desativado sem registro anterior", async () => {
    const criado = await autenticado(cookieAdmin, "/api/alunos", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Aluno Inativo", turmaId: turmaQA?.id }),
    });
    const inativo = ((await criado.json()) as { aluno: AlunoApi }).aluno;
    await autenticado(cookieAdmin, `/api/alunos/${inativo.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_4,
        turmaId: turmaQA?.id,
        faltas: [inativo.id],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(400);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("lista de alunos mudou");
  });

  it("recusa dia inválido e turma inválida", async () => {
    const diaInvalido = await autenticado(
      cookieCoord,
      `/api/frequencias?dia=2026-02-30&turmaId=${turmaQA?.id}`,
    );
    expect(diaInvalido.status).toBe(400);
    const turmaInvalida = await autenticado(
      cookieCoord,
      `/api/frequencias?dia=${DIA_TESTE}&turmaId=abc`,
    );
    expect(turmaInvalida.status).toBe(400);
  });

  it("recusa registro em dia futuro", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: "2099-06-15",
        turmaId: turmaQA?.id,
        faltas: [],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(400);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("dia futuro");
  });

  it("consulta por dia e por mês com filtros", async () => {
    const porDia = await autenticado(
      cookieCoord,
      `/api/frequencias?dia=${DIA_TESTE}&turmaId=${turmaQA?.id}`,
    );
    expect(porDia.status).toBe(200);
    const dadosDia = (await porDia.json()) as { frequencia: FrequenciaApi | null };
    expect(dadosDia.frequencia?.revisao).toBe(2);

    const porMes = await autenticado(cookieCoord, "/api/frequencias?mes=2026-06");
    expect(porMes.status).toBe(200);
    const dadosMes = (await porMes.json()) as { frequencias: FrequenciaApi[] };
    expect(dadosMes.frequencias.some((frequencia) => frequencia.dia === DIA_TESTE)).toBe(true);

    const porTurma = await autenticado(
      cookieCoord,
      `/api/frequencias?mes=2026-06&turmaId=${turmaQB?.id}`,
    );
    const dadosTurma = (await porTurma.json()) as { frequencias: FrequenciaApi[] };
    expect(dadosTurma.frequencias.every((frequencia) => frequencia.turmaId === turmaQB?.id)).toBe(
      true,
    );

    const listaUsuarios = await autenticado(cookieAdmin, "/api/usuarios");
    const usuarios = ((await listaUsuarios.json()) as { usuarios: UsuarioApi[] }).usuarios;
    const autora = usuarios.find((usuario) => usuario.email === "qa-equipe@escola.exemplo");
    const porAutoria = await autenticado(
      cookieCoord,
      `/api/frequencias?mes=2026-06&registradoPor=${autora?.id}`,
    );
    expect(porAutoria.status).toBe(200);
    const dadosAutoria = (await porAutoria.json()) as { frequencias: FrequenciaApi[] };
    expect(dadosAutoria.frequencias.length).toBeGreaterThan(0);
  });

  it("preserva o histórico ao excluir a conta autora", async () => {
    const excluir = await autenticado(cookieAdmin, `/api/usuarios/${coordQA?.id}`, {
      method: "DELETE",
    });
    expect(excluir.status).toBe(200);
    const consulta = await autenticado(
      cookieAdmin,
      `/api/frequencias?dia=${DIA_TESTE}&turmaId=${turmaQA?.id}`,
    );
    const dados = (await consulta.json()) as { frequencia: FrequenciaApi | null };
    expect(dados.frequencia).not.toBeNull();
    expect(dados.frequencia?.atualizadoPorNome).toBe(null);
    coordQA = null;
  });
});

describe("remoções com histórico", () => {
  it("turma com alunos não é excluída", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/turmas/${turmaQA?.id}`, {
      method: "DELETE",
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("Mova ou exclua");
  });

  it("série com turmas não é excluída", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/series/${serieQA?.id}`, {
      method: "DELETE",
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("turmas");
  });

  it("aula com faltas registradas não é excluída", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/horarios/${aulaQA?.id}`, {
      method: "DELETE",
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("Desative");
  });

  it("aula sem histórico é excluída", async () => {
    const criada = await autenticado(cookieAdmin, "/api/horarios", {
      method: "POST",
      body: JSON.stringify({
        turmaId: turmaQB?.id,
        ordem: 2,
        inicio: "08:00",
        fim: "08:50",
        diasSemana: [1],
      }),
    });
    const aula = ((await criada.json()) as { horario: HorarioApi }).horario;
    const resposta = await autenticado(cookieAdmin, `/api/horarios/${aula.id}`, {
      method: "DELETE",
    });
    expect(resposta.status).toBe(200);
  });
});

describe("chamada com justificativa, período e acumulado", () => {
  beforeAll(async () => {
    // A conta de coordenação de QA foi excluída na bateria anterior;
    // aqui voltamos à conta fixa de demonstração.
    const reentrada = await entrar(EMAIL_COORD, SENHA_COORD);
    cookieCoord = reentrada.cookie;
  });

  it("salva falta justificada com o código do catálogo", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_4,
        turmaId: turmaQA?.id,
        faltas: [{ alunoId: alunoQA?.id, justificativa: "D", observacao: null }],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { frequencia: FrequenciaApi };
    expect(dados.frequencia.faltas[0]?.justificativa).toBe("D");
  });

  it("recusa justificativa fora do catálogo", async () => {
    const resposta = await autenticado(cookieCoord, "/api/frequencias", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_5,
        turmaId: turmaQA?.id,
        faltas: [{ alunoId: alunoQA?.id, justificativa: "X" }],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(400);
  });

  it("consulta o dia inteiro sem turma", async () => {
    const resposta = await autenticado(cookieCoord, `/api/frequencias?dia=${DIA_TESTE_4}`);
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { frequencias: FrequenciaApi[] };
    expect(Array.isArray(dados.frequencias)).toBe(true);
    expect(dados.frequencias.some((frequencia) => frequencia.turmaId === turmaQA?.id)).toBe(true);
  });

  it("consulta por período e recusa período invertido", async () => {
    const resposta = await autenticado(
      cookieCoord,
      `/api/frequencias?de=${DIA_TESTE_4}&ate=${DIA_TESTE_5}`,
    );
    expect(resposta.status).toBe(200);
    const invertido = await autenticado(
      cookieCoord,
      `/api/frequencias?de=${DIA_TESTE_5}&ate=${DIA_TESTE_4}`,
    );
    expect(invertido.status).toBe(400);
  });

  it("devolve o acumulado por aluno", async () => {
    const resposta = await autenticado(cookieCoord, `/api/frequencias/resumo?ate=${DIA_TESTE_4}`);
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as {
      resumo: {
        diasLetivos: number;
        porAluno: { alunoId: string; faltas: number; faltasJustificadas: number }[];
      };
    };
    expect(dados.resumo.diasLetivos).toBeGreaterThan(0);
    const acumulado = dados.resumo.porAluno.find((item) => item.alunoId === alunoQA?.id);
    expect(acumulado?.faltasJustificadas).toBeGreaterThanOrEqual(1);
  });
});

describe("saídas antecipadas", () => {
  it("coordenação registra a saída com responsável padrão", async () => {
    const resposta = await autenticado(cookieCoord, "/api/saidas", {
      method: "POST",
      body: JSON.stringify({
        alunoId: alunoQA?.id,
        dia: DIA_TESTE_4,
        momento: "aula_2",
        justificativa: "CM",
        observacao: null,
      }),
    });
    expect(resposta.status).toBe(201);
    const dados = (await resposta.json()) as {
      saida: { id: string; alunoId: string; momento: string; liberadoPorNome: string | null };
    };
    expect(dados.saida.momento).toBe("aula_2");
    expect(dados.saida.liberadoPorNome).toBe("Demo");
    saidaQA = { id: dados.saida.id, alunoId: dados.saida.alunoId, momento: dados.saida.momento };
  });

  it("recusa saída repetida no mesmo dia", async () => {
    const resposta = await autenticado(cookieCoord, "/api/saidas", {
      method: "POST",
      body: JSON.stringify({
        alunoId: alunoQA?.id,
        dia: DIA_TESTE_4,
        momento: "aula_3",
        justificativa: "D",
      }),
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("já tem uma saída");
  });

  it("recusa momento, justificativa e dia futuro inválidos", async () => {
    const momento = await autenticado(cookieCoord, "/api/saidas", {
      method: "POST",
      body: JSON.stringify({
        alunoId: alunoQA?.id,
        dia: DIA_TESTE_5,
        momento: "madrugada",
        justificativa: "D",
      }),
    });
    expect(momento.status).toBe(400);
    const justificativa = await autenticado(cookieCoord, "/api/saidas", {
      method: "POST",
      body: JSON.stringify({
        alunoId: alunoQA?.id,
        dia: DIA_TESTE_5,
        momento: "aula_1",
        justificativa: "X",
      }),
    });
    expect(justificativa.status).toBe(400);
    const futuro = await autenticado(cookieCoord, "/api/saidas", {
      method: "POST",
      body: JSON.stringify({
        alunoId: alunoQA?.id,
        dia: "2099-06-15",
        momento: "aula_1",
        justificativa: "D",
      }),
    });
    expect(futuro.status).toBe(400);
  });

  it("lista saídas por dia e por período", async () => {
    const porDia = await autenticado(cookieCoord, `/api/saidas?dia=${DIA_TESTE_4}`);
    expect(porDia.status).toBe(200);
    const dadosDia = (await porDia.json()) as { saidas: { id: string }[] };
    expect(dadosDia.saidas.some((saida) => saida.id === saidaQA?.id)).toBe(true);

    const porPeriodo = await autenticado(
      cookieCoord,
      `/api/saidas?de=${DIA_TESTE_4}&ate=${DIA_TESTE_5}`,
    );
    expect(porPeriodo.status).toBe(200);
    const dadosPeriodo = (await porPeriodo.json()) as { saidas: unknown[] };
    expect(dadosPeriodo.saidas.length).toBeGreaterThan(0);
  });

  it("remove a saída para correção", async () => {
    const resposta = await autenticado(cookieCoord, `/api/saidas/${saidaQA?.id}`, {
      method: "DELETE",
    });
    expect(resposta.status).toBe(200);
    const conferencia = await autenticado(cookieCoord, `/api/saidas?dia=${DIA_TESTE_4}`);
    const dados = (await conferencia.json()) as { saidas: { id: string }[] };
    expect(dados.saidas.some((saida) => saida.id === saidaQA?.id)).toBe(false);
  });
});

describe("configurações e responsáveis", () => {
  it("coordenação lê mas não altera as configurações", async () => {
    const leitura = await autenticado(cookieCoord, "/api/configuracoes");
    expect(leitura.status).toBe(200);
    const alteracao = await autenticado(cookieCoord, "/api/configuracoes", {
      method: "PATCH",
      body: JSON.stringify({ frequenciaPorAula: true }),
    });
    expect(alteracao.status).toBe(403);
  });

  it("administração alterna os recursos e volta ao padrão", async () => {
    const ligar = await autenticado(cookieAdmin, "/api/configuracoes", {
      method: "PATCH",
      body: JSON.stringify({ frequenciaPorAula: true }),
    });
    expect(ligar.status).toBe(200);
    const dadosLigar = (await ligar.json()) as { configuracoes: { frequenciaPorAula: boolean } };
    expect(dadosLigar.configuracoes.frequenciaPorAula).toBe(true);

    const desligar = await autenticado(cookieAdmin, "/api/configuracoes", {
      method: "PATCH",
      body: JSON.stringify({ frequenciaPorAula: false }),
    });
    expect(desligar.status).toBe(200);
    const dadosDesligar = (await desligar.json()) as {
      configuracoes: { frequenciaPorAula: boolean };
    };
    expect(dadosDesligar.configuracoes.frequenciaPorAula).toBe(false);
  });

  it("lista a equipe ativa como responsável", async () => {
    const resposta = await autenticado(cookieCoord, "/api/responsaveis");
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { responsaveis: { nome: string }[] };
    expect(dados.responsaveis.length).toBeGreaterThan(0);
  });
});

describe("cópia de segurança", () => {
  it("coordenação não exporta a cópia", async () => {
    const resposta = await autenticado(cookieCoord, "/api/backup");
    expect(resposta.status).toBe(403);
  });

  it("administração exporta e importa a própria cópia sem conflitos", async () => {
    const exportacao = await autenticado(cookieAdmin, "/api/backup");
    expect(exportacao.status).toBe(200);
    const copia = (await exportacao.json()) as {
      formato: string;
      versao: number;
      series: unknown[];
    };
    expect(copia.formato).toBe("frequenciapp");
    expect(copia.versao).toBe(1);
    expect(copia.series.length).toBeGreaterThan(0);

    const importacao = await autenticado(cookieAdmin, "/api/backup", {
      method: "POST",
      body: JSON.stringify(copia),
    });
    expect(importacao.status).toBe(200);
    const resultado = (await importacao.json()) as {
      adicionadas: number;
      identicas: number;
      conflitos: number;
    };
    expect(resultado.adicionadas).toBe(0);
    expect(resultado.conflitos).toBe(0);
    expect(resultado.identicas).toBeGreaterThan(0);
  });

  it("recusa arquivo em outro formato", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/backup", {
      method: "POST",
      body: JSON.stringify({ formato: "outro" }),
    });
    expect(resposta.status).toBe(400);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("formato do FrequenciApp");
  });
});

describe("conta: troca de senha", () => {
  beforeAll(async () => {
    // As baterias de frequência usam a conta QA; aqui voltamos à conta fixa.
    const reentrada = await entrar(EMAIL_COORD, SENHA_COORD);
    cookieCoord = reentrada.cookie;
  });

  it("recusa senha atual errada", async () => {
    const resposta = await autenticado(cookieCoord, "/api/conta/senha", {
      method: "POST",
      body: JSON.stringify({ senhaAtual: "errada", senhaNova: "NovaSenha2026" }),
    });
    expect(resposta.status).toBe(400);
  });

  it("troca a senha e desconecta outros dispositivos", async () => {
    const outroAparelho = await entrar(EMAIL_COORD, SENHA_COORD);
    expect(outroAparelho.status).toBe(200);

    const resposta = await autenticado(cookieCoord, "/api/conta/senha", {
      method: "POST",
      body: JSON.stringify({ senhaAtual: SENHA_COORD, senhaNova: "NovaSenha2026" }),
    });
    expect(resposta.status).toBe(200);

    const comNova = await entrar(EMAIL_COORD, "NovaSenha2026");
    expect(comNova.status).toBe(200);
    const comAntiga = await entrar(EMAIL_COORD, SENHA_COORD);
    expect(comAntiga.status).toBe(401);

    const sessaoDoOutro = await autenticado(outroAparelho.cookie, "/api/auth/sessao");
    const dados = (await sessaoDoOutro.json()) as { usuario: unknown | null };
    expect(dados.usuario).toBe(null);

    // Volta a senha original para o restante das baterias.
    cookieCoord = comNova.cookie;
    const voltar = await autenticado(cookieCoord, "/api/conta/senha", {
      method: "POST",
      body: JSON.stringify({ senhaAtual: "NovaSenha2026", senhaNova: SENHA_COORD }),
    });
    expect(voltar.status).toBe(200);
    const reentrada = await entrar(EMAIL_COORD, SENHA_COORD);
    cookieCoord = reentrada.cookie;
    expect(reentrada.status).toBe(200);
  });
});

describe("trilha de auditoria", () => {
  it("registrou as ações administrativas sem nomes de alunos", async () => {
    // Sem DATABASE_URL a consulta direta ao banco não existe e o
    // resultado vazio geraria falso negativo sem explicação.
    expect(banco, "DATABASE_URL é obrigatória para os contratos (ver tests/README.md)").not.toBe(
      null,
    );
    const resultado = await banco?.query(
      "select acao, alvo from auditoria where acao in ('serie.criar', 'usuario.criar', 'aluno.criar', 'usuario.excluir', 'horario.criar') order by acao",
    );
    const linhas = (resultado?.rows ?? []) as { acao: string; alvo: string }[];
    const acoes = linhas.map((linha) => linha.acao);
    expect(acoes).toContain("serie.criar");
    expect(acoes).toContain("usuario.criar");
    expect(acoes).toContain("aluno.criar");
    expect(acoes).toContain("usuario.excluir");
    expect(acoes).toContain("horario.criar");
    expect(linhas.every((linha) => !linha.alvo.includes("QA Aluno"))).toBe(true);
  });
});

describe("limite de tentativas de entrada", () => {
  it("bloqueia após excesso de erros no mesmo e-mail", async () => {
    let ultima = 0;
    for (let tentativa = 0; tentativa < 12; tentativa += 1) {
      const resposta = await fetch(`${APP_URL}/api/auth/entrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_URL },
        body: JSON.stringify({ email: "qa-rate@escola.exemplo", senha: "errada" }),
      });
      ultima = resposta.status;
    }
    expect(ultima).toBe(429);
  });
});

describe("saída", () => {
  it("encerra a sessão e bloqueia a listagem", async () => {
    const resposta = await autenticado(cookieCoord, "/api/auth/sair", { method: "POST" });
    expect(resposta.status).toBe(200);
    const aposSair = await autenticado(cookieCoord, "/api/turmas");
    expect(aposSair.status).toBe(401);
  });

  it("saúde responde ok", async () => {
    const resposta = await requisicao("/api/saude");
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { ok: boolean };
    expect(dados.ok).toBe(true);
  });
});
