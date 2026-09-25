// Contratos da API contra o aplicativo no ar. Pré-requisitos:
// aplicativo em APP_URL, banco migrado, admin criado pelo criar-admin e
// professor de teste pelo criar-conta (padrões abaixo). A suíte cria e
// limpa a própria massa em dias de teste isolados.
//
// Rodar com a connection string correta:
//   DATABASE_URL=postgresql://chamada:chamada@localhost:5432/chamada npm run test:api
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoChamada2026";
const EMAIL_PROF = process.env.TESTE_EMAIL ?? "demo@escola.exemplo";
const SENHA_PROF = process.env.TESTE_SENHA ?? "DemoChamada2026";
const DIA_TESTE = "2026-06-15";
const DIA_TESTE_2 = "2026-06-16";

let cookieAdmin = "";
let cookieProf = "";
let banco: pg.Client | null = null;

async function limparMassa() {
  const conexao = process.env.DATABASE_URL;
  if (!conexao || !conexao.startsWith("postgresql://")) return;
  banco = new pg.Client({ connectionString: conexao });
  await banco.connect();
  await banco.query("delete from chamadas where dia in ($1, $2)", [DIA_TESTE, DIA_TESTE_2]);
  await banco.query("delete from alunos where nome like 'QA%'");
  await banco.query(
    "delete from atribuicoes where professor_id in (select id from usuarios where email like 'qa-%')",
  );
  await banco.query(
    "delete from sessoes where usuario_id in (select id from usuarios where email like 'qa-%')",
  );
  await banco.query("delete from auditoria where alvo like '%qa-%' or alvo like 'QA%'");
  await banco.query("delete from usuarios where email like 'qa-%'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QA Ano')",
  );
  await banco.query("delete from series where nome = 'QA Ano'");
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

interface Serie {
  id: string;
  nome: string;
}
interface TurmaApi {
  id: string;
  nome: string;
  rotulo: string;
  serieId: string;
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
  papel: "ADMIN" | "PROFESSOR";
  ativo: boolean;
  turmas: string[];
}

let serieQA: Serie | null = null;
let turmaQA: TurmaApi | null = null;
let turmaQB: TurmaApi | null = null;
let professorQA: UsuarioApi | null = null;
let alunoQA: AlunoApi | null = null;

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
      body: JSON.stringify({ email: EMAIL_PROF, senha: "errada" }),
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
    expect(bruto).toContain("chamada_sessao=");
    expect(bruto).toContain("HttpOnly");
    cookieAdmin = bruto.split(";")[0] ?? "";
    const dados = (await resposta.json()) as { usuario: UsuarioApi };
    expect(dados.usuario.papel).toBe("ADMIN");
  });

  it("entra com o professor de teste", async () => {
    const resultado = await entrar(EMAIL_PROF, SENHA_PROF);
    expect(resultado.status).toBe(200);
    cookieProf = resultado.cookie;
    const resposta = await autenticado(cookieProf, "/api/auth/sessao");
    const dados = (await resposta.json()) as { usuario: UsuarioApi | null };
    expect(dados.usuario?.papel).toBe("PROFESSOR");
  });

  it("exige sessão para listar turmas", async () => {
    const resposta = await requisicao("/api/turmas");
    expect(resposta.status).toBe(401);
  });

  it("recusa JSON inválido com mensagem clara", async () => {
    const resposta = await autenticado(cookieProf, "/api/chamadas", {
      method: "POST",
      body: "{isso não é json",
    });
    expect(resposta.status).toBe(400);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("Não foi possível ler os dados");
  });

  it("recusa corpo grande demais", async () => {
    const resposta = await autenticado(cookieProf, "/api/chamadas", {
      method: "POST",
      body: JSON.stringify({ x: "a".repeat(300000) }),
    });
    expect(resposta.status).toBe(413);
  });

  it("bloqueia mutações de origem externa (CSRF)", async () => {
    const resposta = await fetch(`${APP_URL}/api/chamadas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://externo.example",
        Cookie: cookieProf,
      },
      body: JSON.stringify({ dia: DIA_TESTE, turmaId: "x", faltas: [], revisao: 0 }),
    });
    expect(resposta.status).toBe(403);
  });
});

describe("gestão de séries e turmas (admin)", () => {
  it("professor não cria série", async () => {
    const resposta = await autenticado(cookieProf, "/api/series", {
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

  it("cria duas turmas na série", async () => {
    const respostaA = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: serieQA?.id, nome: "A" }),
    });
    expect(respostaA.status).toBe(201);
    turmaQA = ((await respostaA.json()) as { turma: TurmaApi }).turma;
    expect(turmaQA?.rotulo).toBe("QA Ano A");

    const respostaB = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: serieQA?.id, nome: "B" }),
    });
    expect(respostaB.status).toBe(201);
    turmaQB = ((await respostaB.json()) as { turma: TurmaApi }).turma;
  });

  it("recusa turma duplicada na mesma série", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: serieQA?.id, nome: "a" }),
    });
    expect(resposta.status).toBe(409);
  });

  it("recusa turma em série inexistente", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId: "00000000-0000-0000-0000-000000000000", nome: "Z" }),
    });
    expect(resposta.status).toBe(404);
  });
});

describe("gestão de professores (admin)", () => {
  it("professor não lista usuários", async () => {
    const resposta = await autenticado(cookieProf, "/api/usuarios");
    expect(resposta.status).toBe(403);
  });

  it("recusa senha fora da política", async () => {
    const curta = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Prof", email: "qa-prof@escola.exemplo", senha: "123" }),
    });
    expect(curta.status).toBe(400);

    const semNumero = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Prof",
        email: "qa-prof@escola.exemplo",
        senha: "semnumeros",
      }),
    });
    expect(semNumero.status).toBe(400);
  });

  it("cria professor de teste com turmas atribuídas", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Prof",
        email: "qa-prof@escola.exemplo",
        senha: "QaProf2026",
        papel: "PROFESSOR",
        turmas: [turmaQA?.id],
      }),
    });
    expect(resposta.status).toBe(201);
    professorQA = ((await resposta.json()) as { usuario: UsuarioApi }).usuario;
    expect(professorQA?.turmas).toEqual([turmaQA?.id]);
  });

  it("recusa e-mail duplicado mesmo com caixa diferente", async () => {
    const resposta = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Prof",
        email: "QA-PROF@escola.exemplo",
        senha: "QaProf2026",
      }),
    });
    expect(resposta.status).toBe(409);
  });

  it("atualiza nome e turmas do professor", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/usuarios/${professorQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ nome: "QA Prof Dois", turmas: [turmaQA?.id, turmaQB?.id] }),
    });
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { usuario: UsuarioApi };
    expect(dados.usuario.nome).toBe("QA Prof Dois");
    expect(dados.usuario.turmas.length).toBe(2);
  });

  it("recusa atribuição de turma inexistente", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/usuarios/${professorQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ turmas: ["00000000-0000-0000-0000-000000000000"] }),
    });
    expect(resposta.status).toBe(400);
  });

  it("admin não rebaixa nem desativa a própria conta", async () => {
    const lista = await autenticado(cookieAdmin, "/api/usuarios");
    const usuarios = ((await lista.json()) as { usuarios: UsuarioApi[] }).usuarios;
    const eu = usuarios.find((usuario) => usuario.email === EMAIL_ADMIN);
    expect(eu).toBeDefined();

    const demove = await autenticado(cookieAdmin, `/api/usuarios/${eu?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ papel: "PROFESSOR" }),
    });
    expect(demove.status).toBe(400);
    const desativa = await autenticado(cookieAdmin, `/api/usuarios/${eu?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    expect(desativa.status).toBe(400);
  });

  it("conta desativada não entra e sai da sessão", async () => {
    await autenticado(cookieAdmin, `/api/usuarios/${professorQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    const tentativa = await entrar("qa-prof@escola.exemplo", "QaProf2026");
    expect(tentativa.status).toBe(403);
    const dados = (await (
      await fetch(`${APP_URL}/api/auth/entrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_URL },
        body: JSON.stringify({ email: "qa-prof@escola.exemplo", senha: "QaProf2026" }),
      })
    ).json()) as { error: string };
    expect(dados.error).toContain("desativada");

    await autenticado(cookieAdmin, `/api/usuarios/${professorQA?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: true }),
    });
    const reativada = await entrar("qa-prof@escola.exemplo", "QaProf2026");
    expect(reativada.status).toBe(200);
  });
});

describe("gestão de alunos (admin)", () => {
  it("professor não cadastra aluno", async () => {
    const resposta = await autenticado(cookieProf, "/api/alunos", {
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

describe("chamadas (ACID e concorrência)", () => {
  const cookieQA = { valor: "" };

  it("professor de QA entra", async () => {
    const resultado = await entrar("qa-prof@escola.exemplo", "QaProf2026");
    expect(resultado.status).toBe(200);
    cookieQA.valor = resultado.cookie;
  });

  it("salva a chamada do dia com falta", async () => {
    const resposta = await autenticado(cookieQA.valor, "/api/chamadas", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE,
        turmaId: turmaQA?.id,
        faltas: [alunoQA?.id],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { chamada: { revisao: number; faltas: string[] } };
    expect(dados.chamada.revisao).toBe(1);
    expect(dados.chamada.faltas).toEqual([alunoQA?.id]);
  });

  it("bloqueia duplicata do mesmo dia e turma com conflito 409", async () => {
    const resposta = await autenticado(cookieQA.valor, "/api/chamadas", {
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
      fetch(`${APP_URL}/api/chamadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_URL, Cookie: cookieQA.valor },
        body: corpo,
      }),
      fetch(`${APP_URL}/api/chamadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_URL, Cookie: cookieQA.valor },
        body: corpo,
      }),
    ]);
    const codigos = [primeira.status, segunda.status].sort();
    expect(codigos).toEqual([200, 409]);
  });

  it("atualiza com a revisão vigente e recusa revisão obsoleta", async () => {
    const atualizacao = await autenticado(cookieQA.valor, "/api/chamadas", {
      method: "POST",
      body: JSON.stringify({ dia: DIA_TESTE, turmaId: turmaQA?.id, faltas: [], revisao: 1 }),
    });
    expect(atualizacao.status).toBe(200);
    const dados = (await atualizacao.json()) as { chamada: { revisao: number; faltas: string[] } };
    expect(dados.chamada.revisao).toBe(2);
    expect(dados.chamada.faltas).toEqual([]);

    const obsoleta = await autenticado(cookieQA.valor, "/api/chamadas", {
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

  it("recusa faltas de alunos de outra turma dentro da mesma transação", async () => {
    const deFora = await autenticado(cookieAdmin, "/api/alunos", {
      method: "POST",
      body: JSON.stringify({ nome: "QA Aluno Turma B", turmaId: turmaQB?.id }),
    });
    const alunoDeFora = ((await deFora.json()) as { aluno: AlunoApi }).aluno;
    const resposta = await autenticado(cookieQA.valor, "/api/chamadas", {
      method: "POST",
      body: JSON.stringify({
        dia: DIA_TESTE_2,
        turmaId: turmaQA?.id,
        faltas: [alunoDeFora.id],
        revisao: 0,
      }),
    });
    expect(resposta.status).toBe(400);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("lista de alunos mudou");
    // Atomicidade: nada foi gravado na chamada rejeitada.
    const consulta = await autenticado(
      cookieQA.valor,
      `/api/chamadas?dia=${DIA_TESTE_2}&turmaId=${turmaQA?.id}`,
    );
    const vigente = (await consulta.json()) as { chamada: { faltas: string[] } | null };
    expect(vigente.chamada?.faltas).toEqual([]);
  });

  it("professor sem atribuição não salva chamada", async () => {
    const resposta = await autenticado(cookieProf, "/api/chamadas", {
      method: "POST",
      body: JSON.stringify({ dia: DIA_TESTE_2, turmaId: turmaQA?.id, faltas: [], revisao: 0 }),
    });
    expect(resposta.status).toBe(403);
  });

  it("recusa dia inválido e turma inválida", async () => {
    const diaInvalido = await autenticado(
      cookieQA.valor,
      `/api/chamadas?dia=2026-02-30&turmaId=${turmaQA?.id}`,
    );
    expect(diaInvalido.status).toBe(400);
    const turmaInvalida = await autenticado(
      cookieQA.valor,
      `/api/chamadas?dia=${DIA_TESTE}&turmaId=abc`,
    );
    expect(turmaInvalida.status).toBe(400);
  });

  it("consulta por dia e por mês", async () => {
    const porDia = await autenticado(
      cookieQA.valor,
      `/api/chamadas?dia=${DIA_TESTE}&turmaId=${turmaQA?.id}`,
    );
    expect(porDia.status).toBe(200);
    const dadosDia = (await porDia.json()) as { chamada: { revisao: number } | null };
    expect(dadosDia.chamada?.revisao).toBe(2);

    const porMes = await autenticado(cookieQA.valor, "/api/chamadas?mes=2026-06");
    expect(porMes.status).toBe(200);
    const dadosMes = (await porMes.json()) as { chamadas: { dia: string; turmaId: string }[] };
    expect(dadosMes.chamadas.some((chamada) => chamada.dia === DIA_TESTE)).toBe(true);
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

  it("professor com chamadas não é excluído", async () => {
    const resposta = await autenticado(cookieAdmin, `/api/usuarios/${professorQA?.id}`, {
      method: "DELETE",
    });
    expect(resposta.status).toBe(409);
    const dados = (await resposta.json()) as { error: string };
    expect(dados.error).toContain("Desative");
  });

  it("professor sem histórico é excluído", async () => {
    const criado = await autenticado(cookieAdmin, "/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        nome: "QA Temporário",
        email: "qa-temp@escola.exemplo",
        senha: "QaTemp2026",
      }),
    });
    const temporario = ((await criado.json()) as { usuario: UsuarioApi }).usuario;
    const resposta = await autenticado(cookieAdmin, `/api/usuarios/${temporario.id}`, {
      method: "DELETE",
    });
    expect(resposta.status).toBe(200);
  });
});

describe("conta: troca de senha", () => {
  it("recusa senha atual errada", async () => {
    const resposta = await autenticado(cookieProf, "/api/conta/senha", {
      method: "POST",
      body: JSON.stringify({ senhaAtual: "errada", senhaNova: "NovaSenha2026" }),
    });
    expect(resposta.status).toBe(400);
  });

  it("troca a senha e desconecta outros aparelhos", async () => {
    const outroAparelho = await entrar(EMAIL_PROF, SENHA_PROF);
    expect(outroAparelho.status).toBe(200);

    const resposta = await autenticado(cookieProf, "/api/conta/senha", {
      method: "POST",
      body: JSON.stringify({ senhaAtual: SENHA_PROF, senhaNova: "NovaSenha2026" }),
    });
    expect(resposta.status).toBe(200);

    const comNova = await entrar(EMAIL_PROF, "NovaSenha2026");
    expect(comNova.status).toBe(200);
    const comAntiga = await entrar(EMAIL_PROF, SENHA_PROF);
    expect(comAntiga.status).toBe(401);

    const sessaoDoOutro = await autenticado(outroAparelho.cookie, "/api/auth/sessao");
    const dados = (await sessaoDoOutro.json()) as { usuario: unknown | null };
    expect(dados.usuario).toBe(null);

    // Volta a senha original para o restante das baterias.
    cookieProf = comNova.cookie;
    const voltar = await autenticado(cookieProf, "/api/conta/senha", {
      method: "POST",
      body: JSON.stringify({ senhaAtual: "NovaSenha2026", senhaNova: SENHA_PROF }),
    });
    expect(voltar.status).toBe(200);
    const reentrada = await entrar(EMAIL_PROF, SENHA_PROF);
    cookieProf = reentrada.cookie;
    expect(reentrada.status).toBe(200);
  });
});

describe("trilha de auditoria", () => {
  it("registrou as ações administrativas", async () => {
    // Sem DATABASE_URL a consulta direta ao banco não existe e o
    // resultado vazio geraria falso negativo sem explicação.
    expect(banco, "DATABASE_URL é obrigatória para os contratos (ver tests/README.md)").not.toBe(
      null,
    );
    const resultado = await banco?.query(
      "select acao from auditoria where acao in ('serie.criar', 'usuario.criar', 'aluno.criar', 'usuario.excluir') order by acao",
    );
    const acoes = (resultado?.rows ?? []).map((linha: { acao: string }) => linha.acao);
    expect(acoes).toContain("serie.criar");
    expect(acoes).toContain("usuario.criar");
    expect(acoes).toContain("aluno.criar");
    expect(acoes).toContain("usuario.excluir");
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
    const resposta = await autenticado(cookieProf, "/api/auth/sair", { method: "POST" });
    expect(resposta.status).toBe(200);
    const aposSair = await autenticado(cookieProf, "/api/turmas");
    expect(aposSair.status).toBe(401);
  });

  it("saúde responde ok", async () => {
    const resposta = await requisicao("/api/saude");
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as { ok: boolean };
    expect(dados.ok).toBe(true);
  });
});
