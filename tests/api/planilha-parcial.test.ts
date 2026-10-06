// Contratos do terceiro arquivo Google: prévia, confirmação e atualização revisada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";
import { CABECALHO_PARCIAL } from "@/domain/planilha-parcial";
import { CHAVE_TRAVA_PARCIAL } from "@/infra/trava-planilha-parcial";
const url = process.env.APP_URL ?? "http://localhost:3000";
const dia = "2026-06-15";
const periodo = { de: dia, ate: dia };
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let google: GoogleFalso;
let cookie = "";
let cookieAdmin = "";
let aluno = "";
let turma = "";
let registro = "";
async function chamar(caminho: string, method = "GET", body?: unknown, sessao = cookieAdmin) {
  return fetch(`${url}${caminho}`, {
    method,
    headers: { Origin: url, Cookie: sessao, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function entrar(email: string, senha: string) {
  const resposta = await chamar("/api/auth/entrar", "POST", { email, senha }, "");
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function limpar() {
  await banco.query("delete from alunos where nome like 'QA Planilha Parcial %'");
  await banco.query(
    "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = 'QA Planilha Parcial'))",
  );
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QA Planilha Parcial')",
  );
  await banco.query("delete from series where nome = 'QA Planilha Parcial'");
  await banco.query(
    "update integracoes_planilha set ativa = false, google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null, esquema = null, esquema_em = null, assinatura_esquema = null, envio_automatico = false where id in ('principal', 'saidas', 'parcial')",
  );
}
async function previa(opcoes: Record<string, unknown> = {}) {
  const resposta = await chamar(
    "/api/planilha-parcial/simular",
    "POST",
    { ...periodo, ...opcoes },
    cookie,
  );
  expect(resposta.status).toBe(200);
  return (await resposta.json()) as {
    planoHash: string;
    novas: number;
    existentes: number;
    bloqueado: boolean;
    atualizacoes: number;
  };
}
beforeAll(async () => {
  await banco.connect();
  await limpar();
  google = await criarGoogleFalso();
  cookie = await entrar(
    process.env.TESTE_EMAIL ?? "demo@escola.exemplo",
    process.env.TESTE_SENHA ?? "DemoFrequencia2026",
  );
  cookieAdmin = await entrar(
    process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo",
    process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
  );
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ('QA Planilha Parcial', 96) returning id",
  );
  const turmas = await banco.query<{ id: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
    [serie.rows[0]?.id],
  );
  turma = turmas.rows[0]?.id ?? "";
  const alunos = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem) values ('QA Planilha Parcial Um', $1, $1, 1) returning id",
    [turma],
  );
  aluno = alunos.rows[0]?.id ?? "";
  const parciais = await banco.query<{ id: string }>(
    "insert into frequencias_parciais (aluno_id, dia, turma_id, aluno_nome, turma_nome, tipo, turno, aulas, atualizado_em) values ($1, $2, $3, 'QA Planilha Parcial Um', 'QA Planilha Parcial A', 'TURNO', 'MANHA', '{}', now()) returning id",
    [aluno, dia, turma],
  );
  registro = parciais.rows[0]?.id ?? "";
  await google.conectar(banco);
});
afterAll(async () => {
  await limpar();
  await google?.fechar();
  await banco.end();
});
describe("planilha de chamada parcial", () => {
  it("exige sessão, administração para configuração e origem permitida", async () => {
    expect((await chamar("/api/planilha-parcial/estado", "GET", undefined, "")).status).toBe(401);
    expect((await chamar("/api/planilha-parcial", "GET", undefined, cookie)).status).toBe(403);
    expect(
      (await chamar("/api/planilha-parcial/preparar", "POST", { confirmacao: true }, cookie))
        .status,
    ).toBe(403);
    expect(
      (
        await fetch(`${url}/api/planilha-parcial/simular`, {
          method: "POST",
          headers: {
            Origin: "https://exemplo.invalid",
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(periodo),
        })
      ).status,
    ).toBe(403);
  });
  it("reutiliza autorização da frequência e exige um terceiro arquivo separado", async () => {
    expect(
      (
        await chamar("/api/planilha/google/selecionar", "POST", {
          finalidade: "PARCIAL",
          id: "planilha-sintetica",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await chamar("/api/planilha/google/selecionar", "POST", {
          finalidade: "PARCIAL",
          id: "planilha-parcial-sintetica",
        })
      ).status,
    ).toBe(200);
    const resposta = await chamar("/api/planilha-parcial");
    const dados = (await resposta.json()) as {
      integracao: {
        ativa: boolean;
        contaGoogle: boolean;
        preparada: boolean;
        googlePlanilha: { id: string };
      };
    };
    expect(dados.integracao).toMatchObject({
      ativa: false,
      contaGoogle: true,
      preparada: false,
      googlePlanilha: { id: "planilha-parcial-sintetica" },
    });
    expect(JSON.stringify(dados)).not.toContain("RefreshToken");
    expect(
      (
        await chamar("/api/planilha/google/selecionar", "POST", {
          finalidade: "FREQUENCIA",
          id: "planilha-parcial-sintetica",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await chamar("/api/planilha/google/selecionar", "POST", {
          finalidade: "SAIDAS",
          id: "planilha-parcial-sintetica",
        })
      ).status,
    ).toBe(409);
  });
  it("prepara a aba com confirmação explícita e preserva a aba existente", async () => {
    expect((await chamar("/api/planilha-parcial", "PATCH", { ativa: true })).status).toBe(400);
    expect((await chamar("/api/planilha-parcial/preparar", "POST", {})).status).toBe(400);
    const criada = await chamar("/api/planilha-parcial/preparar", "POST", { confirmacao: true });
    expect(criada.status).toBe(200);
    expect((await criada.json()).criada).toBe(true);
    expect(
      CABECALHO_PARCIAL.map((_, coluna) => google.valor("Chamada Parcial", 1, coluna + 1)),
    ).toEqual(CABECALHO_PARCIAL);
    const antes = google.chamadas().filter((acao) => acao === "gravar").length;
    const existente = await chamar("/api/planilha-parcial/preparar", "POST", { confirmacao: true });
    expect(existente.status).toBe(200);
    expect((await existente.json()).criada).toBe(false);
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes);
    expect((await chamar("/api/planilha-parcial", "PATCH", { ativa: true })).status).toBe(200);
  });
  it("a prévia não escreve e o envio só acrescenta o registro identificado", async () => {
    const antes = google.chamadas().filter((acao) => acao === "gravar").length;
    const plano = await previa();
    expect(plano).toMatchObject({ novas: 1, atualizacoes: 0, bloqueado: false });
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes);
    expect((await chamar("/api/planilha-parcial/enviar", "POST", periodo, cookie)).status).toBe(
      400,
    );
    const concorrente = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await concorrente.connect();
      await concorrente.query("BEGIN");
      await concorrente.query("SELECT pg_advisory_xact_lock($1::integer, $2::integer)", [
        CHAVE_TRAVA_PARCIAL.namespace,
        CHAVE_TRAVA_PARCIAL.recurso,
      ]);
      expect(
        (
          await chamar(
            "/api/planilha-parcial/enviar",
            "POST",
            { ...periodo, planoHash: plano.planoHash },
            cookie,
          )
        ).status,
      ).toBe(409);
      expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes);
    } finally {
      await concorrente.query("ROLLBACK");
      await concorrente.end();
    }
    const enviada = await chamar(
      "/api/planilha-parcial/enviar",
      "POST",
      { ...periodo, planoHash: plano.planoHash },
      cookie,
    );
    expect(enviada.status).toBe(200);
    expect(await enviada.json()).toEqual({
      resultado: "sucesso",
      linhasCriadas: 1,
      linhasAtualizadas: 0,
    });
    expect(google.valor("Chamada Parcial", 2, 8)).toBe(`chamada:${aluno}:${dia}`);
    expect(google.valor("Chamada Parcial", 2, 1)).toBe("15/06/2026");
    const normal = await banco.query<{ total: number }>(
      "select count(*)::int as total from frequencias where turma_id=$1",
      [turma],
    );
    expect(normal.rows[0]?.total).toBe(0);
    const repetida = await previa();
    expect(repetida).toMatchObject({ novas: 0, existentes: 1, bloqueado: false });
  });
  it("atualiza a confirmação Seduc somente após nova prévia e aceite explícito", async () => {
    const antiga = await previa();
    await banco.query(
      "update frequencias_parciais set registrado_seduc=true, registrado_seduc_em=now(), revisao=revisao+1, atualizado_em=now() where id=$1",
      [registro],
    );
    expect((await previa()).bloqueado).toBe(true);
    expect(
      (
        await chamar(
          "/api/planilha-parcial/enviar",
          "POST",
          { ...periodo, planoHash: antiga.planoHash },
          cookie,
        )
      ).status,
    ).toBe(409);
    const plano = await previa({ atualizarExistentes: true });
    expect(plano).toMatchObject({ novas: 0, atualizacoes: 1, bloqueado: false });
    const enviada = await chamar(
      "/api/planilha-parcial/enviar",
      "POST",
      { ...periodo, atualizarExistentes: true, planoHash: plano.planoHash },
      cookie,
    );
    expect(enviada.status).toBe(200);
    expect(await enviada.json()).toEqual({
      resultado: "sucesso",
      linhasCriadas: 0,
      linhasAtualizadas: 1,
    });
    expect(google.valor("Chamada Parcial", 2, 5)).toBe("Sim");
    expect(google.valor("Chamada Parcial", 2, 8)).toBe(`chamada:${aluno}:${dia}`);
  });
  it("invalida prévia após alteração manual e preserva a célula", async () => {
    const plano = await previa();
    google.definirValor("Chamada Parcial", 2, 7, "Anotação manual");
    const antes = google.chamadas().filter((acao) => acao === "gravar").length;
    expect(
      (
        await chamar(
          "/api/planilha-parcial/enviar",
          "POST",
          { ...periodo, planoHash: plano.planoHash },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes);
    expect(google.valor("Chamada Parcial", 2, 7)).toBe("Anotação manual");
    google.definirValor("Chamada Parcial", 2, 7, "");
  });
  it("não repete escrita após resposta perdida e reconcilia por código", async () => {
    const outroDia = "2026-06-16";
    await banco.query(
      "insert into frequencias_parciais (aluno_id, dia, turma_id, aluno_nome, turma_nome, tipo, turno, aulas, atualizado_em) values ($1, $2, $3, 'QA Planilha Parcial Um', 'QA Planilha Parcial A', 'TURNO', 'TARDE', '{}', now())",
      [aluno, outroDia, turma],
    );
    const outroPeriodo = { de: outroDia, ate: outroDia };
    const plano = await previa(outroPeriodo);
    const antes = google.chamadas().filter((acao) => acao === "gravar").length;
    google.perderProximaResposta();
    const enviada = await chamar(
      "/api/planilha-parcial/enviar",
      "POST",
      { ...outroPeriodo, planoHash: plano.planoHash },
      cookie,
    );
    expect(enviada.status).toBe(502);
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes + 1);
    expect(
      (
        await chamar(
          "/api/planilha-parcial/enviar",
          "POST",
          { ...outroPeriodo, planoHash: plano.planoHash },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(await previa(outroPeriodo)).toMatchObject({ novas: 0, existentes: 1, bloqueado: false });
    expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(antes + 1);
  });
  it("exporta a base e mantém a mesma linha ao personalizar e restaurar o dia", async () => {
    const diaBase = "2026-06-17";
    const periodoBase = { de: diaBase, ate: diaBase, turmaId: turma };
    const frequencias = await banco.query<{ id: string }>(
      "insert into frequencias (turma_id, dia, atualizado_em) values ($1, $2, now()) returning id",
      [turma, diaBase],
    );
    const frequenciaId = frequencias.rows[0]?.id;
    await banco.query("insert into alunos_chamada (frequencia_id, aluno_id) values ($1, $2)", [
      frequenciaId,
      aluno,
    ]);
    const enviar = async (planoHash: string, atualizarExistentes = false) => {
      const resposta = await chamar(
        "/api/planilha-parcial/enviar",
        "POST",
        { ...periodoBase, planoHash, atualizarExistentes },
        cookie,
      );
      expect(resposta.status).toBe(200);
      return resposta.json();
    };
    const inicial = await previa(periodoBase);
    expect(inicial).toMatchObject({ novas: 1, existentes: 0, bloqueado: false });
    expect(await enviar(inicial.planoHash)).toMatchObject({
      linhasCriadas: 1,
      linhasAtualizadas: 0,
    });
    expect(google.valor("Chamada Parcial", 4, 4)).toBe("Dia inteiro");
    expect(google.valor("Chamada Parcial", 4, 8)).toBe(`chamada:${aluno}:${diaBase}`);
    expect(google.valor("Chamada Parcial", 4, 9)).toBe("chamada:1:seduc:0");
    await banco.query(
      "insert into frequencias_parciais (aluno_id, dia, turma_id, aluno_nome, turma_nome, tipo, aulas, atualizado_em) values ($1, $2, $3, 'QA Planilha Parcial Um', 'QA Planilha Parcial A', 'AULAS', '{3,4}', now())",
      [aluno, diaBase, turma],
    );
    expect((await previa(periodoBase)).bloqueado).toBe(true);
    const personalizada = await previa({ ...periodoBase, atualizarExistentes: true });
    expect(personalizada).toMatchObject({
      novas: 0,
      existentes: 1,
      atualizacoes: 1,
      bloqueado: false,
    });
    expect(await enviar(personalizada.planoHash, true)).toMatchObject({
      linhasCriadas: 0,
      linhasAtualizadas: 1,
    });
    expect(google.valor("Chamada Parcial", 4, 4)).toBe("Aulas 3, 4");
    expect(google.valor("Chamada Parcial", 4, 8)).toBe(`chamada:${aluno}:${diaBase}`);
    await banco.query("delete from frequencias_parciais where aluno_id=$1 and dia=$2", [
      aluno,
      diaBase,
    ]);
    await banco.query(
      "update alunos_chamada set registrado_seduc=true, registrado_seduc_em=now(), revisao_seduc=1 where frequencia_id=$1 and aluno_id=$2",
      [frequenciaId, aluno],
    );
    const restaurada = await previa({ ...periodoBase, atualizarExistentes: true });
    expect(restaurada).toMatchObject({
      novas: 0,
      existentes: 1,
      atualizacoes: 1,
      bloqueado: false,
    });
    expect(await enviar(restaurada.planoHash, true)).toMatchObject({
      linhasCriadas: 0,
      linhasAtualizadas: 1,
    });
    expect(google.valor("Chamada Parcial", 4, 4)).toBe("Dia inteiro");
    expect(google.valor("Chamada Parcial", 4, 5)).toBe("Sim");
    expect(google.valor("Chamada Parcial", 4, 8)).toBe(`chamada:${aluno}:${diaBase}`);
    expect(google.valor("Chamada Parcial", 4, 9)).toBe("chamada:1:seduc:1");
    expect(await previa(periodoBase)).toMatchObject({ novas: 0, existentes: 1, bloqueado: false });
    const preservada = await banco.query<{ revisao: number }>(
      "select revisao from frequencias where id=$1",
      [frequenciaId],
    );
    expect(preservada.rows[0]?.revisao).toBe(1);
  });
  it("recusa fórmulas existentes e desconecta sem apagar as células Google", async () => {
    const valores = [
      CABECALHO_PARCIAL,
      [
        "15/06/2026",
        "QA Planilha Parcial Um",
        "QA Planilha Parcial A",
        "Manhã",
        "Sim",
        google.valor("Chamada Parcial", 2, 6),
        "",
        registro,
        "2",
      ],
    ];
    google.definirAba("Chamada Parcial", valores, { formulas: { G2: '=IF(TRUE;"";"")' } });
    google.marcarLinha("Chamada Parcial", 2);
    expect((await previa({ atualizarExistentes: true })).bloqueado).toBe(true);
    expect((await chamar("/api/planilha-parcial", "DELETE")).status).toBe(200);
    expect(
      (await (await chamar("/api/planilha-parcial/estado", "GET", undefined, cookie)).json())
        .podeEnviar,
    ).toBe(false);
    expect(google.valor("Chamada Parcial", 2, 8)).toBe(registro);
  });
});
