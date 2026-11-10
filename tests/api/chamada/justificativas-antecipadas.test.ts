// Justificativas antecipadas com calendário civil, lote atômico e integração sem presenças inventadas.
import { randomUUID } from "node:crypto";
import { procurarDia } from "../../helpers/calendario-fixture";
import {
  conferirConexaoFixture,
  criarFeriadoDaFixture,
  lerDiasComFrequencia,
  lerFeriados,
  removerFeriadoDaFixture,
} from "../../helpers/feriados-banco";
import { executarLimpezas } from "../../helpers/limpeza-fixture";
import {
  guardaDependentesFixture,
  inserirJustificativaFixture,
  novasJustificativasFixture,
  removerJustificativaFixture,
} from "../../helpers/justificativas-fixture";
import { removerFeriadoEmConexaoNova } from "../../helpers/teardown-fixtures";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { diaLocal, diasEntre, ehDomingo } from "@/domain/frequencia";
import { selecionarSchema } from "@/infra/schema-postgres.mjs";

const origem = process.env.APP_URL ?? "http://localhost:3000";
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Antecipadas";
const justificativasFixture = novasJustificativasFixture();
const [primeiraJustificativa, segundaJustificativa] = justificativasFixture;
const consultarFixture = (sql: string, parametros: unknown[]) => cliente.query(sql, parametros);
let historico = "2026-06-22";
const nomeFeriado = `${prefixo} ${randomUUID()}`;
let feriadoCriado = "";
let conexaoVerificada = false;
let urlVerificada = "";
let schemaVerificado: string | undefined;
let conexaoEncerrada = false;
let serie = "";
let turma = "";
let outraTurma = "";
let aluno = "";
let colega = "";
let cookie = "";
let admin = "";
const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
function deslocar(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
let futuro = deslocar(hoje, 8);

async function chamar(caminho: string, metodo = "GET", dados?: unknown, sessao = cookie) {
  return fetch(`${origem}${caminho}`, {
    method: metodo,
    headers: { Origin: origem, Cookie: sessao, "Content-Type": "application/json" },
    ...(dados === undefined ? {} : { body: JSON.stringify(dados) }),
  });
}
async function entrar(login: string, senha: string) {
  const resposta = await chamar("/api/auth/entrar", "POST", { login, senha }, "");
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const dados = (dia = historico, mais: Record<string, unknown> = {}) => ({
  alunoId: aluno,
  turmaId: turma,
  dia,
  tipo: "JUSTIFICADA",
  justificativa: primeiraJustificativa.codigo,
  turno: null,
  aulas: [],
  revisao: 0,
  ...mais,
});
const corpoChamada = (dia = historico, mais: Record<string, unknown> = {}) => ({
  dia,
  turmaId: turma,
  revisao: 0,
  faltas: [],
  confirmarHistorico: true,
  motivo: "Teste sintético de justificativa antecipada",
  ...mais,
});
async function gravar(entrada: unknown) {
  const r = await chamar("/api/frequencias-parciais", "POST", entrada);
  expect(r.status).toBe(200);
  return r.json();
}
async function lerChamada(dia = historico, id = turma) {
  const r = await chamar(`/api/frequencias?dia=${dia}&turmaId=${id}`);
  expect(r.status).toBe(200);
  return r.json();
}
async function limparRegistros(limparFeriado = true) {
  await executarLimpezas([
    () =>
      cliente.query("delete from frequencias where turma_id=any($1::uuid[])", [
        [turma, outraTurma].filter(Boolean),
      ]),
    () =>
      cliente.query("delete from frequencias_parciais where turma_id=any($1::uuid[])", [
        [turma, outraTurma].filter(Boolean),
      ]),
    async () => {
      if (limparFeriado && conexaoVerificada && feriadoCriado) {
        await removerFeriadoDaFixture(cliente, feriadoCriado, nomeFeriado);
        feriadoCriado = "";
      }
    },
  ]);
}
beforeAll(async () => {
  try {
    await cliente.connect();
    conferirConexaoFixture(cliente);
    const conexao = process.env.DATABASE_URL;
    if (!conexao) throw new Error("DATABASE_URL é obrigatória para a fixture.");
    await selecionarSchema(cliente, conexao);
    urlVerificada = conexao;
    schemaVerificado = process.env.DATABASE_SCHEMA;
    conexaoVerificada = true;
  } catch (erro) {
    conexaoEncerrada = true;
    await cliente.end().catch(() => undefined);
    throw erro;
  }
  historico = procurarDia(
    historico < hoje ? historico : hoje,
    -1,
    [1],
    await lerFeriados(cliente),
    365,
    [0, 1, 2],
  );
  cookie = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  admin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  serie =
    (
      await cliente.query<{ id: string }>(
        "insert into series(nome,ordem) values ($1,99) returning id",
        [prefixo],
      )
    ).rows[0]?.id ?? "";
  for (const nome of ["A", "B"]) {
    const id =
      (
        await cliente.query<{ id: string }>(
          "insert into turmas(serie_id,nome) values ($1,$2) returning id",
          [serie, nome],
        )
      ).rows[0]?.id ?? "";
    if (nome === "A") turma = id;
    else outraTurma = id;
    for (const ordem of [1, 2])
      await cliente.query(
        "insert into horarios(turma_id,ordem,inicio,fim,dias_semana,ativo) values ($1,$2,'07:00','08:00',array[1,2,3,4,5,6],true)",
        [id, ordem],
      );
  }
  for (const [i, nome] of ["Aluna", "Colega"].entries()) {
    const id =
      (
        await cliente.query<{ id: string }>(
          "insert into alunos(nome,turma_id,turma_original_id,ordem) values ($1,$2,$2,$3) returning id",
          [`${prefixo} ${nome}`, turma, i + 1],
        )
      ).rows[0]?.id ?? "";
    if (i === 0) aluno = id;
    else colega = id;
  }
  for (const item of justificativasFixture)
    await inserirJustificativaFixture(consultarFixture, item);
});
beforeEach(async () => {
  await limparRegistros();
  futuro = procurarDia(
    deslocar(hoje, 8),
    1,
    [1],
    [...(await lerFeriados(cliente)), ...(await lerDiasComFrequencia(cliente))],
    325,
    [0, 2],
  );
  await cliente.query("update horarios set ativo=true where turma_id=any($1::uuid[])", [
    [turma, outraTurma],
  ]);
  await cliente.query("update alunos set turma_id=$1,turma_original_id=$1 where id=$2", [
    turma,
    aluno,
  ]);
});
afterAll(async () => {
  const guarda = guardaDependentesFixture();
  await executarLimpezas(
    conexaoVerificada
      ? [
          () => guarda.limpar(() => limparRegistros(false)),
          async () => {
            if (!feriadoCriado) return;
            try {
              if (
                process.env.DATABASE_URL !== urlVerificada ||
                process.env.DATABASE_SCHEMA !== schemaVerificado
              )
                throw new Error("Configuração da conexão ou schema mudou desde a preparação.");
              const novo = new pg.Client({
                connectionString: urlVerificada,
                connectionTimeoutMillis: 5_000,
                query_timeout: 10_000,
                keepAlive: true,
              });
              await removerFeriadoEmConexaoNova(
                novo,
                conferirConexaoFixture,
                (conexao) => selecionarSchema(conexao, urlVerificada, schemaVerificado),
                removerFeriadoDaFixture,
                feriadoCriado,
                nomeFeriado,
              );
              feriadoCriado = "";
            } catch (erro) {
              console.error(
                `Falha ao limpar feriado da fixture (${feriadoCriado}, ${nomeFeriado}); remoção não confirmada.`,
                erro,
              );
              throw erro;
            }
          },
          guarda.somenteSeLimpos(() =>
            cliente.query("delete from alunos where id=any($1::uuid[])", [
              [aluno, colega].filter(Boolean),
            ]),
          ),
          guarda.somenteSeLimpos(() =>
            cliente.query("delete from horarios where turma_id=any($1::uuid[])", [
              [turma, outraTurma].filter(Boolean),
            ]),
          ),
          guarda.somenteSeLimpos(async () => {
            if (serie)
              await cliente.query("delete from turmas where id=any($1::uuid[]) and serie_id=$2", [
                [turma, outraTurma].filter(Boolean),
                serie,
              ]);
          }),
          guarda.somenteSeLimpos(async () => {
            if (serie) await cliente.query("delete from series where id=$1", [serie]);
          }),
          ...justificativasFixture.map(
            (item) => () => removerJustificativaFixture(consultarFixture, item),
          ),
        ]
      : [],
    conexaoEncerrada ? undefined : () => cliente.end(),
  );
});
describe("Justificativas antecipadas", () => {
  it("permite somente justificativa no futuro e mantém a Chamada normal bloqueada", async () => {
    expect(
      (
        await chamar(
          "/api/frequencias-parciais",
          "POST",
          dados(futuro, { tipo: "DIA_INTEIRO", justificativa: null }),
        )
      ).status,
    ).toBe(400);
    expect((await chamar("/api/frequencias", "POST", corpoChamada(futuro))).status).toBe(400);
    expect(
      (
        await chamar(
          "/api/frequencias-parciais",
          "POST",
          dados(futuro, { justificativa: "NaoExiste" }),
        )
      ).status,
    ).toBe(400);
    const salva = await gravar(dados(futuro));
    expect(salva.registro).toMatchObject({
      tipo: "JUSTIFICADA",
      justificativa: primeiraJustificativa.codigo,
      dia: futuro,
    });
    expect((await lerChamada(futuro)).justificativasAntecipadas).toEqual([]);
    expect(
      (await cliente.query("select id from frequencias where turma_id=$1", [turma])).rowCount,
    ).toBe(0);
  });
  it.each([
    ["inversão", () => ({ ate: deslocar(futuro, -1) })],
    ["mais de 31 dias", () => ({ ate: deslocar(futuro, 31) })],
    ["motivo ausente", () => ({ justificativa: null })],
    ["combinação com presença", () => ({ turno: "MANHA" })],
    ["observação extensa", () => ({ justificativa: "O", observacao: "x".repeat(201) })],
    ["limite anual", () => ({ dia: deslocar(hoje, 370) })],
  ])("recusa %s sem gravar um registro", async (_nome, mudanca) => {
    const resposta = await chamar("/api/frequencias-parciais", "POST", dados(futuro, mudanca()));
    expect(resposta.status).toBe(400);
    expect(
      (await cliente.query("select id from frequencias_parciais where aluno_id=$1", [aluno]))
        .rowCount,
    ).toBe(0);
  });
  it("recusa o período inteiro quando uma chamada histórica está sem aulas de referência", async () => {
    expect(
      (await chamar("/api/frequencias", "POST", corpoChamada(historico, { faltas: [aluno] })))
        .status,
    ).toBe(200);
    await cliente.query(
      "delete from aulas_chamada where frequencia_id in (select id from frequencias where turma_id=$1)",
      [turma],
    );
    await cliente.query("update horarios set ativo=false where turma_id=$1", [turma]);
    const resposta = await chamar(
      "/api/frequencias-parciais",
      "POST",
      dados(historico, { ate: deslocar(historico, 2) }),
    );
    expect(resposta.status).toBe(409);
    expect(
      (await cliente.query("select id from frequencias_parciais where aluno_id=$1", [aluno]))
        .rowCount,
    ).toBe(0);
    const chamada = (await lerChamada()).frequencia;
    expect(chamada.revisao).toBe(1);
    expect(chamada.faltas).toEqual([expect.objectContaining({ alunoId: aluno })]);
    expect(chamada.faltas[0].justificativa).toBeUndefined();
  });
  it("grava o período sem domingos ou feriados e recusa sobreposição sem gravar parte do lote", async () => {
    const ate = deslocar(futuro, 6);
    const feriado = deslocar(futuro, 2);
    feriadoCriado = feriado;
    await criarFeriadoDaFixture(cliente, feriado, nomeFeriado);
    const feriados = new Set(await lerFeriados(cliente));
    const esperados = diasEntre(futuro, ate).filter((d) => !ehDomingo(d) && !feriados.has(d));
    const salva = await gravar(dados(futuro, { ate }));
    expect(salva.registros.map((r: { dia: string }) => r.dia)).toEqual(esperados);
    expect(
      (await chamar("/api/frequencias-parciais", "POST", dados(deslocar(futuro, -1), { ate })))
        .status,
    ).toBe(409);
    expect(
      (await cliente.query("select id from frequencias_parciais where aluno_id=$1", [aluno]))
        .rowCount,
    ).toBe(esperados.length);
  });
  it("propõe FJ sem gravar presenças e aplica a justificativa na primeira chamada", async () => {
    const salva = await gravar(dados());
    const leitura = await lerChamada();
    expect(leitura.frequencia).toBeNull();
    expect(leitura.justificativasAntecipadas).toMatchObject([
      { id: salva.registro.id, justificativa: primeiraJustificativa.codigo, alunoId: aluno },
    ]);
    const r = await chamar("/api/frequencias", "POST", corpoChamada());
    expect(r.status).toBe(200);
    const chamadaSalva = (await r.json()).frequencia;
    expect(chamadaSalva.faltas).toEqual([
      expect.objectContaining({ alunoId: aluno, justificativa: primeiraJustificativa.codigo }),
    ]);
    expect(chamadaSalva.alunos).toContain(colega);
  });
  it("recusa uma proposta desatualizada e permite a correção explícita da equipe", async () => {
    const salva = await gravar(dados());
    const anterior = (await lerChamada()).justificativasAntecipadas.map(
      (j: { id: string; revisao: number }) => ({ id: j.id, revisao: j.revisao }),
    );
    await gravar(
      dados(historico, {
        revisao: salva.registro.revisao,
        justificativa: segundaJustificativa.codigo,
      }),
    );
    const requisicao = corpoChamada(historico, { justificativasAntecipadas: anterior });
    const conflito = await chamar("/api/frequencias", "POST", requisicao);
    expect(conflito.status).toBe(409);
    expect((await conflito.json()).codigo).toBe("JUSTIFICATIVAS_ALTERADAS");
    expect((await lerChamada()).frequencia).toBeNull();
    const atuais = (await lerChamada()).justificativasAntecipadas.map(
      (j: { id: string; revisao: number }) => ({ id: j.id, revisao: j.revisao }),
    );
    expect(
      (
        await chamar("/api/frequencias", "POST", {
          ...requisicao,
          justificativasAntecipadas: atuais,
        })
      ).status,
    ).toBe(200);
    expect((await lerChamada()).frequencia.faltas).toEqual([]);
  });
  it("corrige só o aluno escolhido em chamada já salva e preserva a confirmação do colega", async () => {
    const r = await chamar(
      "/api/frequencias",
      "POST",
      corpoChamada(historico, { faltas: [aluno, colega] }),
    );
    expect(r.status).toBe(200);
    expect(
      (
        await chamar("/api/frequencias/seduc", "POST", {
          dia: historico,
          turmaId: turma,
          alunoId: colega,
          registrado: true,
          revisao: 1,
          revisaoSeduc: 0,
        })
      ).status,
    ).toBe(200);
    await gravar(dados());
    const chamada = (await lerChamada()).frequencia;
    expect(chamada.revisao).toBe(2);
    expect(
      chamada.faltas.find((f: { alunoId: string }) => f.alunoId === aluno)?.justificativa,
    ).toBe(primeiraJustificativa.codigo);
    expect(
      chamada.faltas.find((f: { alunoId: string }) => f.alunoId === colega)?.justificativa,
    ).toBeUndefined();
    expect(
      chamada.confirmacoesSeduc.find((c: { alunoId: string }) => c.alunoId === colega)
        ?.registradoSeduc,
    ).toBe(true);
    expect(
      (await chamar("/api/frequencias", "POST", corpoChamada(historico, { revisao: 1 }))).status,
    ).toBe(409);
  });
  it("acompanha o aluno transferido sem aplicar a justificativa na turma antiga", async () => {
    await gravar(dados());
    await cliente.query("update alunos set turma_id=$1,turma_original_id=$1 where id=$2", [
      outraTurma,
      aluno,
    ]);
    expect((await lerChamada()).justificativasAntecipadas).toEqual([]);
    expect((await lerChamada(historico, outraTurma)).justificativasAntecipadas).toMatchObject([
      { alunoId: aluno, turmaId: outraTurma },
    ]);
    expect(
      (await chamar("/api/frequencias", "POST", corpoChamada(historico, { turmaId: outraTurma })))
        .status,
    ).toBe(200);
    expect((await lerChamada(historico, outraTurma)).frequencia.faltas).toMatchObject([
      { alunoId: aluno, justificativa: primeiraJustificativa.codigo },
    ]);
  });
  it("protege o catálogo em uso e não apaga a frequência consolidada ao remover a agenda", async () => {
    const salva = await gravar(dados());
    expect(
      (
        await chamar(
          `/api/justificativas/${primeiraJustificativa.codigo}`,
          "DELETE",
          undefined,
          admin,
        )
      ).status,
    ).toBe(409);
    expect((await chamar("/api/frequencias", "POST", corpoChamada())).status).toBe(200);
    expect(
      (
        await chamar(`/api/frequencias-parciais/${salva.registro.id}`, "DELETE", {
          revisao: salva.registro.revisao,
        })
      ).status,
    ).toBe(200);
    expect((await lerChamada()).frequencia.faltas).toMatchObject([
      { alunoId: aluno, justificativa: primeiraJustificativa.codigo },
    ]);
  });
  it("preserva o motivo e o agendamento na cópia de segurança e na restauração", async () => {
    const salva = await gravar(dados(futuro));
    const exportacao = await chamar(
      "/api/backup/exportar",
      "POST",
      { senha: "DirecaoFrequencia2026" },
      admin,
    );
    expect(exportacao.status).toBe(200);
    const copia = await exportacao.json();
    expect(
      copia.frequenciasParciais.find((r: { id: string }) => r.id === salva.registro.id),
    ).toMatchObject({
      tipo: "JUSTIFICADA",
      justificativa: primeiraJustificativa.codigo,
      dia: futuro,
    });
    const recorte = {
      formato: copia.formato,
      versao: copia.versao,
      series: copia.series.filter((r: { id: string }) => r.id === serie),
      turmas: copia.turmas.filter((r: { id: string }) => r.id === turma),
      horarios: [],
      alunos: copia.alunos.filter((r: { id: string }) => r.id === aluno),
      frequencias: [],
      saidas: [],
      justificativas: copia.justificativas.filter(
        (r: { codigo: string }) => r.codigo === primeiraJustificativa.codigo,
      ),
      frequenciasParciais: copia.frequenciasParciais.filter(
        (r: { id: string }) => r.id === salva.registro.id,
      ),
    };
    await cliente.query("delete from frequencias_parciais where id=$1", [salva.registro.id]);
    const restauracao = await chamar("/api/backup", "POST", recorte, admin);
    expect(restauracao.status).toBe(200);
    expect(
      (
        await cliente.query("select tipo,justificativa from frequencias_parciais where id=$1", [
          salva.registro.id,
        ])
      ).rows[0],
    ).toMatchObject({ tipo: "JUSTIFICADA", justificativa: primeiraJustificativa.codigo });
  });
});
