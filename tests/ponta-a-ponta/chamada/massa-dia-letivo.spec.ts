// Confere a massa de domingo no salvamento real do sábado, sem alterar o relógio do servidor.
import { mock } from "node:test";
import { expect, test } from "@playwright/test";
import { comBanco, criarLiberadoresE2E, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, prepararChamadaParaSaida } from "../helpers/pagina";

const DOMINGO_DA_MASSA = new Date("2025-01-05T12:00:00Z");
const SABADO_DA_CHAMADA = "2025-01-04";

test.use({ serviceWorkers: "block" });
test.afterAll(limparMassaE2E);

test("a massa de domingo permite salvar o sábado sem confirmação histórica", async ({ page }) => {
  // Só a geração da massa recebe o domingo fixo. PostgreSQL e aplicativo mantêm o tempo real.
  mock.timers.enable({ apis: ["Date"], now: DOMINGO_DA_MASSA });
  try {
    await criarMassaE2E();
  } finally {
    mock.timers.reset();
  }

  await page.goto("/");
  await aguardarHidratacao(page);
  const respostaTurmas = await page.request.get("/api/turmas");
  expect(respostaTurmas.status()).toBe(200);
  const { turmas } = (await respostaTurmas.json()) as {
    turmas: { id: string; rotulo: string }[];
  };
  const turma = turmas.find((item) => item.rotulo === "E2E Ano A");
  if (!turma) throw new Error("Turma da massa de domingo não encontrada.");

  const resposta = await page.request.post("/api/frequencias", {
    data: { dia: SABADO_DA_CHAMADA, turmaId: turma.id, faltas: [], revisao: 0 },
  });
  expect(resposta.status(), await resposta.text()).toBe(200);

  const leitura = await page.request.get(
    `/api/frequencias?dia=${SABADO_DA_CHAMADA}&turmaId=${turma.id}`,
  );
  expect(leitura.status()).toBe(200);
  const { frequencia } = (await leitura.json()) as {
    frequencia: { faltas: unknown[] } | null;
  };
  expect(frequencia).not.toBeNull();
  expect(frequencia?.faltas).toEqual([]);
});

test("o inativo sem desistência mantém a confirmação histórica obrigatória", async ({ page }) => {
  mock.timers.enable({ apis: ["Date"], now: DOMINGO_DA_MASSA });
  try {
    await criarMassaE2E();
  } finally {
    mock.timers.reset();
  }
  const inativo = await comBanco(async (banco) => {
    const resultado = await banco.query<{ id: string; turma_id: string }>(
      "update alunos set ativo=false where nome='E2E Aluno Um' returning id, turma_id",
    );
    return resultado.rows[0];
  });
  if (!inativo) throw new Error("Aluno inativo da massa não encontrado.");
  const resposta = await page.request.post("/api/frequencias", {
    data: { dia: SABADO_DA_CHAMADA, turmaId: inativo.turma_id, faltas: [], revisao: 0 },
  });
  expect(resposta.status()).toBe(409);
  expect(await resposta.json()).toMatchObject({ codigo: "CONFIRMACAO_HISTORICA_NECESSARIA" });
  const url = `/api/frequencias?dia=${SABADO_DA_CHAMADA}&turmaId=${inativo.turma_id}`;
  const recusada = await page.request.get(url);
  expect(recusada.status()).toBe(200);
  expect((await recusada.json()).frequencia).toBeNull();

  // Uma desistência conhecida é um modelo distinto, não uma confirmação de vínculo incerto.
  await comBanco((banco) =>
    banco.query("update alunos set desistente_em=$1 where id=$2", [SABADO_DA_CHAMADA, inativo.id]),
  );
  await prepararChamadaParaSaida(page, "E2E Ano A", SABADO_DA_CHAMADA);
  const salva = await page.request.get(url);
  expect(salva.status()).toBe(200);
  const { frequencia } = (await salva.json()) as { frequencia: { alunos: string[] } };
  expect(frequencia.alunos).toHaveLength(1);
  expect(frequencia.alunos).not.toContain(inativo.id);
});

test("a saída do sábado exige chamada com participação e preserva o retrato das aulas", async ({
  page,
}) => {
  mock.timers.enable({ apis: ["Date"], now: DOMINGO_DA_MASSA });
  try {
    await criarMassaE2E();
  } finally {
    mock.timers.reset();
  }
  await criarLiberadoresE2E();
  const respostaAlunos = await page.request.get("/api/alunos");
  expect(respostaAlunos.status()).toBe(200);
  const { alunos } = (await respostaAlunos.json()) as { alunos: { id: string; nome: string }[] };
  const aluno = alunos.find((item) => item.nome === "E2E Aluno Um");
  if (!aluno) throw new Error("Aluno da massa de saída não encontrado.");
  const data = {
    alunoId: aluno.id,
    dia: SABADO_DA_CHAMADA,
    momento: "aula_2",
    horario: "08:10",
    texto: "E2E Atendimento externo",
    liberadoPorCodigo: "E2EDIRETOR",
  };
  const semChamada = await page.request.post("/api/saidas", { data });
  expect(semChamada.status()).toBe(409);
  expect(await semChamada.json()).toMatchObject({ codigo: "CONFIRMACAO_HISTORICA_NECESSARIA" });

  const turmaId = await prepararChamadaParaSaida(page, "E2E Ano A", SABADO_DA_CHAMADA);
  const criada = await page.request.post("/api/saidas", { data });
  expect(criada.status(), await criada.text()).toBe(201);
  const { saida } = (await criada.json()) as { saida: { id: string } };
  const leitura = await page.request.get(
    `/api/saidas?dia=${SABADO_DA_CHAMADA}&alunoId=${aluno.id}`,
  );
  expect(leitura.status()).toBe(200);
  const { saidas } = (await leitura.json()) as {
    saidas: { aulasReferencia: { versao: number; aulas: unknown[] } }[];
  };
  expect(saidas).toHaveLength(1);
  expect(saidas[0]).toMatchObject({
    id: saida.id,
    turmaHistoricaId: turmaId,
    turmaHistoricaNome: "E2E Ano A",
    origemReferencia: "CHAMADA_HISTORICA",
    aulasReferencia: {
      versao: 1,
      aulas: expect.arrayContaining([
        expect.objectContaining({ ordem: 1, inicio: "07:00", fim: "07:50" }),
        expect.objectContaining({ ordem: 2, inicio: "07:50", fim: "08:40" }),
        expect.objectContaining({ ordem: 3, inicio: "08:40", fim: "09:30" }),
      ]),
    },
  });
  expect(saidas[0]?.aulasReferencia.aulas).toHaveLength(3);
});
