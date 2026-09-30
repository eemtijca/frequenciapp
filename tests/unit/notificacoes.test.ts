// Notificações: destinos confiáveis, conteúdo sem estudantes e tratamento
// do transporte VAPID sem enviar mensagens a serviços externos.
import { createECDH, randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { endpointPushValido, mensagemDoResumo, MENSAGEM_TESTE } from "@/domain/notificacoes";
import webpush from "web-push";

beforeAll(() => {
  const chaves = webpush.generateVAPIDKeys();
  vi.stubEnv("DATABASE_URL", "postgresql://teste:teste@localhost:5432/teste");
  vi.stubEnv("AUTH_SECRET", "segredo-ficticio-com-mais-de-32-caracteres");
  vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", chaves.publicKey);
  vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", chaves.privateKey);
  vi.stubEnv("PUSH_VAPID_SUBJECT", "mailto:teste@escola.exemplo");
  vi.stubEnv("CRON_SECRET", "segredo-ficticio-da-agenda-para-testes-0000");
});
beforeEach(() => {
  vi.restoreAllMocks();
});

describe("destinos e conteúdo de push", () => {
  it("aceita Chrome, Firefox, Safari e Edge", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2.notify.windows.com/abc",
    ]) {
      expect(endpointPushValido(url)).toBe(true);
    }
  });
  it("recusa destinos locais, outros domínios, credenciais e portas alternativas", () => {
    for (const url of [
      "http://fcm.googleapis.com/abc",
      "https://localhost/abc",
      "https://127.0.0.1/abc",
      "https://[::1]/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://fcm.googleapis.com.atacante.test/abc",
      "https://atacante.test/fcm.googleapis.com",
      "https://fcm.googleapis.com:8443/abc",
      "https://usuario:senha@fcm.googleapis.com/abc",
      "https://fcm.googleapis.com/abc#segredo",
      "https://fcm.googleapis.com/",
      "invalido",
    ]) {
      expect(endpointPushValido(url)).toBe(false);
    }
    expect(endpointPushValido(`https://fcm.googleapis.com/${"a".repeat(2048)}`)).toBe(false);
  });
  it("produz aviso genérico com etiqueta distinta por dia", () => {
    expect(mensagemDoResumo("2026-09-30")).toEqual({
      titulo: "FrequenciApp",
      corpo: "O acompanhamento de frequência do dia está disponível em Minhas turmas.",
      etiqueta: "resumo-frequencia-2026-09-30",
    });
    expect(mensagemDoResumo("2026-10-01").etiqueta).not.toBe(
      mensagemDoResumo("2026-09-30").etiqueta,
    );
  });
});

describe("transporte de push", () => {
  const assinatura = {
    endpoint: "https://fcm.googleapis.com/fcm/send/sintetico",
    keys: { p256dh: "sintetica", auth: "sintetica" },
  };
  it("assina o envio, limita a conexão e a validade", async () => {
    const enviar = vi
      .spyOn(webpush, "sendNotification")
      .mockResolvedValue({ statusCode: 201, headers: {}, body: "" });
    const { enviarPush } = await import("@/infra/web-push");
    expect(await enviarPush(assinatura, MENSAGEM_TESTE)).toBe("enviada");
    expect(enviar).toHaveBeenCalledWith(
      assinatura,
      JSON.stringify(MENSAGEM_TESTE),
      expect.objectContaining({
        TTL: 3600,
        timeout: 8000,
        vapidDetails: expect.objectContaining({ subject: "mailto:teste@escola.exemplo" }),
      }),
    );
  });
  it("prepara uma requisição cifrada e assinada com chaves reais, sem rede", async () => {
    const par = createECDH("prime256v1");
    par.generateKeys();
    const dispositivo = {
      endpoint: assinatura.endpoint,
      keys: {
        p256dh: par.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    };
    vi.spyOn(webpush, "sendNotification").mockImplementation(async (alvo, conteudo, opcoes) => {
      if (conteudo === undefined || conteudo === null)
        throw new Error("O aviso precisa ter conteúdo.");
      const requisicao = webpush.generateRequestDetails(alvo, conteudo, opcoes);
      expect(requisicao.headers["Content-Encoding"]).toBe("aes128gcm");
      expect(requisicao.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
      expect(Buffer.isBuffer(requisicao.body)).toBe(true);
      expect(requisicao.body?.toString()).not.toContain(MENSAGEM_TESTE.corpo);
      return { statusCode: 201, headers: {}, body: "" };
    });
    const { enviarPush } = await import("@/infra/web-push");
    expect(await enviarPush(dispositivo, MENSAGEM_TESTE)).toBe("enviada");
  });
  it("descarta 404 e 410, mas permite repetir uma falha temporária", async () => {
    const enviar = vi.spyOn(webpush, "sendNotification");
    const { enviarPush } = await import("@/infra/web-push");
    for (const status of [404, 410]) {
      enviar.mockRejectedValueOnce(
        new webpush.WebPushError("expirada", status, {}, "", assinatura.endpoint),
      );
      expect(await enviarPush(assinatura, MENSAGEM_TESTE)).toBe("expirada");
    }
    enviar.mockRejectedValueOnce(new Error("tempo esgotado"));
    expect(await enviarPush(assinatura, MENSAGEM_TESTE)).toBe("falha");
    enviar.mockResolvedValueOnce({ statusCode: 201, headers: {}, body: "" });
    expect(await enviarPush(assinatura, MENSAGEM_TESTE)).toBe("enviada");
  });
  it("não tenta enviar para endereço fora da lista permitida", async () => {
    const enviar = vi.spyOn(webpush, "sendNotification");
    const { enviarPush } = await import("@/infra/web-push");
    expect(
      await enviarPush({ ...assinatura, endpoint: "https://localhost/segredo" }, MENSAGEM_TESTE),
    ).toBe("falha");
    expect(enviar).not.toHaveBeenCalled();
  });
  it("exige o segredo completo da agenda e um par VAPID correspondente", async () => {
    const { segredoDaAgendaConfere, conferirParVapid } = await import("@/infra/web-push");
    expect(segredoDaAgendaConfere(null)).toBe(false);
    expect(segredoDaAgendaConfere("Bearer incorreto")).toBe(false);
    expect(segredoDaAgendaConfere("Bearer segredo-ficticio-da-agenda-para-testes-0000")).toBe(true);
    expect(conferirParVapid).not.toThrow();
    const { ambiente } = await import("@/infra/ambiente");
    const original = ambiente.push.privateKey;
    ambiente.push.privateKey = webpush.generateVAPIDKeys().privateKey;
    try {
      expect(conferirParVapid).toThrow("mesmo par");
    } finally {
      ambiente.push.privateKey = original;
    }
  });
  it("valida uma chave real de dispositivo e recusa texto arbitrário", async () => {
    const { esquemaAssinaturaPush } = await import("@/application/notificacoes");
    const par = createECDH("prime256v1");
    par.generateKeys();
    expect(
      esquemaAssinaturaPush.safeParse({
        endpoint: assinatura.endpoint,
        keys: {
          p256dh: par.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
      }).success,
    ).toBe(true);
    expect(esquemaAssinaturaPush.safeParse(assinatura).success).toBe(false);
  });
});
