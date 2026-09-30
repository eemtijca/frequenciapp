// Contratos de push: permissão, propriedade da assinatura, revogação e
// agenda protegida. Endpoints fictícios, sem enviar avisos externos.
import { createECDH, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

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
  it("exige sessão de diretor e palavra-chave já trocada", async () => {
    expect((await chamar("/api/notificacoes/assinatura")).status).toBe(401);
    expect((await chamar("/api/notificacoes/assinatura", admin)).status).toBe(403);
    expect((await chamar("/api/notificacoes/assinatura", coord)).status).toBe(403);
    expect((await chamar("/api/notificacoes/assinatura", primeiro)).status).toBe(403);
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
    expect(Object.keys(estado).sort()).toEqual(["ativa", "chavePublica", "configurada"]);
    expect(estado.ativa).toBe(true);
    expect(estado.configurada).toBe(true);
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
