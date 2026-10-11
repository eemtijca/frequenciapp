// Cópia de grades entre turmas: permissões, conflitos atômicos e histórico preservado.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { CopiaFrequenciapp } from "@/application/backup";
import type { Horario } from "@/domain/frequencia";

const url = process.env.APP_URL ?? "http://localhost:3000";
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = `QA Cópia Horários ${randomUUID()}`;
let admin = "";
let coordenacao = "";
let serieId = "";
let numeroPar = 0;

async function chamar(
  caminho: string,
  metodo = "POST",
  corpo?: unknown,
  cookie = admin,
  origem = url,
) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Origin: origem, Cookie: cookie, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function ler<T>(resposta: Response, status = 200): Promise<T> {
  expect(resposta.status).toBe(status);
  return (await resposta.json()) as T;
}

function primeiraLinha<T>(linhas: T[]): T {
  const linha = linhas[0];
  if (!linha) throw new Error("Registro sintético ausente.");
  return linha;
}

async function criarAula(turmaId: string, ordem: number, ativo = true): Promise<string> {
  const segunda = ordem === 2;
  const { rows } = await cliente.query<{ id: string }>(
    "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, disciplinas, ativo) values ($1, $2, $3, $4, $5, $6::jsonb, $7) returning id",
    [
      turmaId,
      ordem,
      segunda ? "08:00" : "07:00",
      segunda ? "08:50" : "07:50",
      segunda ? [2, 4, 6] : [1, 3, 5],
      JSON.stringify(
        segunda
          ? { "2": "Física", "4": "História", "6": "Artes" }
          : { "1": "Português", "3": "Química", "5": "Literatura" },
      ),
      ativo,
    ],
  );
  return primeiraLinha(rows).id;
}

async function criarPar(comAulas = true) {
  numeroPar += 1;
  const { rows } = await cliente.query<{ id: string; nome: string }>(
    "insert into turmas (serie_id, nome) values ($1, $2), ($1, $3) returning id, nome",
    [serieId, `Origem ${numeroPar}`, `Destino ${numeroPar}`],
  );
  const origem = primeiraLinha(rows.filter((turma) => turma.nome.startsWith("Origem"))).id;
  const destino = primeiraLinha(rows.filter((turma) => turma.nome.startsWith("Destino"))).id;
  if (comAulas) {
    await criarAula(origem, 1);
    await criarAula(origem, 2, false);
  }
  return { turmaOrigemId: origem, turmaDestinoId: destino };
}

async function listar(turmaId: string): Promise<Horario[]> {
  return (
    await ler<{ horarios: Horario[] }>(await chamar(`/api/horarios?turmaId=${turmaId}`, "GET"))
  ).horarios;
}

async function registrosDeAulas(turmaId: string) {
  return (
    await cliente.query<{ registro: unknown }>(
      "select to_jsonb(h) as registro from horarios h where turma_id = $1 order by ordem",
      [turmaId],
    )
  ).rows;
}

async function criarHistorico(turmaId: string, horarioId: string) {
  const aluno = primeiraLinha(
    (
      await cliente.query<{ id: string }>(
        "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, 1) returning id",
        [`${prefixo} Aluno ${turmaId}`, turmaId],
      )
    ).rows,
  );
  const frequencia = primeiraLinha(
    (
      await cliente.query<{ id: string }>(
        "insert into frequencias (turma_id, dia, revisao, atualizado_em) values ($1, '1990-05-07', 3, now()) returning id",
        [turmaId],
      )
    ).rows,
  );
  await cliente.query(
    "insert into alunos_chamada (frequencia_id, aluno_id, registrado_seduc, revisao_seduc) values ($1, $2, true, 2)",
    [frequencia.id, aluno.id],
  );
  await cliente.query(
    "insert into faltas (frequencia_id, aluno_id, horario_id, observacao) values ($1, $2, $3, $4)",
    [frequencia.id, aluno.id, horarioId, `${prefixo} Histórico`],
  );
}

async function historico(turmas: string[]) {
  const frequencias = await cliente.query<{ registro: unknown }>(
    "select to_jsonb(f) as registro from frequencias f where turma_id = any($1::uuid[]) order by id",
    [turmas],
  );
  const alunos = await cliente.query<{ registro: unknown }>(
    "select to_jsonb(a) as registro from alunos_chamada a join frequencias f on f.id = a.frequencia_id where f.turma_id = any($1::uuid[]) order by a.frequencia_id, a.aluno_id",
    [turmas],
  );
  const faltas = await cliente.query<{ registro: unknown }>(
    "select to_jsonb(a) as registro from faltas a join frequencias f on f.id = a.frequencia_id where f.turma_id = any($1::uuid[]) order by a.frequencia_id, a.aluno_id, a.horario_id",
    [turmas],
  );
  return { frequencias: frequencias.rows, alunos: alunos.rows, faltas: faltas.rows };
}

async function exportar(): Promise<CopiaFrequenciapp> {
  return ler<CopiaFrequenciapp>(
    await chamar("/api/backup/exportar", "POST", {
      senha: process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
    }),
  );
}

async function limpar() {
  await cliente.query(
    "delete from frequencias where turma_id in (select id from turmas where serie_id = $1)",
    [serieId || null],
  );
  await cliente.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await cliente.query("delete from turmas where serie_id = $1", [serieId || null]);
  await cliente.query("delete from series where nome = $1", [prefixo]);
  await cliente.query("delete from auditoria where alvo like $1", [`${prefixo}%`]);
}

beforeAll(async () => {
  await cliente.connect();
  for (const [login, senha, papel] of [
    ["direcao@escola.exemplo", "DirecaoFrequencia2026", "admin"],
    ["demo@escola.exemplo", "DemoFrequencia2026", "coordenacao"],
  ] as const) {
    const resposta = await chamar("/api/auth/entrar", "POST", { login, senha }, "");
    expect(resposta.status).toBe(200);
    const cookie = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (papel === "admin") admin = cookie;
    else coordenacao = cookie;
  }
  const { rows } = await cliente.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 97) returning id",
    [prefixo],
  );
  serieId = primeiraLinha(rows).id;
});

afterAll(async () => {
  try {
    await limpar();
  } finally {
    await cliente.end();
  }
});

describe("cópia de horários entre turmas", () => {
  it("exige administração e origem autorizada sem copiar aulas", async () => {
    const par = await criarPar();
    const antes = await registrosDeAulas(par.turmaOrigemId);
    for (const [cookie, origem, status] of [
      ["", url, 401],
      [coordenacao, url, 403],
      [admin, "https://origem-invalida.exemplo", 403],
    ] as const) {
      expect((await chamar("/api/horarios/copiar", "POST", par, cookie, origem)).status).toBe(
        status,
      );
    }
    expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(antes);
    expect(await listar(par.turmaDestinoId)).toEqual([]);
  });

  it.each([null, [], {}, { turmaOrigemId: "inválida" }, { turmaDestinoId: "inválida" }])(
    "recusa identificadores inválidos sem alterar a grade: %j",
    async (mudanca) => {
      const par = await criarPar();
      const corpo = mudanca === null || Array.isArray(mudanca) ? mudanca : { ...par, ...mudanca };
      // Um corpo vazio também deve ser recusado, mesmo com turmas existentes.
      const entrada = mudanca && Object.keys(mudanca).length === 0 ? {} : corpo;
      const antes = await registrosDeAulas(par.turmaOrigemId);
      expect((await chamar("/api/horarios/copiar", "POST", entrada)).status).toBe(400);
      expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(antes);
      expect(await listar(par.turmaDestinoId)).toEqual([]);
    },
  );

  it("recusa a mesma turma mesmo com diferenças de caixa no identificador", async () => {
    const par = await criarPar();
    const antes = await registrosDeAulas(par.turmaOrigemId);
    expect(
      (
        await chamar("/api/horarios/copiar", "POST", {
          turmaOrigemId: par.turmaOrigemId,
          turmaDestinoId: par.turmaOrigemId.toUpperCase(),
        })
      ).status,
    ).toBe(400);
    expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(antes);
  });

  it.each(["turmaOrigemId", "turmaDestinoId"] as const)(
    "retorna 404 quando %s não existe",
    async (campo) => {
      const par = await criarPar();
      const antes = await registrosDeAulas(par.turmaOrigemId);
      expect(
        (await chamar("/api/horarios/copiar", "POST", { ...par, [campo]: randomUUID() })).status,
      ).toBe(404);
      expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(antes);
      expect(await listar(par.turmaDestinoId)).toEqual([]);
    },
  );

  it("recusa uma origem sem aulas e preserva o destino", async () => {
    const par = await criarPar(false);
    await criarAula(par.turmaDestinoId, 9);
    const antes = await registrosDeAulas(par.turmaDestinoId);
    expect((await chamar("/api/horarios/copiar", "POST", par)).status).toBe(400);
    expect(await registrosDeAulas(par.turmaDestinoId)).toEqual(antes);
    expect(await listar(par.turmaOrigemId)).toEqual([]);
  });

  it("copia todas as aulas com novos identificadores e preserva dias, nomes e desativação", async () => {
    const par = await criarPar();
    const originais = await listar(par.turmaOrigemId);
    const antes = await registrosDeAulas(par.turmaOrigemId);
    const { horarios } = await ler<{ horarios: Horario[] }>(
      await chamar("/api/horarios/copiar", "POST", par),
      201,
    );
    expect(horarios).toEqual(
      originais.map((aula) => ({
        ...aula,
        id: expect.any(String),
        turmaId: par.turmaDestinoId,
      })),
    );
    expect(horarios.every((aula) => !originais.some((original) => original.id === aula.id))).toBe(
      true,
    );
    expect(new Set(horarios.map((aula) => aula.id)).size).toBe(2);
    expect(await listar(par.turmaDestinoId)).toEqual(horarios);
    expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(antes);
  });

  it.each([true, false])(
    "recusa a grade inteira quando a ordem 2 já existe com ativo=%s",
    async (ativo) => {
      const par = await criarPar();
      await criarAula(par.turmaDestinoId, 2, ativo);
      const origemAntes = await registrosDeAulas(par.turmaOrigemId);
      const destinoAntes = await registrosDeAulas(par.turmaDestinoId);
      const resposta = await chamar("/api/horarios/copiar", "POST", par);
      const { error } = await ler<{ error: string }>(resposta, 409);
      expect(error).toBe("A turma de destino já tem a aula 2. Nenhuma aula foi copiada.");
      expect(await registrosDeAulas(par.turmaDestinoId)).toEqual(destinoAntes);
      expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(origemAntes);
      expect((await listar(par.turmaDestinoId)).map((aula) => aula.ordem)).toEqual([2]);
    },
  );

  it("permite ordens diferentes no destino e mantém faltas, chamadas e cópia JSON", async () => {
    const par = await criarPar();
    const originais = await listar(par.turmaOrigemId);
    const aulaOrigem = primeiraLinha(originais);
    const aulaDestinoId = await criarAula(par.turmaDestinoId, 9);
    await criarHistorico(par.turmaOrigemId, aulaOrigem.id);
    await criarHistorico(par.turmaDestinoId, aulaDestinoId);
    const turmas = [par.turmaOrigemId, par.turmaDestinoId];
    const antes = await historico(turmas);
    const origemAntes = await registrosDeAulas(par.turmaOrigemId);
    const destinoAntes = await registrosDeAulas(par.turmaDestinoId);
    const copiaAntes = await exportar();
    const { horarios } = await ler<{ horarios: Horario[] }>(
      await chamar("/api/horarios/copiar", "POST", par),
      201,
    );
    expect(horarios.map((aula) => aula.ordem)).toEqual([1, 2]);
    expect((await listar(par.turmaDestinoId)).map((aula) => aula.ordem)).toEqual([1, 2, 9]);
    expect((await registrosDeAulas(par.turmaDestinoId)).slice(-1)).toEqual(destinoAntes);
    expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(origemAntes);
    expect(await historico(turmas)).toEqual(antes);
    const copiaDepois = await exportar();
    expect(copiaDepois.formato).toBe(copiaAntes.formato);
    expect(copiaDepois.versao).toBe(copiaAntes.versao);
    expect(copiaDepois.frequencias.filter((chamada) => turmas.includes(chamada.turmaId))).toEqual(
      copiaAntes.frequencias.filter((chamada) => turmas.includes(chamada.turmaId)),
    );
    const idsAntigos = new Set(copiaAntes.horarios.map((aula) => aula.id));
    expect(
      copiaDepois.horarios.filter(
        (aula) => turmas.includes(aula.turmaId) && idsAntigos.has(aula.id),
      ),
    ).toEqual(copiaAntes.horarios.filter((aula) => turmas.includes(aula.turmaId)));
    expect(
      copiaDepois.horarios.filter((aula) => horarios.some((copiada) => copiada.id === aula.id)),
    ).toEqual(horarios);
  });

  it("confirma apenas uma cópia em requisições concorrentes sem duplicar aulas", async () => {
    const par = await criarPar();
    const antes = await registrosDeAulas(par.turmaOrigemId);
    const respostas = await Promise.all([
      chamar("/api/horarios/copiar", "POST", par),
      chamar("/api/horarios/copiar", "POST", par),
    ]);
    expect(respostas.map((resposta) => resposta.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const confirmada = primeiraLinha(respostas.filter((resposta) => resposta.status === 201));
    const { horarios } = await ler<{ horarios: Horario[] }>(confirmada, 201);
    expect(await listar(par.turmaDestinoId)).toEqual(horarios);
    expect(horarios.map((aula) => aula.ordem)).toEqual([1, 2]);
    expect(await registrosDeAulas(par.turmaOrigemId)).toEqual(antes);
    const auditoria = await cliente.query<{ contagem: number }>(
      "select count(*)::int as contagem from auditoria where acao = 'horario.copiar' and alvo like $1 and alvo like $2",
      [`${prefixo}%`, `%Destino ${numeroPar}:%`],
    );
    expect(primeiraLinha(auditoria.rows).contagem).toBe(1);
  });
});
