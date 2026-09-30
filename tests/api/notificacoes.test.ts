// Contratos de push: permissão, propriedade da assinatura, revogação e
// agenda protegida. Endpoints fictícios, sem enviar avisos externos.
import { createECDH, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { diaLocal, diaSeguinte } from "@/domain/frequencia";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SENHA = "PalavraPushTeste2026";
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
let admin = "";
let coord = "";
let principal = "";
let outro = "";
let primeiro = "";
const ids: string[] = [];

async function chamar(
  caminho: string,
  cookie = "",
  metodo = "GET",
  corpo?: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${APP_URL}${caminho}`, {
    method: metodo,
    headers: { Origin: APP_URL, Cookie: cookie, "Content-Type": "application/json", ...headers },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}
async function entrar(login: string, senha: string) {
  const resposta = await chamar("/api/auth/entrar", "", "POST", { login, senha });
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}
function assinatura(nome: string) {
  const par = createECDH("prime256v1");
  par.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/qp-${nome}`,
    keys: {
      p256dh: par.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}
function consulta(endpoint: string) {
  return `/api/notificacoes/assinatura?endpoint=${encodeURIComponent(endpoint)}`;
}
async function ativa(endpoint: string, cookie: string) {
  return ((await (await chamar(consulta(endpoint), cookie)).json()) as { ativa: boolean }).ativa;
}

beforeAll(async () => {
  await cliente.connect();
  await cliente.query("delete from usuarios where email like 'qp-push-%'");
  await cliente.query("delete from tentativas_entrada where chave like '%qp-push-%'");
  admin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  coord = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  for (const nome of ["principal", "outro", "primeiro"]) {
    const criado = await chamar("/api/diretores", admin, "POST", {
      nome: `QP Push ${nome}`,
      identificador: `qp-push-${nome}`,
      turmaIds: [],
    });
    expect(criado.status).toBe(201);
    const id = ((await criado.json()) as { diretor: { id: string } }).diretor.id;
    ids.push(id);
    const emitida = await chamar(`/api/diretores/${id}/palavra-chave`, admin, "POST", {});
    const palavra = ((await emitida.json()) as { palavraChave: string }).palavraChave;
    const cookie = await entrar(`qp-push-${nome}`, palavra);
    if (nome === "primeiro") primeiro = cookie;
    else
      expect(
        (
          await chamar("/api/conta/senha", cookie, "POST", {
            senhaAtual: palavra,
            senhaNova: SENHA,
          })
        ).status,
      ).toBe(200);
  }
});
beforeEach(async () => {
  await cliente.query("delete from assinaturas_push where usuario_id = any($1::uuid[])", [ids]);
  principal = await entrar("qp-push-principal", SENHA);
  outro = await entrar("qp-push-outro", SENHA);
});
afterAll(async () => {
  await cliente.query("delete from usuarios where email like 'qp-push-%'");
  await cliente.query("delete from tentativas_entrada where chave like '%qp-push-%'");
  await cliente.end();
});

describe("assinaturas push", () => {
  it("oferece tipos por papel e salva preferências da própria conta", async () => {
    const estado = await (await chamar("/api/notificacoes/assinatura", principal)).json();
    expect(estado.preferencias).toEqual({
      resumoDiario: true,
      novasChamadas: false,
      chamadasPendentes: false,
    });
    expect(estado.tipos.map((item: { tipo: string }) => item.tipo)).toEqual([
      "resumoDiario",
      "novasChamadas",
    ]);
    const alterada = await chamar("/api/notificacoes/preferencias", principal, "PATCH", {
      resumoDiario: false,
      novasChamadas: true,
    });
    expect(alterada.status).toBe(200);
    expect(await alterada.json()).toEqual({
      preferencias: { resumoDiario: false, novasChamadas: true, chamadasPendentes: false },
    });
    expect(
      (
        await chamar("/api/notificacoes/preferencias", principal, "PATCH", {
          chamadasPendentes: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (await chamar("/api/notificacoes/preferencias", coord, "PATCH", { novasChamadas: true }))
        .status,
    ).toBe(400);
    expect(
      (await chamar("/api/notificacoes/preferencias", "", "PATCH", { resumoDiario: false })).status,
    ).toBe(401);
    expect(
      (await chamar("/api/notificacoes/preferencias", primeiro, "PATCH", { resumoDiario: false }))
        .status,
    ).toBe(403);
    expect(
      (
        await chamar("/api/notificacoes/preferencias", principal, "PATCH", {
          resumoDiario: true,
          novasChamadas: false,
        })
      ).status,
    ).toBe(200);
  });
  it("permite à coordenação ativar e cancelar seu próprio dispositivo", async () => {
    const dados = assinatura("coordenacao");
    try {
      const estado = await (await chamar("/api/notificacoes/assinatura", coord)).json();
      expect(estado.tipos.map((item: { tipo: string }) => item.tipo)).toEqual([
        "chamadasPendentes",
      ]);
      expect((await chamar("/api/notificacoes/assinatura", coord, "POST", dados)).status).toBe(200);
      expect(await ativa(dados.endpoint, coord)).toBe(true);
      expect(await ativa(dados.endpoint, principal)).toBe(false);
    } finally {
      expect(
        (
          await chamar("/api/notificacoes/assinatura", coord, "DELETE", {
            endpoint: dados.endpoint,
          })
        ).status,
      ).toBe(200);
    }
  });
  it("reserva configuração de tipos e horários à administração", async () => {
    const caminho = "/api/notificacoes/configuracao";
    const anterior = await (await chamar(caminho, admin)).json();
    expect((await chamar(caminho, coord)).status).toBe(403);
    expect((await chamar(caminho, principal)).status).toBe(403);
    expect((await chamar(caminho, coord, "PATCH", { chamadasPendentes: true })).status).toBe(403);
    for (const horario of ["24:00", "12:60", "7:00", "inválido"]) {
      expect((await chamar(caminho, admin, "PATCH", { horarioPendencias: horario })).status).toBe(
        400,
      );
    }
    expect((await chamar(caminho, admin, "PATCH", {})).status).toBe(400);
    expect(
      (
        await chamar(
          caminho,
          admin,
          "PATCH",
          { chamadasPendentes: true },
          { Origin: "https://outro.exemplo" },
        )
      ).status,
    ).toBe(403);
    try {
      const resposta = await chamar(caminho, admin, "PATCH", {
        chamadasPendentes: true,
        horarioPendencias: "14:30",
      });
      expect(resposta.status).toBe(200);
      expect((await resposta.json()).configuracao).toMatchObject({
        chamadasPendentes: true,
        horarioPendencias: "14:30",
      });
      expect((await chamar(caminho, admin)).headers.get("cache-control")).toBe("no-store");
    } finally {
      expect((await chamar(caminho, admin, "PATCH", anterior.configuracao)).status).toBe(200);
    }
  });
  it("protege a agenda periódica com o segredo independente do cookie", async () => {
    for (const cookie of ["", admin, coord, principal]) {
      expect((await chamar("/api/notificacoes/agenda", cookie)).status).toBe(403);
    }
    expect(
      (
        await chamar("/api/notificacoes/agenda", "", "GET", undefined, {
          Authorization: "Bearer incorreto",
        })
      ).status,
    ).toBe(403);
  });
  it("aceita a equipe e exige a troca inicial da palavra-chave do diretor", async () => {
    expect((await chamar("/api/notificacoes/assinatura")).status).toBe(401);
    expect((await chamar("/api/notificacoes/assinatura", admin)).status).toBe(200);
    expect((await chamar("/api/notificacoes/assinatura", coord)).status).toBe(200);
    expect((await chamar("/api/notificacoes/assinatura", primeiro)).status).toBe(403);
  });
  it("oferece uma chave pública estável antes de ativar o dispositivo", async () => {
    const resposta = await chamar("/api/notificacoes/assinatura", principal);
    expect(resposta.status).toBe(200);
    const estado = (await resposta.json()) as {
      configurada: boolean;
      chavePublica: string;
      ativa: boolean;
    };
    expect(estado.configurada).toBe(true);
    expect(estado.ativa).toBe(false);
    expect(estado.chavePublica).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    const novamente = await chamar("/api/notificacoes/assinatura", principal);
    expect(await novamente.json()).toEqual(estado);
  });
  it("cadastra e renova sem duplicar, devolvendo apenas a chave pública e o estado", async () => {
    const dados = assinatura("cadastro");
    expect((await chamar("/api/notificacoes/assinatura", principal, "POST", dados)).status).toBe(
      200,
    );
    expect((await chamar("/api/notificacoes/assinatura", principal, "POST", dados)).status).toBe(
      200,
    );
    const resposta = await chamar(consulta(dados.endpoint), principal);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const estado = (await resposta.json()) as Record<string, unknown>;
    expect(Object.keys(estado).sort()).toEqual([
      "ativa",
      "chavePublica",
      "configurada",
      "fuso",
      "horarioPendencias",
      "horarioResumo",
      "preferencias",
      "tipos",
    ]);
    expect(estado.ativa).toBe(true);
    expect(estado.configurada).toBe(true);
    expect(estado.chavePublica).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    if (process.env.PUSH_VAPID_PUBLIC_KEY)
      expect(estado.chavePublica).toBe(process.env.PUSH_VAPID_PUBLIC_KEY);
    expect(
      (await cliente.query("select id from assinaturas_push where endpoint = $1", [dados.endpoint]))
        .rowCount,
    ).toBe(1);
  });
  it("recusa endpoints locais, chave fora da curva e origem externa", async () => {
    const dados = assinatura("invalida");
    for (const endpoint of [
      "https://localhost/push",
      "https://169.254.169.254/meta",
      "https://atacante.exemplo/push",
    ]) {
      expect(
        (await chamar("/api/notificacoes/assinatura", principal, "POST", { ...dados, endpoint }))
          .status,
      ).toBe(400);
    }
    expect(
      (
        await chamar("/api/notificacoes/assinatura", principal, "POST", {
          ...dados,
          keys: { ...dados.keys, p256dh: `B${"A".repeat(86)}` },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await chamar("/api/notificacoes/assinatura", principal, "POST", dados, {
          Origin: "https://outro.exemplo",
        })
      ).status,
    ).toBe(403);
  });
  it("não consulta, testa nem apaga assinatura de outra conta", async () => {
    const dados = assinatura("propriedade");
    expect((await chamar("/api/notificacoes/assinatura", principal, "POST", dados)).status).toBe(
      200,
    );
    expect(await ativa(dados.endpoint, outro)).toBe(false);
    expect(
      (await chamar("/api/notificacoes/teste", outro, "POST", { endpoint: dados.endpoint })).status,
    ).toBe(404);
    expect(
      (await chamar("/api/notificacoes/assinatura", outro, "DELETE", { endpoint: dados.endpoint }))
        .status,
    ).toBe(200);
    expect(await ativa(dados.endpoint, principal)).toBe(true);
    expect(
      (
        await chamar("/api/notificacoes/assinatura", outro, "POST", {
          ...dados,
          keys: assinatura("outra-chave").keys,
        })
      ).status,
    ).toBe(409);
  });
  it("troca a conta do dispositivo somente com a assinatura completa", async () => {
    const dados = assinatura("troca-conta");
    expect((await chamar("/api/notificacoes/assinatura", principal, "POST", dados)).status).toBe(
      200,
    );
    expect((await chamar("/api/notificacoes/assinatura", outro, "POST", dados)).status).toBe(200);
    expect(await ativa(dados.endpoint, principal)).toBe(false);
    expect(await ativa(dados.endpoint, outro)).toBe(true);
  });
  it("limita dispositivos e permite desativar antes de adicionar outro", async () => {
    const dispositivos = Array.from({ length: 6 }, (_item, indice) =>
      assinatura(`limite-${indice}`),
    );
    for (const dados of dispositivos.slice(0, 5))
      expect((await chamar("/api/notificacoes/assinatura", principal, "POST", dados)).status).toBe(
        200,
      );
    expect(
      (await chamar("/api/notificacoes/assinatura", principal, "POST", dispositivos[5])).status,
    ).toBe(409);
    expect(
      (
        await chamar("/api/notificacoes/assinatura", principal, "DELETE", {
          endpoint: dispositivos[0]?.endpoint,
        })
      ).status,
    ).toBe(200);
    expect(
      (await chamar("/api/notificacoes/assinatura", principal, "POST", dispositivos[5])).status,
    ).toBe(200);
  });
  it("encerra a preferência somente da sessão que saiu", async () => {
    const segundo = await entrar("qp-push-principal", SENHA);
    const primeiroDispositivo = assinatura("sessao-um");
    const segundoDispositivo = assinatura("sessao-dois");
    expect(
      (await chamar("/api/notificacoes/assinatura", principal, "POST", primeiroDispositivo)).status,
    ).toBe(200);
    expect(
      (await chamar("/api/notificacoes/assinatura", segundo, "POST", segundoDispositivo)).status,
    ).toBe(200);
    expect((await chamar("/api/auth/sair", principal, "POST")).status).toBe(200);
    expect(await ativa(primeiroDispositivo.endpoint, segundo)).toBe(false);
    expect(await ativa(segundoDispositivo.endpoint, segundo)).toBe(true);
  });
  it("a troca obrigatória e a emissão de nova palavra revogam assinaturas", async () => {
    const dados = assinatura("reemissao");
    expect((await chamar("/api/notificacoes/assinatura", principal, "POST", dados)).status).toBe(
      200,
    );
    const emitida = await chamar(`/api/diretores/${ids[0]}/palavra-chave`, admin, "POST", {});
    const palavra = ((await emitida.json()) as { palavraChave: string }).palavraChave;
    expect(
      (await cliente.query("select id from assinaturas_push where endpoint = $1", [dados.endpoint]))
        .rowCount,
    ).toBe(0);
    const nova = await entrar("qp-push-principal", palavra);
    expect(
      (await chamar("/api/conta/senha", nova, "POST", { senhaAtual: palavra, senhaNova: SENHA }))
        .status,
    ).toBe(200);
  });
  it("a agenda respeita origem, conta, credencial, vínculo e alunos vigentes", async () => {
    const dados = assinatura("escopo");
    expect((await chamar("/api/notificacoes/assinatura", principal, "POST", dados)).status).toBe(
      200,
    );
    const dia = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ('QP Push Ano', 98) returning id",
    );
    const serieId = serie.rows[0]?.id;
    try {
      const turmas = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, 'Origem'), ($1, 'Atual') returning id",
        [serieId],
      );
      const origemId = turmas.rows[0]?.id;
      const atualId = turmas.rows[1]?.id;
      const aluno = await cliente.query<{ id: string }>(
        `insert into alunos (nome, ordem, turma_id, turma_original_id)
         values ('QP Push Aluno', 1, $1, $2) returning id`,
        [atualId, origemId],
      );
      const alunoId = aluno.rows[0]?.id;
      const frequencia = await cliente.query<{ id: string }>(
        "insert into frequencias (turma_id, dia, atualizado_em) values ($1, $2, now()) returning id",
        [atualId, dia],
      );
      const frequenciaId = frequencia.rows[0]?.id;
      await cliente.query("insert into alunos_chamada (frequencia_id, aluno_id) values ($1, $2)", [
        frequenciaId,
        alunoId,
      ]);
      await cliente.query(
        "insert into vinculos_diretor (usuario_id, turma_id, inicio) values ($1, $2, $3)",
        [ids[0], origemId, diaSeguinte(dia, -2)],
      );
      // Confirma a seleção positiva sem enviar a um serviço externo.
      await cliente.query(
        `insert into entregas_push (assinatura_id, dia, enviada_em)
         select id, $2, now() from assinaturas_push where endpoint = $1`,
        [dados.endpoint, dia],
      );
      async function consultarAgenda() {
        const resposta = await chamar("/api/notificacoes/resumo", "", "GET", undefined, {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        });
        expect(resposta.status).toBe(200);
        return resposta.json();
      }
      expect(await consultarAgenda()).toMatchObject({ enviadas: 0, falhas: 0, ignoradas: 1 });
      const cenarios: [string, unknown[]][] = [
        ["update usuarios set ativo = false where id = $1", [ids[0]]],
        ["update credenciais_diretor set revogada_em = now() where usuario_id = $1", [ids[0]]],
        [
          "update credenciais_diretor set emitida_em = now() - interval '2 days', expira_em = now() - interval '1 minute' where usuario_id = $1",
          [ids[0]],
        ],
        ["update credenciais_diretor set troca_obrigatoria = true where usuario_id = $1", [ids[0]]],
        [
          "update vinculos_diretor set fim = $2 where usuario_id = $1",
          [ids[0], diaSeguinte(dia, -1)],
        ],
        [
          "update vinculos_diretor set inicio = $2 where usuario_id = $1",
          [ids[0], diaSeguinte(dia, 1)],
        ],
        ["update alunos set ativo = false where id = $1", [alunoId]],
        ["update alunos set desistente_em = $2 where id = $1", [alunoId, dia]],
        ["update alunos set turma_original_id = $2 where id = $1", [alunoId, atualId]],
        ["update frequencias set dia = $2 where id = $1", [frequenciaId, diaSeguinte(dia, -1)]],
      ];
      for (const [sql, valores] of cenarios) {
        await cliente.query(sql, valores);
        expect(await consultarAgenda(), sql).toMatchObject({
          enviadas: 0,
          falhas: 0,
          ignoradas: 0,
        });
        await cliente.query("update usuarios set ativo = true where id = $1", [ids[0]]);
        await cliente.query(
          `update credenciais_diretor set revogada_em = null, troca_obrigatoria = false,
           expira_em = now() + interval '1 day' where usuario_id = $1`,
          [ids[0]],
        );
        await cliente.query(
          "update vinculos_diretor set inicio = $2, fim = null where usuario_id = $1",
          [ids[0], diaSeguinte(dia, -2)],
        );
        await cliente.query(
          "update alunos set ativo = true, desistente_em = null, turma_original_id = $2 where id = $1",
          [alunoId, origemId],
        );
        await cliente.query("update frequencias set dia = $2 where id = $1", [frequenciaId, dia]);
      }
    } finally {
      await cliente.query("update usuarios set ativo = true where id = $1", [ids[0]]);
      await cliente.query(
        `update credenciais_diretor set revogada_em = null, troca_obrigatoria = false,
         expira_em = now() + interval '1 day' where usuario_id = $1`,
        [ids[0]],
      );
      await cliente.query("delete from vinculos_diretor where usuario_id = $1", [ids[0]]);
      const turmas = "select id from turmas where serie_id = $1";
      await cliente.query(`delete from frequencias where turma_id in (${turmas})`, [serieId]);
      await cliente.query(`delete from alunos where turma_id in (${turmas})`, [serieId]);
      await cliente.query("delete from turmas where serie_id = $1", [serieId]);
      await cliente.query("delete from series where id = $1", [serieId]);
    }
  });
  it("recusa agenda sem segredo e não envia a diretores sem turma acompanhada", async () => {
    expect((await chamar("/api/notificacoes/resumo", admin)).status).toBe(403);
    expect(
      (
        await chamar("/api/notificacoes/resumo", principal, "GET", undefined, {
          Authorization: "Bearer incorreto",
        })
      ).status,
    ).toBe(403);
    expect(
      (await chamar("/api/notificacoes/assinatura", principal, "POST", assinatura("sem-turma")))
        .status,
    ).toBe(200);
    const resultado = await chamar("/api/notificacoes/resumo", "", "GET", undefined, {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    });
    expect(resultado.status).toBe(200);
    expect(await resultado.json()).toMatchObject({
      configurada: true,
      enviadas: 0,
      expiradas: 0,
      falhas: 0,
    });
  });
});
