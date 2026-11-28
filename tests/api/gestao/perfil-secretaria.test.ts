// Perfil Secretaria (RBAC por capacidade): lê o Painel e as grades de relatório,
// registra o preparo do download e nada além disso, com uma conta real criada pela administração.
import { afterAll, beforeAll, expect, it } from "vitest";
import pg from "pg";
import { diaLocal } from "@/domain/frequencia";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const fuso = process.env.TZ_APP ?? "America/Fortaleza";
const hoje = diaLocal(new Date(), fuso);
const mes = hoje.slice(0, 7);
const email = "qa.secretaria@escola.exemplo";
const senha = "SecretariaQA2026";
let cookieAdmin = "";
let cookieCoordenacao = "";
let cookieSecretaria = "";
let secretariaId = "";

async function entrar(login: string, palavra: string): Promise<string> {
  const resposta = await fetch(`${url}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({ email: login, senha: palavra }),
  });
  expect(resposta.status).toBe(200);
  return resposta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

function chamar(caminho: string, metodo: string, cookie: string, corpo?: unknown) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: cookie, Origin: url, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function limpar() {
  await banco.query("delete from usuarios where email = $1", [email]);
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  cookieAdmin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  cookieCoordenacao = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  const criada = await chamar("/api/usuarios", "POST", cookieAdmin, {
    nome: "QA Secretaria",
    email,
    senha,
    papel: "SECRETARIA",
  });
  expect(criada.status).toBe(201);
  const corpo = (await criada.json()) as { usuario: { id: string; papel: string } };
  expect(corpo.usuario.papel).toBe("SECRETARIA");
  secretariaId = corpo.usuario.id;
  cookieSecretaria = await entrar(email, senha);
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

it("a administração lista a Secretaria na equipe e a coordenação não administra contas", async () => {
  const lista = await chamar("/api/usuarios", "GET", cookieAdmin);
  const equipe = ((await lista.json()) as { usuarios: Array<{ id: string; papel: string }> })
    .usuarios;
  expect(equipe.find((u) => u.id === secretariaId)?.papel).toBe("SECRETARIA");
  expect((await chamar("/api/usuarios", "GET", cookieCoordenacao)).status).toBe(403);
});

it("recusa papel inventado ao criar usuário", async () => {
  const resposta = await chamar("/api/usuarios", "POST", cookieAdmin, {
    nome: "QA Papel falso",
    email: "qa.papel.falso@escola.exemplo",
    senha,
    papel: "SUPERVISOR",
  });
  expect(resposta.status).toBe(400);
});

it.each([
  ["frequências do mês, para o Painel e a Grade", `/api/frequencias?mes=${mes}`],
  ["frequências do dia, para o Painel", `/api/frequencias?dia=${hoje}`],
  ["frequências de um período, para a Grade", `/api/frequencias?de=${mes}-01&ate=${hoje}`],
  ["acumulado, para a Grade e o Por aluno", `/api/frequencias/resumo?ate=${hoje}`],
  ["saídas do dia, para o Painel", `/api/saidas?dia=${hoje}`],
  ["saídas do mês, para o Por aluno", `/api/saidas?de=${mes}-01&ate=${hoje}`],
  ["configurações, para o Painel", "/api/configuracoes"],
])("a Secretaria lê %s", async (_rotulo, caminho) => {
  const resposta = await chamar(caminho, "GET", cookieSecretaria);
  expect(resposta.status).toBe(200);
});

it("a Secretaria chega ao retrato da Grade: sem parâmetros recebe 400 da rota, não 403 da guarda", async () => {
  const resposta = await chamar("/api/relatorios/grade/retrato", "GET", cookieSecretaria);
  expect(resposta.status).toBe(400);
});

it("a Secretaria registra o preparo do download da Grade e do relatório", async () => {
  const grade = await chamar("/api/exportacoes/registro", "POST", cookieSecretaria, {
    tipo: "grade",
    formato: "zip",
  });
  expect(grade.status).toBe(200);
  expect((await grade.json()) as { ok: boolean }).toEqual({ ok: true });

  const relatorio = await chamar("/api/exportacoes/registro", "POST", cookieSecretaria, {
    tipo: "relatorio",
    formato: "zip",
    retrato: "a".repeat(64),
  });
  expect(relatorio.status).toBe(200);
  expect((await relatorio.json()) as { ok: boolean }).toEqual({ ok: true });
});

const recusas: Array<[string, string, string, unknown?]> = [
  ["salvar uma chamada", "POST", "/api/frequencias", {}],
  ["registrar uma saída", "POST", "/api/saidas", {}],
  ["registrar uma entrada", "POST", "/api/entradas", {}],
  ["ler as entradas", "GET", `/api/entradas?de=${hoje}&ate=${hoje}`],
  ["lançar presença parcial", "POST", "/api/frequencias-parciais", {}],
  [
    "ler a frequência personalizada",
    "GET",
    `/api/frequencias-personalizadas?de=${hoje}&ate=${hoje}`,
  ],
  ["ler o estado da planilha", "GET", "/api/planilha/estado"],
  [
    "ler o relatório de saídas e entradas",
    "GET",
    `/api/relatorios/movimentacoes?de=${hoje}&ate=${hoje}`,
  ],
  ["listar os alunos", "GET", "/api/alunos"],
  ["listar as turmas", "GET", "/api/turmas"],
  ["listar as séries", "GET", "/api/series"],
  ["ler as justificativas", "GET", "/api/justificativas"],
  ["ler quem libera saídas", "GET", "/api/liberadores"],
  ["ler os responsáveis", "GET", "/api/responsaveis"],
  ["ler as provas bimestrais", "GET", "/api/provas-bimestrais"],
  ["listar as provas específicas", "GET", "/api/provas"],
  ["cadastrar uma prova específica", "POST", "/api/provas", {}],
  [
    "ler a ocupação de um local de prova",
    "GET",
    "/api/provas/ocupacao?latitude=-3.7&longitude=-38.5",
  ],
  [
    "definir o local de um aluno na prova",
    "PUT",
    "/api/provas/00000000-0000-4000-8000-000000000001/locais",
    { locais: [] },
  ],
  ["alterar as configurações", "PATCH", "/api/configuracoes", { saidaAntecipada: false }],
  ["listar a equipe", "GET", "/api/usuarios"],
  [
    "criar um administrador",
    "POST",
    "/api/usuarios",
    { nome: "QA", email: "qa.x@escola.exemplo", senha, papel: "ADMIN" },
  ],
  ["promover a si mesma", "PATCH", "SELF", { papel: "ADMIN" }],
  ["listar os diretores", "GET", "/api/diretores"],
  ["mudar as preferências de aviso", "PATCH", "/api/notificacoes/preferencias", {}],
  ["exportar a cópia de segurança", "POST", "/api/backup/exportar", {}],
  [
    "registrar a exportação da relação de alunos",
    "POST",
    "/api/exportacoes/registro",
    { tipo: "relacao", formato: "zip" },
  ],
];

it.each(recusas)("a Secretaria não pode %s (403)", async (_rotulo, metodo, caminho, corpo) => {
  const alvo = caminho === "SELF" ? `/api/usuarios/${secretariaId}` : caminho;
  const resposta = await chamar(alvo, metodo, cookieSecretaria, corpo);
  expect(resposta.status).toBe(403);
});

it("sem sessão, tudo continua 401", async () => {
  expect((await fetch(`${url}/api/frequencias?mes=${mes}`)).status).toBe(401);
  expect((await fetch(`${url}/api/configuracoes`)).status).toBe(401);
});

it("a Secretaria troca a própria senha: a guarda deixa passar e a senha errada recebe 400", async () => {
  const resposta = await chamar("/api/conta/senha", "POST", cookieSecretaria, {
    senhaAtual: "SenhaErrada2026",
    senhaNova: "OutraSenha2026",
  });
  expect(resposta.status).toBe(400);
  expect(((await resposta.json()) as { error: string }).error).toContain("senha atual");
});

it("a Secretaria não aparece entre quem pode liberar saídas, e a equipe operacional continua toda lá", async () => {
  const resposta = await chamar("/api/responsaveis", "GET", cookieCoordenacao);
  const nomes = (
    (await resposta.json()) as { responsaveis: Array<{ nome: string }> }
  ).responsaveis.map((r) => r.nome);
  const operacionais = (
    await banco.query<{ nome: string }>(
      "select nome from usuarios where ativo and papel in ('ADMIN', 'COORDENACAO')",
    )
  ).rows.map((linha) => linha.nome);
  expect(operacionais.length).toBeGreaterThan(0);
  expect(nomes).toEqual(expect.arrayContaining(operacionais));
  expect(nomes).not.toContain("QA Secretaria");
});

it("a coordenação e a administração mantêm o acesso de leitura que já tinham", async () => {
  for (const cookie of [cookieAdmin, cookieCoordenacao]) {
    expect((await chamar(`/api/frequencias?mes=${mes}`, "GET", cookie)).status).toBe(200);
    expect((await chamar(`/api/frequencias/resumo?ate=${hoje}`, "GET", cookie)).status).toBe(200);
    expect((await chamar("/api/configuracoes", "GET", cookie)).status).toBe(200);
  }
});

it("desativar a Secretaria encerra o acesso dela", async () => {
  const desativada = await chamar(`/api/usuarios/${secretariaId}`, "PATCH", cookieAdmin, {
    ativo: false,
  });
  expect(desativada.status).toBe(200);
  expect((await chamar(`/api/frequencias?mes=${mes}`, "GET", cookieSecretaria)).status).toBe(401);
});
