// Contratos da integração com Google Planilhas, contra um Apps Script falso
// que responde 302 como o Content Service e guarda a planilha em memória.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGasFalso, type GasFalso } from "../helpers/gas-falso";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const DIA = "2026-09-10";

let cookieAdmin = "";
let banco: pg.Client | null = null;
let gas: GasFalso | null = null;
let serieId = "";
let turmaAId = "";
let aulaId = "";
let alunoBId = "";
let token = "";

async function conectarBanco(): Promise<pg.Client | null> {
  const conexao = process.env.DATABASE_URL;
  if (!conexao || !conexao.startsWith("postgresql://")) return null;
  const cliente = new pg.Client({ connectionString: conexao });
  await cliente.connect();
  return cliente;
}

async function limparMassa() {
  if (!banco) return;
  await banco.query(
    "delete from sincronizacoes_planilha where turma_original_id in (select id from turmas where serie_id in (select id from series where nome = 'QP Ano'))",
  );
  await banco.query(
    `insert into integracoes_planilha (id, ativa, modo, atualizado_em)
     values ('principal', false, 'CONSERVADOR', now())
     on conflict (id) do update set
       ativa = false,
       endpoint = null,
       token = null,
       versao_script = null,
       esquema = null,
       assinatura_esquema = null,
       esquema_em = null,
       modo = 'CONSERVADOR',
       modo_completo_ate = null,
       atualizado_em = now()`,
  );
  await banco.query(
    "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = 'QP Ano'))",
  );
  await banco.query("delete from alunos where nome like 'QP %'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QP Ano')",
  );
  await banco.query("delete from series where nome = 'QP Ano'");
}

async function requisicao(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos });
}

async function autenticado(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  cabecalhos.set("Cookie", cookieAdmin);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos });
}

async function json<T>(resposta: Response): Promise<T> {
  return (await resposta.json()) as T;
}

beforeAll(async () => {
  banco = await conectarBanco();
  await limparMassa();
  gas = await criarGasFalso();

  const entrada = await requisicao("/api/auth/entrar", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL_ADMIN, senha: SENHA_ADMIN }),
  });
  cookieAdmin = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";

  const serie = await autenticado("/api/series", {
    method: "POST",
    body: JSON.stringify({ nome: "QP Ano", ordem: 90 }),
  });
  serieId = ((await json<{ serie: { id: string } }>(serie)).serie ?? { id: "" }).id;

  const turmaA = await json<{ turma: { id: string; horarios: { id: string }[] } }>(
    await autenticado("/api/turmas", {
      method: "POST",
      body: JSON.stringify({ serieId, nome: "A" }),
    }),
  );
  turmaAId = turmaA.turma.id;
  aulaId = turmaA.turma.horarios[0]?.id ?? "";

  await autenticado("/api/alunos", {
    method: "POST",
    body: JSON.stringify({ nome: "QP Alice", turmaId: turmaAId }),
  });

  const alunoB = await json<{ aluno: { id: string } }>(
    await autenticado("/api/alunos", {
      method: "POST",
      body: JSON.stringify({
        nome: "QP Bruno",
        turmaId: turmaAId,
      }),
    }),
  );
  alunoBId = alunoB.aluno.id;

  await autenticado("/api/frequencias", {
    method: "POST",
    body: JSON.stringify({
      dia: DIA,
      turmaId: turmaAId,
      revisao: 0,
      faltas: [{ alunoId: alunoBId, horarios: [aulaId] }],
    }),
  });

  gas.definirAba(
    "QP Ano A",
    [
      ["Aluno", "Turma atual", "10/09", "Total"],
      ["QP Alice", "QP Ano A", "P", ""],
      ["QP Bruno", "QP Ano A", "", ""],
    ],
    { formulas: { D2: '=CONT.SE(C2:C3;"F")' } },
  );
});

afterAll(async () => {
  await autenticado("/api/planilha/desconectar", {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() => undefined);
  await limparMassa();
  await gas?.fechar();
  if (banco) await banco.end();
});

describe("integração com a planilha", () => {
  it("coordenação não configura a integração", async () => {
    const entrada = await requisicao("/api/auth/entrar", {
      method: "POST",
      body: JSON.stringify({
        email: "demo@escola.exemplo",
        senha: "DemoFrequencia2026",
        lembrar: false,
      }),
    });
    const cookieCoord = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
    const resposta = await fetch(`${APP_URL}/api/planilha`, {
      headers: { Cookie: cookieCoord, Origin: APP_URL },
    });
    expect(resposta.status).toBe(403);
  });

  it("gera token, conecta e testa o script falso", async () => {
    const gerado = await autenticado("/api/planilha/token", {
      method: "POST",
      body: JSON.stringify({ acao: "gerar", senha: SENHA_ADMIN }),
    });
    expect(gerado.status).toBe(200);
    token = (await json<{ token: string }>(gerado)).token;
    gas?.definirToken(token);

    const salvo = await autenticado("/api/planilha", {
      method: "PATCH",
      body: JSON.stringify({ ativa: true, endpoint: gas?.url }),
    });
    expect(salvo.status).toBe(200);

    const teste = await autenticado("/api/planilha/testar", {
      method: "POST",
      body: JSON.stringify({ endpoint: gas?.url }),
    });
    expect(teste.status).toBe(200);
    const ping = await json<{ ping: { planilha: { nome: string } } }>(teste);
    expect(ping.ping.planilha.nome).toBe("Planilha de teste");
  });

  it("recusa token errado sem tocar na planilha", async () => {
    gas?.definirToken("outro-token");
    const teste = await autenticado("/api/planilha/testar", {
      method: "POST",
      body: JSON.stringify({ endpoint: gas?.url }),
    });
    expect(teste.status).toBe(502);
    gas?.definirToken(token);
  });

  it("avisa quando o fuso do script difere do aplicativo", async () => {
    gas?.definirFuso("America/Sao_Paulo");
    const teste = await autenticado("/api/planilha/testar", {
      method: "POST",
      body: JSON.stringify({ endpoint: gas?.url }),
    });
    const ping = await json<{ ping: { avisos: string[] } }>(teste);
    expect(ping.ping.avisos.some((aviso) => aviso.includes("fuso"))).toBe(true);
    gas?.definirFuso("America/Fortaleza");
  });

  it("lê a estrutura e salva o mapa por turma de origem", async () => {
    const estrutura = await autenticado("/api/planilha/estrutura", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(estrutura.status).toBe(200);
    const dados = await json<{
      planilha: { nome: string; url: string; fuso: string; versao: number };
      abas: unknown[];
      sugestoes: { aba: string; turmaOriginalId: string | null }[];
    }>(estrutura);
    expect(dados.abas).toHaveLength(1);
    const sugestao = dados.sugestoes.find((item) => item.aba === "QP Ano A");
    expect(sugestao?.turmaOriginalId).toBe(turmaAId);

    const salvo = await autenticado("/api/planilha/mapa", {
      method: "POST",
      body: JSON.stringify({
        planilha: dados.planilha,
        abas: dados.abas,
        mapa: [{ aba: "QP Ano A", turmaOriginalId: turmaAId }],
      }),
    });
    expect(salvo.status).toBe(200);
  });

  it("simula e aplica somente lacunas, preservando ocupadas e fórmulas", async () => {
    const simulado = await json<{
      modalidade: string;
      planoHashGeral: string;
      planos: { resumo: { preencher: number; puladasFormula: number }; avisos: string[] }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(simulado.modalidade).toBe("conservador");
    expect(simulado.planos[0]?.resumo.preencher).toBe(1);

    const aplicado = await autenticado("/api/planilha/aplicar", {
      method: "POST",
      body: JSON.stringify({
        turmaOriginalId: turmaAId,
        de: DIA,
        ate: DIA,
        permitirInserirColunas: true,
        permitirNovosAlunos: true,
        planoHashGeral: simulado.planoHashGeral,
      }),
    });
    expect(aplicado.status).toBe(200);
    const resultado = await json<{ resumo: { sucesso: number; falhas: number } }>(aplicado);
    expect(resultado.resumo).toMatchObject({ sucesso: 1, falhas: 0 });

    expect(gas?.valor("QP Ano A", 3, 3)).toBe("F");
    expect(gas?.valor("QP Ano A", 2, 3)).toBe("P");
    expect(gas?.formulaDe("QP Ano A", 2, 4)).toContain("CONT.SE");
  });

  it("simula o mês de todas as turmas mapeadas", async () => {
    const simulado = await json<{
      modalidade: string;
      planos: { turmaOriginalId: string }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          todas: true,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(simulado.modalidade).toBe("conservador");
    expect(simulado.planos).toHaveLength(1);
    expect(simulado.planos[0]?.turmaOriginalId).toBe(turmaAId);
  });

  it("registra falha de recusa e mostra o último erro", async () => {
    gas?.definirAba(
      "QP Ano A",
      [
        ["Aluno", "Turma atual", "10/09", "Total"],
        ["QP Alice", "QP Ano A", "P", ""],
        ["QP Bruno", "QP Ano A", "", ""],
      ],
      { formulas: { D2: '=CONT.SE(C2:C3;"F")' } },
    );
    const simulado = await json<{
      planoHashGeral: string;
      planos: { resumo: { preencher: number } }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(simulado.planos[0]?.resumo.preencher).toBe(1);

    gas?.definirRecusarAplicar(true);
    const aplicado = await autenticado("/api/planilha/aplicar", {
      method: "POST",
      body: JSON.stringify({
        turmaOriginalId: turmaAId,
        de: DIA,
        ate: DIA,
        permitirInserirColunas: true,
        permitirNovosAlunos: true,
        planoHashGeral: simulado.planoHashGeral,
      }),
    });
    gas?.definirRecusarAplicar(false);
    expect(aplicado.status).toBe(200);
    const resultado = await json<{ resumo: { falhas: number } }>(aplicado);
    expect(resultado.resumo.falhas).toBe(1);
    expect(gas?.valor("QP Ano A", 3, 3)).toBe("");

    const config = await json<{
      integracao: {
        alteradasDepois: number;
        ultimoErro: { resultado: string; erro: string | null } | null;
      };
    }>(await autenticado("/api/planilha"));
    expect(config.integracao.alteradasDepois).toBeGreaterThanOrEqual(0);
    expect(config.integracao.ultimoErro?.resultado).toBe("FALHA");
    expect(config.integracao.ultimoErro?.erro).toContain("Recusa de teste");
  });

  it("recusa prévia com hash diferente", async () => {
    const resposta = await autenticado("/api/planilha/aplicar", {
      method: "POST",
      body: JSON.stringify({
        turmaOriginalId: turmaAId,
        de: DIA,
        ate: DIA,
        planoHashGeral: "hash-que-nao-confere",
      }),
    });
    expect(resposta.status).toBe(409);
  });

  it("destrava o modo completo com frase, senha e duração", async () => {
    const curta = await autenticado("/api/planilha/modo-completo", {
      method: "POST",
      body: JSON.stringify({ frase: "EDITAR PLANILHA", senha: SENHA_ADMIN, duracaoMinutos: 7 }),
    });
    expect(curta.status).toBe(400);

    const errada = await autenticado("/api/planilha/modo-completo", {
      method: "POST",
      body: JSON.stringify({ frase: "outra frase", senha: SENHA_ADMIN, duracaoMinutos: 5 }),
    });
    expect(errada.status).toBe(400);

    const ok = await autenticado("/api/planilha/modo-completo", {
      method: "POST",
      body: JSON.stringify({ frase: "EDITAR PLANILHA", senha: SENHA_ADMIN, duracaoMinutos: 5 }),
    });
    expect(ok.status).toBe(200);
    const estado = await json<{ estado: { modo: string } }>(
      await autenticado("/api/planilha/estado"),
    );
    expect(estado.estado.modo).toBe("completo");
  });

  it("substitui divergência no modo completo e cria cópia", async () => {
    const simulado = await json<{
      modalidade: string;
      planoHashGeral: string;
      planos: { resumo: { substituir: number } }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          substituirDivergencias: true,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    // Nada diverge ainda: Alice está P e Bruno agora está F.
    expect(simulado.modalidade).toBe("completo");
    expect(simulado.planos[0]?.resumo.substituir).toBe(0);

    // Divergência manual: a planilha marca presença onde o app registrou falta
    // e mantém o nome antigo em caixa diferente.
    gas?.definirAba(
      "QP Ano A",
      [
        ["Aluno", "Turma atual", "10/09", "Total"],
        ["qp alice", "QP Ano A", "P", ""],
        ["QP Bruno", "QP Ano A", "P", ""],
      ],
      { formulas: { D2: '=CONT.SE(C2:C3;"F")' } },
    );

    const comDivergencia = await json<{
      planoHashGeral: string;
      planos: { resumo: { substituir: number } }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          substituirDivergencias: true,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(comDivergencia.planos[0]?.resumo.substituir).toBe(2);

    const aplicado = await autenticado("/api/planilha/aplicar", {
      method: "POST",
      body: JSON.stringify({
        turmaOriginalId: turmaAId,
        de: DIA,
        ate: DIA,
        substituirDivergencias: true,
        permitirInserirColunas: true,
        permitirNovosAlunos: true,
        planoHashGeral: comDivergencia.planoHashGeral,
      }),
    });
    expect(aplicado.status).toBe(200);
    expect(gas?.valor("QP Ano A", 3, 3)).toBe("F");
    expect(gas?.valor("QP Ano A", 2, 1)).toBe("QP Alice");
    expect(gas?.abas().some((nome) => nome.startsWith("_frequenciapp_backup_"))).toBe(true);
  });

  it("remove linha criada pela integração no modo completo", async () => {
    const simulacao = await json<{
      planoHashGeral: string;
      planos: { candidatosRemocaoLinhas: { linha: number; nome: string }[] }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(simulacao.planos[0]?.candidatosRemocaoLinhas).toHaveLength(0);

    // A integração havia criado a linha do Bruno (marcada); ela é candidata.
    gas?.marcarLinha("QP Ano A", 3);
    gas?.definirAba(
      "QP Ano A",
      [
        ["Aluno", "Turma atual", "10/09", "Total"],
        ["QP Alice", "QP Ano A", "P", ""],
        ["QP Bruno", "QP Ano A", "F", ""],
        ["QP Carla", "QP Ano A", "P", ""],
      ],
      { formulas: { D2: '=CONT.SE(C2:C3;"F")' } },
    );
    gas?.marcarLinha("QP Ano A", 4);
    const depois = await json<{
      planoHashGeral: string;
      planos: { candidatosRemocaoLinhas: { linha: number; nome: string }[] }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(depois.planos[0]?.candidatosRemocaoLinhas).toEqual([{ linha: 4, nome: "QP Carla" }]);

    const comRemocao = await json<{
      planoHashGeral: string;
      planos: { removerLinhas: { linha: number; nome: string }[] }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
          removerLinhas: [4],
        }),
      }),
    );
    expect(comRemocao.planos[0]?.removerLinhas).toEqual([{ linha: 4, nome: "QP Carla" }]);

    const aplicado = await autenticado("/api/planilha/aplicar", {
      method: "POST",
      body: JSON.stringify({
        turmaOriginalId: turmaAId,
        de: DIA,
        ate: DIA,
        permitirInserirColunas: true,
        permitirNovosAlunos: true,
        removerLinhas: [4],
        planoHashGeral: comRemocao.planoHashGeral,
      }),
    });
    expect(aplicado.status).toBe(200);
    expect(gas?.valor("QP Ano A", 4, 1)).toBe("");
  });

  it("remove coluna criada pela integração no modo completo", async () => {
    gas?.marcarColuna("QP Ano A", 3);
    const simulacao = await json<{
      planoHashGeral: string;
      planos: { candidatosRemocaoColunas: { coluna: number; rotulo: string }[] }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(simulacao.planos[0]?.candidatosRemocaoColunas).toEqual([
      { coluna: 3, letra: "C", rotulo: "10/09", data: "2026-09-10" },
    ]);

    const comRemocao = await json<{ planoHashGeral: string }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
          removerColunas: [3],
        }),
      }),
    );
    const aplicado = await autenticado("/api/planilha/aplicar", {
      method: "POST",
      body: JSON.stringify({
        turmaOriginalId: turmaAId,
        de: DIA,
        ate: DIA,
        permitirInserirColunas: true,
        permitirNovosAlunos: true,
        removerColunas: [3],
        planoHashGeral: comRemocao.planoHashGeral,
      }),
    });
    expect(aplicado.status).toBe(200);
    expect(gas?.valor("QP Ano A", 1, 3)).toBe("Total");
  });

  it("cria aba para turma sem aba e só remove a que a integração criou", async () => {
    const criada = await autenticado("/api/planilha/criar-aba", {
      method: "POST",
      body: JSON.stringify({ nome: "QP Nova" }),
    });
    expect(criada.status).toBe(200);
    expect(gas?.abas()).toContain("QP Nova");

    const recusada = await autenticado("/api/planilha/remover-aba", {
      method: "POST",
      body: JSON.stringify({ aba: "QP Nova", frase: "EDITAR PLANILHA", senha: "senha-errada" }),
    });
    expect(recusada.status).toBe(400);

    const removida = await autenticado("/api/planilha/remover-aba", {
      method: "POST",
      body: JSON.stringify({ aba: "QP Nova", frase: "EDITAR PLANILHA", senha: SENHA_ADMIN }),
    });
    expect(removida.status).toBe(200);
    expect(gas?.abas()).not.toContain("QP Nova");

    gas?.definirAba("QP Manual", [["Aluno"], ["QP Alice"]]);
    const manual = await autenticado("/api/planilha/remover-aba", {
      method: "POST",
      body: JSON.stringify({ aba: "QP Manual", frase: "EDITAR PLANILHA", senha: SENHA_ADMIN }),
    });
    expect(manual.status).toBe(502);
    expect(gas?.abas()).toContain("QP Manual");
  });

  it("recusa operação destrutiva depois de a janela expirar", async () => {
    await banco?.query(
      "update integracoes_planilha set modo = 'COMPLETO', modo_completo_ate = now() - interval '1 minute' where id = 'principal'",
    );
    const simulado = await json<{
      modalidade: string;
      planos: { resumo: { substituir: number } }[];
    }>(
      await autenticado("/api/planilha/simular", {
        method: "POST",
        body: JSON.stringify({
          turmaOriginalId: turmaAId,
          de: DIA,
          ate: DIA,
          substituirDivergencias: true,
          permitirInserirColunas: true,
          permitirNovosAlunos: true,
        }),
      }),
    );
    expect(simulado.modalidade).toBe("conservador");
    expect(simulado.planos[0]?.resumo.substituir).toBe(0);

    const remocao = await autenticado("/api/planilha/remover-aba", {
      method: "POST",
      body: JSON.stringify({ aba: "QP Manual", frase: "EDITAR PLANILHA", senha: SENHA_ADMIN }),
    });
    expect(remocao.status).toBe(400);
  });

  it("volta ao conservador e desconecta", async () => {
    const conservador = await autenticado("/api/planilha/modo-conservador", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(conservador.status).toBe(200);

    const desconectado = await autenticado("/api/planilha/desconectar", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(desconectado.status).toBe(200);
    const config = await json<{ integracao: { ativa: boolean; temToken: boolean } }>(
      await autenticado("/api/planilha"),
    );
    expect(config.integracao).toMatchObject({ ativa: false, temToken: false });
  });
});
