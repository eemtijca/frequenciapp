// Sem app, banco, navegador ou rede; não imprime os corpos das requisições.
import { createECDH, randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import {
  classificarRedePush,
  correspondeRespostaPush,
  validarBasePush,
  validarPedidoPush,
} from "../ponta-a-ponta/pwa/validar-rede-push";

const par = createECDH("prime256v1");
par.generateKeys();
const dados = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fixture-sintetica",
  keys: {
    p256dh: par.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  },
};
const base = new URL("http://aplicacao.exemplo:4321/");
const verificar = (rota: string, metodo: string, corpo: unknown) =>
  validarPedidoPush(rota, metodo, typeof corpo === "string" ? corpo : JSON.stringify(corpo), dados);

test("intercepta o namespace inteiro e só libera leitura conhecida", () => {
  const classificar = (path: string, method = "GET", body: string | null = null) =>
    classificarRedePush(new URL(path, base).href, method, body, dados, base);
  expect(classificar("/api/outra")).toBe("fallback");
  expect(classificar("/api/notificacoes/configuracao")).toBe("fallback");
  expect(classificar("/api/notificacoes/assinatura")).toBe("get");
  expect(classificar("/api/notificacoes/assinatura", "POST", JSON.stringify(dados))).toBe("post");
  expect(classificar("/api/notificacoes/assinatura/", "GET")).toBe("bloquear");
  expect(classificar("/api//notificacoes/assinatura", "POST", JSON.stringify(dados))).toBe(
    "bloquear",
  );
  expect(
    classificar("/api%2525252525252fnotificacoes/assinatura", "POST", JSON.stringify(dados)),
  ).toBe("bloquear");
  expect(classificar("/api/notificacoes/assinatura?endpoint=x&endpoint=y")).toBe("bloquear");
  for (const [path, method] of [
    ["/api/notificacoes/configuracao", "PATCH"],
    ["/api/notificacoes/preferencias", "POST"],
    ["/api/notificacoes/assinatura/extra", "POST"],
    ["/api/notificacoes/assinatura/", "GET"],
    ["/api/notificacoes%2fassinatura", "POST"],
    ["/api/notificacoes/teste?surpresa=1", "POST"],
    ["/api/notificacoes/novo", "GET"],
  ] as const)
    expect(classificar(path, method, JSON.stringify(dados))).toBe("bloquear");
  expect(classificar("/api/notificacoes/assinatura?endpoint=errado")).toBe("bloquear");
});

test("só atende e libera notificações na origem efetiva da aplicação", () => {
  const caminho = "/api/notificacoes/assinatura";
  for (const [origem, resultado] of [
    ["http://aplicacao.exemplo:4321", "get"],
    ["https://aplicacao.exemplo:4321", "bloquear"],
    ["http://outra.exemplo:4321", "bloquear"],
    ["http://aplicacao.exemplo:4322", "bloquear"],
  ] as const) {
    expect(classificarRedePush(`${origem}${caminho}`, "GET", null, dados, base)).toBe(resultado);
    expect(
      classificarRedePush(`${origem}/api/notificacoes/configuracao`, "GET", null, dados, base),
    ).toBe(resultado === "get" ? "fallback" : "bloquear");
    expect(
      classificarRedePush(`${origem}${caminho}`, "POST", JSON.stringify(dados), dados, base),
    ).toBe(resultado === "get" ? "post" : "bloquear");
    expect(
      classificarRedePush(
        `${origem}${caminho}`,
        "DELETE",
        JSON.stringify({ endpoint: dados.endpoint }),
        dados,
        base,
      ),
    ).toBe(resultado === "get" ? "delete" : "bloquear");
    expect(
      classificarRedePush(
        `${origem}/api/notificacoes/teste`,
        "POST",
        JSON.stringify({ endpoint: dados.endpoint }),
        dados,
        base,
      ),
    ).toBe(resultado === "get" ? "teste" : "bloquear");
  }
  expect(classificarRedePush("http://outra.exemplo/api/outra", "GET", null, dados, base)).toBe(
    "fallback",
  );
  expect(classificarRedePush("url malformada", "GET", null, dados, base)).toBe("bloquear");
});

test("valida base efetiva sem expor dados na mensagem de erro", () => {
  expect(validarBasePush("https://app.exemplo:444/caminho?segredo=x").origin).toBe(
    "https://app.exemplo:444",
  );
  for (const invalida of [
    undefined,
    "url malformada",
    "file:///tmp/x",
    "http://nome:senha@app.exemplo",
  ]) {
    expect(() => validarBasePush(invalida)).toThrow(
      "baseURL da aplicação inválida para a fixture push.",
    );
  }
});

test("resposta exige origem, caminho e método corretos", () => {
  const url = "http://aplicacao.exemplo:4321/api/notificacoes/assinatura";
  expect(correspondeRespostaPush(url, "GET", base, "GET", "assinatura")).toBe(true);
  expect(
    correspondeRespostaPush(url.replace("http:", "https:"), "GET", base, "GET", "assinatura"),
  ).toBe(false);
  expect(
    correspondeRespostaPush(url.replace(":4321", ":4322"), "GET", base, "GET", "assinatura"),
  ).toBe(false);
  expect(correspondeRespostaPush(url, "POST", base, "GET", "assinatura")).toBe(false);
  expect(correspondeRespostaPush(url, "GET", base, "GET", "teste")).toBe(false);
  expect(correspondeRespostaPush("malformada", "GET", base, "GET", "assinatura")).toBe(false);
});

test("aceita somente requisições simuladas válidas", () => {
  expect(() => verificar("assinatura", "POST", dados)).not.toThrow();
  expect(() => verificar("assinatura", "DELETE", { endpoint: dados.endpoint })).not.toThrow();
  expect(() => verificar("teste", "POST", { endpoint: dados.endpoint })).not.toThrow();
});

test("rejeita métodos, JSON e corpos inválidos ou diferentes da fixture", () => {
  const invalidos: [string, string, unknown][] = [
    ["assinatura", "PATCH", dados],
    ["teste", "DELETE", { endpoint: dados.endpoint }],
    ["outra", "POST", dados],
    ["assinatura", "POST", "{"],
    ["assinatura", "POST", null],
    ["assinatura", "POST", { endpoint: dados.endpoint }],
    ["assinatura", "POST", { ...dados, extra: true }],
    ["assinatura", "POST", { ...dados, keys: { ...dados.keys, extra: true } }],
    ["assinatura", "POST", { ...dados, keys: { ...dados.keys, p256dh: "incorreta" } }],
    ["assinatura", "POST", { ...dados, keys: { ...dados.keys, auth: "incorreta" } }],
    ["assinatura", "POST", { ...dados, endpoint: "https://example.invalid/push" }],
    ["assinatura", "DELETE", { endpoint: dados.endpoint, keys: dados.keys }],
    ["assinatura", "DELETE", { endpoint: "https://fcm.googleapis.com/fcm/send/outro" }],
    ["teste", "POST", {}],
  ];
  for (const [rota, metodo, corpo] of invalidos) {
    expect(() => verificar(rota, metodo, corpo)).toThrow("Requisição push simulada inválida.");
  }
});

test("rejeita uma fixture que também viola o contrato da API", () => {
  const invalidas = [
    { ...dados, endpoint: "https://example.invalid/push" },
    { ...dados, keys: { ...dados.keys, p256dh: `B${"A".repeat(86)}` } },
    { ...dados, keys: { ...dados.keys, auth: "curta" } },
  ];
  for (const invalida of invalidas) {
    expect(() =>
      validarPedidoPush("assinatura", "POST", JSON.stringify(invalida), invalida),
    ).toThrow("Requisição push simulada inválida.");
  }
});
