// Configuração automática de Web Push: chaves estáveis por instalação,
// compatibilidade com pares explícitos e validação sem envio externo.
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SEGREDO = "segredo-sintetico-da-instalacao-com-32-caracteres";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://teste:teste@localhost:5432/teste");
  vi.stubEnv("AUTH_SECRET", SEGREDO);
  vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", undefined);
  vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", undefined);
  vi.stubEnv("PUSH_VAPID_SUBJECT", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuração automática das notificações", () => {
  it("habilita push sem configuração manual e produz um par válido", async () => {
    const { ambiente } = await import("@/infra/ambiente");
    const { pushConfigurado, conferirParVapid } = await import("@/infra/web-push");
    expect(pushConfigurado()).toBe(true);
    expect(ambiente.push.publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    expect(ambiente.push.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ambiente.push.subject).toBe("https://github.com/eemtijca/frequenciapp");
    expect(conferirParVapid).not.toThrow();
  });

  it("mantém o mesmo par após reiniciar com o mesmo segredo", async () => {
    const primeira = (await import("@/infra/ambiente")).ambiente.push;
    vi.resetModules();
    const segunda = (await import("@/infra/ambiente")).ambiente.push;
    expect(segunda.publicKey).toBe(primeira.publicKey);
    expect(segunda.privateKey).toBe(primeira.privateKey);
  });

  it("separa as chaves de instalações com segredos diferentes", async () => {
    const primeira = (await import("@/infra/ambiente")).ambiente.push;
    vi.stubEnv("AUTH_SECRET", "outro-segredo-sintetico-da-instalacao-com-32-caracteres");
    vi.resetModules();
    const segunda = (await import("@/infra/ambiente")).ambiente.push;
    expect(segunda.publicKey).not.toBe(primeira.publicKey);
    expect(segunda.privateKey).not.toBe(primeira.privateKey);
  });

  it("trata variáveis vazias do Compose como configuração automática", async () => {
    vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", "");
    vi.stubEnv("PUSH_VAPID_SUBJECT", "");
    const { pushConfigurado, conferirParVapid } = await import("@/infra/web-push");
    expect(pushConfigurado()).toBe(true);
    expect(conferirParVapid).not.toThrow();
  });

  it("preserva os 32 bytes de uma chave privada com zero inicial", async () => {
    vi.stubEnv("AUTH_SECRET", "segredo-sintetico-com-zero-inicial-402");
    const { ambiente } = await import("@/infra/ambiente");
    const privada = Buffer.from(ambiente.push.privateKey, "base64url");
    expect(privada.length).toBe(32);
    expect(privada[0]).toBe(0);
    const par = createECDH("prime256v1");
    par.setPrivateKey(privada);
    expect(par.getPublicKey().toString("base64url")).toBe(ambiente.push.publicKey);
  });

  it("preserva o par e o contato explícitos já usados pela instalação", async () => {
    const par = webpush.generateVAPIDKeys();
    vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", par.publicKey);
    vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", par.privateKey);
    vi.stubEnv("PUSH_VAPID_SUBJECT", "mailto:administracao@escola.exemplo");
    const { ambiente } = await import("@/infra/ambiente");
    expect(ambiente.push).toMatchObject({
      ...par,
      subject: "mailto:administracao@escola.exemplo",
    });
  });

  it("permite informar apenas o contato sem substituir o par automático", async () => {
    const inicial = (await import("@/infra/ambiente")).ambiente.push;
    vi.stubEnv("PUSH_VAPID_SUBJECT", "mailto:administracao@escola.exemplo");
    vi.resetModules();
    const { ambiente } = await import("@/infra/ambiente");
    expect(ambiente.push.publicKey).toBe(inicial.publicKey);
    expect(ambiente.push.privateKey).toBe(inicial.privateKey);
    expect(ambiente.push.subject).toBe("mailto:administracao@escola.exemplo");
  });

  it("aceita um contato HTTPS para o par automático", async () => {
    vi.stubEnv("PUSH_VAPID_SUBJECT", "https://escola.exemplo/contato");
    const { ambiente } = await import("@/infra/ambiente");
    expect(ambiente.push.subject).toBe("https://escola.exemplo/contato");
    const { conferirParVapid } = await import("@/infra/web-push");
    expect(conferirParVapid).not.toThrow();
  });

  it("mantém um par explícito mesmo sem informar contato", async () => {
    const par = webpush.generateVAPIDKeys();
    vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", par.publicKey);
    vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", par.privateKey);
    const { ambiente } = await import("@/infra/ambiente");
    expect(ambiente.push).toMatchObject(par);
    const { conferirParVapid } = await import("@/infra/web-push");
    expect(conferirParVapid).not.toThrow();
  });

  it.each(["PUSH_VAPID_PUBLIC_KEY", "PUSH_VAPID_PRIVATE_KEY"])(
    "recusa configuração parcial de %s sem trocar silenciosamente o par",
    async (nome) => {
      const par = webpush.generateVAPIDKeys();
      vi.stubEnv(nome, nome === "PUSH_VAPID_PUBLIC_KEY" ? par.publicKey : par.privateKey);
      await expect(import("@/infra/ambiente")).rejects.toThrow("Configure juntas");
    },
  );

  it("assina e cifra uma requisição com o par automático sem usar a rede", async () => {
    const { ambiente } = await import("@/infra/ambiente");
    const par = createECDH("prime256v1");
    par.generateKeys();
    const requisicao = webpush.generateRequestDetails(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/sintetico",
        keys: {
          p256dh: par.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
      },
      "Aviso sintético",
      { vapidDetails: ambiente.push },
    );
    expect(requisicao.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(requisicao.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(Buffer.isBuffer(requisicao.body)).toBe(true);
    expect(requisicao.body?.toString()).not.toContain("Aviso sintético");
  });
});
