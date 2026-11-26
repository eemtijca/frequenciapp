// PDF da Grade contra a API e o PostgreSQL: retrato, hash e auditoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { diaLocal, ultimoDiaDeChamada } from "@/domain/frequencia";
import { textoDoPdf } from "@/domain/pdf-texto";

const url = process.env.APP_URL ?? "http://localhost:3000";
const prefixo = "QA Grade PDF";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let cookie = "";
let turma = "";
let aluno = "";
let dia = "";

async function chamar(
  caminho: string,
  method = "GET",
  body?: unknown,
  sessao = cookie,
  origem = url,
) {
  return fetch(`${url}${caminho}`, {
    method,
    headers: { Origin: origem, Cookie: sessao, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function limpar() {
  await banco.query(
    "delete from auditoria where alvo like 'sha256:%' and acao = 'relatorio-grade.preparar'",
  );
  await banco.query(
    "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = $1))",
    [prefixo],
  );
  await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [prefixo],
  );
  await banco.query("delete from series where nome = $1", [prefixo]);
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  await banco.query(
    "insert into justificativas (codigo, rotulo) select 'CM', 'Consulta Médica' where not exists (select 1 from justificativas where codigo = 'CM')",
  );
  dia = ultimoDiaDeChamada(diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza"));
  const entrada = await chamar(
    "/api/auth/entrar",
    "POST",
    {
      email: process.env.TESTE_EMAIL ?? "demo@escola.exemplo",
      senha: process.env.TESTE_SENHA ?? "DemoFrequencia2026",
    },
    "",
  );
  expect(entrada.status).toBe(200);
  cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 97) returning id",
    [prefixo],
  );
  const criada = await banco.query<{ id: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
    [serie.rows[0]?.id],
  );
  turma = criada.rows[0]?.id ?? "";
  const horarios: string[] = [];
  for (let ordem = 1; ordem <= 5; ordem += 1) {
    const horario = await banco.query<{ id: string }>(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo, disciplinas) values ($1, $2, $3, $4, $5, true, $6::jsonb) returning id",
      [
        turma,
        ordem,
        `07:${String(ordem).padStart(2, "0")}`,
        `07:${String(ordem + 40).padStart(2, "0")}`,
        [1, 2, 3, 4, 5, 6],
        JSON.stringify(
          ordem === 1
            ? {
                "1": "Matemática",
                "2": "Matemática",
                "3": "Matemática",
                "4": "Matemática",
                "5": "Matemática",
                "6": "Matemática",
              }
            : {},
        ),
      ],
    );
    horarios.push(horario.rows[0]?.id ?? "");
  }
  const pessoa = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, 1) returning id",
    [`${prefixo} Ágata`, turma],
  );
  aluno = pessoa.rows[0]?.id ?? "";
  const salva = await chamar("/api/frequencias", "POST", {
    dia,
    turmaId: turma,
    revisao: 0,
    faltas: [{ alunoId: aluno, horarios: horarios.slice(0, 2), justificativa: "CM" }],
    confirmarHistorico: true,
  });
  expect(salva.status).toBe(200);
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

describe("PDF da grade", () => {
  it("exige sessão e origem válida", async () => {
    const corpo = { turmaOriginalId: turma, de: dia, ate: dia };
    expect((await chamar("/api/relatorios/grade", "POST", corpo, "")).status).toBe(401);
    expect(
      (await chamar("/api/relatorios/grade", "POST", corpo, cookie, "https://outro.exemplo"))
        .status,
    ).toBe(403);
  });

  it("recusa período e turma inválidos sem gravar auditoria", async () => {
    const antes = await banco.query(
      "select count(*)::int as total from auditoria where acao = 'relatorio-grade.preparar'",
    );
    for (const corpo of [
      {},
      { turmaOriginalId: turma, de: dia, ate: dia, nome: prefixo },
      { turmaOriginalId: turma, de: "2026-13-40", ate: dia },
      { turmaOriginalId: turma, de: dia, ate: "2020-01-01" },
      { turmaOriginalId: "6f8c0a52-91d4-4b3e-a7c8-5d2e1f0a9b73", de: dia, ate: dia },
    ]) {
      const resposta = await chamar("/api/relatorios/grade", "POST", corpo);
      expect(resposta.status === 400 || resposta.status === 404).toBe(true);
      const json = (await resposta.json()) as { error?: string; pdf?: string };
      expect(json.pdf).toBeUndefined();
      expect(json.error).toBeTruthy();
    }
    const depois = await banco.query(
      "select count(*)::int as total from auditoria where acao = 'relatorio-grade.preparar'",
    );
    expect(depois.rows[0]?.total).toBe(antes.rows[0]?.total);
  });

  it("devolve o PDF do retrato e audita só o hash", async () => {
    const resposta = await chamar("/api/relatorios/grade", "POST", {
      turmaOriginalId: turma,
      de: dia,
      ate: dia,
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const corpo = (await resposta.json()) as {
      nome: string;
      pdf: string;
      retrato: { instante: string; hash: string; codigo: string };
    };
    expect(corpo.nome).toBe("relatorio-grade.pdf");
    expect(corpo.retrato.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(corpo.retrato.codigo).toBe(
      `${corpo.retrato.hash.slice(0, 4).toUpperCase()}-${corpo.retrato.hash.slice(4, 8).toUpperCase()}`,
    );
    const pdf = Buffer.from(corpo.pdf, "base64");
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const texto = textoDoPdf(pdf);
    expect(texto).toContain(corpo.retrato.hash);
    expect(texto).toContain(corpo.retrato.instante);
    expect(texto).toContain(corpo.retrato.codigo);
    expect(texto).toContain("2/5");
    expect(texto).toContain(`${prefixo} Ágata`);
    expect(texto).toContain("Consulta Médica");
    const auditoria = await banco.query<{ acao: string; alvo: string }>(
      "select acao, alvo from auditoria where acao = 'relatorio-grade.preparar' and alvo = $1",
      [`sha256:${corpo.retrato.hash}`],
    );
    expect(auditoria.rows).toEqual([
      { acao: "relatorio-grade.preparar", alvo: `sha256:${corpo.retrato.hash}` },
    ]);
    expect(JSON.stringify(auditoria.rows)).not.toContain(prefixo);

    const repetida = await chamar("/api/relatorios/grade", "POST", {
      turmaOriginalId: turma,
      de: dia,
      ate: dia,
    });
    const segundo = (await repetida.json()) as { retrato: { hash: string } };
    expect(segundo.retrato.hash).not.toBe(corpo.retrato.hash);
  });
});
