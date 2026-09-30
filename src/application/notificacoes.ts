// Assinaturas voluntárias por dispositivo, com conta validada, limites
// por pessoa e remoção de dispositivos expirados ou cancelados.
import { ECDH } from "node:crypto";
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { sessaoAtual } from "@/infra/auth/sessao";
import { comTransacao } from "@/infra/transacoes";
import { ErroHttp } from "@/infra/erros";
import { conferirParVapid, enviarPush, pushConfigurado } from "@/infra/web-push";
import { endpointPushValido, MENSAGEM_TESTE } from "@/domain/notificacoes";
import {
  exigirContaParaNotificacoes,
  opcoesNotificacoes,
} from "@/application/notificacoes-configuracao";
import type { Identidade } from "@/domain/usuarios";

const endpoint = z.string().refine(endpointPushValido, "Endereço de notificações inválido.");
export const esquemaAssinaturaPush = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}$/, "Chave do dispositivo inválida."),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/, "Autorização do dispositivo inválida."),
  }),
});
const esquemaEndpoint = z.object({ endpoint });

function exigirPushConfigurado(): string {
  if (!pushConfigurado() || !ambiente.push.publicKey) {
    throw new ErroHttp("As notificações ainda não foram configuradas pela administração.", 503);
  }
  conferirParVapid();
  return ambiente.push.publicKey;
}

function lerEndpoint(entrada: unknown): string {
  const dados = esquemaEndpoint.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Endereço de notificações inválido.", 400);
  return dados.data.endpoint;
}

export async function estadoDasNotificacoes(usuario: Identidade, valor: string | null) {
  await exigirContaParaNotificacoes(usuario);
  const configurada = pushConfigurado();
  const chavePublica = configurada ? ambiente.push.publicKey : null;
  const destino = valor === null ? null : lerEndpoint({ endpoint: valor });
  const opcoes = await opcoesNotificacoes(usuario);
  if (!configurada || !destino || !chavePublica)
    return { configurada, chavePublica, ativa: false, ...opcoes };
  const assinatura = await banco().assinaturaPush.findFirst({
    where: { endpoint: destino, usuarioId: usuario.id, chaveVapid: chavePublica },
    select: { id: true },
  });
  return { configurada, chavePublica, ativa: Boolean(assinatura), ...opcoes };
}

export async function ativarNotificacoes(usuario: Identidade, entrada: unknown): Promise<void> {
  await exigirContaParaNotificacoes(usuario);
  const dados = esquemaAssinaturaPush.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Assinatura inválida.", 400);
  try {
    ECDH.convertKey(Buffer.from(dados.data.keys.p256dh, "base64url"), "prime256v1");
  } catch {
    throw new ErroHttp("Chave do dispositivo inválida.", 400);
  }
  const chaveVapid = exigirPushConfigurado();
  const sessao = await sessaoAtual(ambiente.authSecret);
  if (!sessao || sessao.usuario.id !== usuario.id)
    throw new ErroHttp("Entre novamente para ativar notificações.", 401);
  await comTransacao(async (tx) => {
    await tx.assinaturaPush.deleteMany({
      where: { usuarioId: usuario.id, chaveVapid: { not: chaveVapid } },
    });
    const existente = await tx.assinaturaPush.findUnique({
      where: { endpoint: dados.data.endpoint },
    });
    if (existente && existente.usuarioId !== usuario.id) {
      if (existente.auth !== dados.data.keys.auth || existente.p256dh !== dados.data.keys.p256dh) {
        throw new ErroHttp("A assinatura do dispositivo mudou. Desative e ative novamente.", 409);
      }
      await tx.assinaturaPush.delete({ where: { id: existente.id } });
    }
    if (
      (!existente || existente.usuarioId !== usuario.id) &&
      (await tx.assinaturaPush.count({ where: { usuarioId: usuario.id } })) >= 5
    ) {
      throw new ErroHttp(
        "O limite é de cinco dispositivos. Desative um antes de adicionar outro.",
        409,
      );
    }
    const campos = {
      usuarioId: usuario.id,
      sessaoId: sessao.id,
      p256dh: dados.data.keys.p256dh,
      auth: dados.data.keys.auth,
      chaveVapid,
    };
    await tx.assinaturaPush.upsert({
      where: { endpoint: dados.data.endpoint },
      create: { endpoint: dados.data.endpoint, ...campos },
      update: campos,
    });
  });
}

export async function desativarNotificacoes(usuario: Identidade, entrada: unknown): Promise<void> {
  const destino = lerEndpoint(entrada);
  await banco().assinaturaPush.deleteMany({ where: { endpoint: destino, usuarioId: usuario.id } });
}

export async function testarNotificacoes(usuario: Identidade, entrada: unknown): Promise<void> {
  await exigirContaParaNotificacoes(usuario);
  const destino = lerEndpoint(entrada);
  const chaveVapid = exigirPushConfigurado();
  const assinatura = await banco().assinaturaPush.findFirst({
    where: { endpoint: destino, usuarioId: usuario.id, chaveVapid },
  });
  if (!assinatura)
    throw new ErroHttp("Ative as notificações neste dispositivo antes do teste.", 404);
  const agora = new Date();
  const reserva = await banco().assinaturaPush.updateMany({
    where: {
      id: assinatura.id,
      OR: [{ testadoEm: null }, { testadoEm: { lt: new Date(agora.getTime() - 60_000) } }],
    },
    data: { testadoEm: agora },
  });
  if (!reserva.count) throw new ErroHttp("Aguarde um minuto antes de testar novamente.", 429);
  const resultado = await enviarPush(
    { endpoint: assinatura.endpoint, keys: { p256dh: assinatura.p256dh, auth: assinatura.auth } },
    MENSAGEM_TESTE,
  );
  if (resultado === "expirada") {
    await banco().assinaturaPush.deleteMany({ where: { id: assinatura.id } });
    throw new ErroHttp(
      "As notificações expiraram neste dispositivo. Desative e ative novamente.",
      410,
    );
  }
  if (resultado === "falha")
    throw new ErroHttp("Não foi possível enviar o teste. Tente novamente em instantes.", 503);
}

export { enviarResumosDiarios } from "@/application/notificacoes-agenda";
