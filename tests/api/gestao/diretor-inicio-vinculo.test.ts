// Início do acompanhamento do diretor de turma: data retroativa no cadastro,
// recusa de data futura, antecipação na edição sem encurtar o que já vale e
// turma nova entrando na data informada. Massa com prefixo QD.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { diaLocal, diaSeguinte } from "@/domain/frequencia";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const IDENTIFICADOR = "qd-inicio";

let banco: pg.Client | null = null;
let cookieAdmin = "";
const turmas: string[] = [];

interface Diretor {
  id: string;
  turmas: { turmaId: string; inicio: string }[];
}

const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");

async function limparMassa() {
  if (!banco) return;
  await banco.query("delete from usuarios where email like 'qd-inicio%'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QD Inicio')",
  );
  await banco.query("delete from series where nome = 'QD Inicio'");
}

function chamar(caminho: string, metodo: string, corpo?: unknown): Promise<Response> {
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

async function diretor(resposta: Response): Promise<Diretor> {
  return ((await resposta.json()) as { diretor: Diretor }).diretor;
}

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (conexao?.startsWith("postgresql://")) {
    banco = new pg.Client({ connectionString: conexao });
    await banco.connect();
  }
  await limparMassa();
  const entrada = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ login: EMAIL_ADMIN, senha: SENHA_ADMIN, lembrar: false }),
  });
  cookieAdmin = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
  const serie = (await (
    await chamar("/api/series", "POST", { nome: "QD Inicio", ordem: 97 })
  ).json()) as { serie: { id: string } };
  for (const nome of ["A", "B"]) {
    const turma = (await (
      await chamar("/api/turmas", "POST", { serieId: serie.serie.id, nome })
    ).json()) as { turma: { id: string } };
    turmas.push(turma.turma.id);
  }
});

afterAll(async () => {
  await limparMassa();
  if (banco) await banco.end();
});

describe("início do acompanhamento do diretor", () => {
  const passado = diaSeguinte(hoje, -30);
  const maisAntigo = diaSeguinte(hoje, -60);
  let id = "";

  it("recusa data futura e data inválida", async () => {
    const futura = await chamar("/api/diretores", "POST", {
      nome: "QD Inicio Futuro",
      identificador: "qd-inicio-futuro",
      turmaIds: [turmas[0]],
      inicioVinculo: diaSeguinte(hoje, 1),
    });
    expect(futura.status).toBe(400);
    const invalida = await chamar("/api/diretores", "POST", {
      nome: "QD Inicio Invalido",
      identificador: "qd-inicio-invalido",
      turmaIds: [turmas[0]],
      inicioVinculo: "2026-13-40",
    });
    expect(invalida.status).toBe(400);
  });

  it("cadastra com data retroativa e, sem data, começa hoje", async () => {
    const criado = await diretor(
      await chamar("/api/diretores", "POST", {
        nome: "QD Inicio Passado",
        identificador: IDENTIFICADOR,
        turmaIds: [turmas[0]],
        inicioVinculo: passado,
      }),
    );
    id = criado.id;
    expect(criado.turmas.map((item) => item.inicio)).toEqual([passado]);

    const padrao = await diretor(
      await chamar("/api/diretores", "POST", {
        nome: "QD Inicio Padrao",
        identificador: `${IDENTIFICADOR}-padrao`,
        turmaIds: [turmas[0]],
      }),
    );
    expect(padrao.turmas.map((item) => item.inicio)).toEqual([hoje]);
  });

  it("na edição só antecipa o início já registrado e a turma nova entra na data informada", async () => {
    const depois = await diretor(
      await chamar(`/api/diretores/${id}`, "PATCH", {
        inicioVinculo: diaSeguinte(hoje, -5),
      }),
    );
    expect(depois.turmas.map((item) => item.inicio)).toEqual([passado]);

    const antecipado = await diretor(
      await chamar(`/api/diretores/${id}`, "PATCH", {
        turmaIds: [turmas[0], turmas[1]],
        inicioVinculo: maisAntigo,
      }),
    );
    const porTurma = new Map(antecipado.turmas.map((item) => [item.turmaId, item.inicio]));
    expect(porTurma.get(turmas[0] ?? "")).toBe(maisAntigo);
    expect(porTurma.get(turmas[1] ?? "")).toBe(maisAntigo);
  });

  it("data futura na edição também é recusada", async () => {
    const resposta = await chamar(`/api/diretores/${id}`, "PATCH", {
      inicioVinculo: diaSeguinte(hoje, 1),
    });
    expect(resposta.status).toBe(400);
  });
});
