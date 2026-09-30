// Assinaturas voluntárias por dispositivo e avisos diários aos diretores,
// com escopo vigente no envio, reserva concorrente e limpeza de expiradas.
import { ECDH } from "node:crypto";
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { sessaoAtual } from "@/infra/auth/sessao";
import { comTransacao } from "@/infra/transacoes";
import { ErroHttp } from "@/infra/erros";
import { conferirParVapid, enviarPush, pushConfigurado } from "@/infra/web-push";
import { diaLocal, diaSeguinte } from "@/domain/frequencia";
import { endpointPushValido, mensagemDoResumo, MENSAGEM_TESTE } from "@/domain/notificacoes";
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

async function exigirPalavraTrocada(usuarioId: string): Promise<void> {
  const credencial = await banco().credencialDiretor.findUnique({ where: { usuarioId } });
  if (
    !credencial ||
    credencial.trocaObrigatoria ||
    credencial.revogadaEm ||
    credencial.expiraEm <= new Date()
  ) {
    throw new ErroHttp("Troque a palavra-chave para configurar notificações.", 403);
  }
}

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
  await exigirPalavraTrocada(usuario.id);
  const configurada = pushConfigurado();
  const chavePublica = configurada ? ambiente.push.publicKey : null;
  const destino = valor === null ? null : lerEndpoint({ endpoint: valor });
  // Sem VAPID, a consulta não depende das tabelas opcionais de assinaturas.
  if (!configurada || !destino || !chavePublica) return { configurada, chavePublica, ativa: false };
  const assinatura = await banco().assinaturaPush.findFirst({
    where: { endpoint: destino, usuarioId: usuario.id, chaveVapid: chavePublica },
    select: { id: true },
  });
  return { configurada, chavePublica, ativa: Boolean(assinatura) };
}

export async function ativarNotificacoes(usuario: Identidade, entrada: unknown): Promise<void> {
  await exigirPalavraTrocada(usuario.id);
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
  await exigirPalavraTrocada(usuario.id);
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

/** Envia somente se há chamada do dia para alunos das turmas de origem do vínculo. */
export async function enviarResumosDiarios() {
  const totais = { enviadas: 0, expiradas: 0, falhas: 0, ignoradas: 0 };
  if (!pushConfigurado()) return { configurada: false, ...totais };
  conferirParVapid();
  const agora = new Date();
  const dia = diaLocal(agora, ambiente.fuso);
  const data = new Date(`${dia}T12:00:00Z`);
  const chamados = await banco().alunoDaChamada.findMany({
    where: {
      frequencia: { dia: data },
      aluno: { ativo: true, OR: [{ desistenteEm: null }, { desistenteEm: { gt: data } }] },
    },
    select: { aluno: { select: { turmaOriginalId: true } } },
  });
  const origens = [...new Set(chamados.map((item) => item.aluno.turmaOriginalId))];
  const elegivel = {
    chaveVapid: ambiente.push.publicKey,
    usuario: {
      ativo: true,
      papel: "DIRETOR_TURMA" as const,
      credencialDiretor: { trocaObrigatoria: false, revogadaEm: null, expiraEm: { gt: agora } },
      vinculosDiretor: {
        some: {
          turmaId: { in: origens },
          inicio: { lte: data },
          OR: [{ fim: null }, { fim: { gte: data } }],
        },
      },
    },
  };
  const assinaturas = await banco().assinaturaPush.findMany({
    where: elegivel,
    select: { id: true },
  });
  // Dez conexões de cada vez, sem disparar todos os dispositivos em paralelo.
  for (let inicio = 0; inicio < assinaturas.length; inicio += 10) {
    await Promise.all(
      assinaturas.slice(inicio, inicio + 10).map(async ({ id }) => {
        await banco().entregaPush.createMany({
          data: [{ assinaturaId: id, dia: data }],
          skipDuplicates: true,
        });
        const entrega = await banco().entregaPush.findUnique({
          where: { assinaturaId_dia: { assinaturaId: id, dia: data } },
        });
        if (!entrega) {
          totais.ignoradas += 1;
          return;
        }
        const reservadaEm = new Date();
        const reserva = await banco().entregaPush.updateMany({
          where: {
            id: entrega.id,
            enviadaEm: null,
            OR: [
              { reservadaEm: null },
              { reservadaEm: { lt: new Date(reservadaEm.getTime() - 120_000) } },
            ],
          },
          data: { reservadaEm },
        });
        if (!reserva.count) {
          totais.ignoradas += 1;
          return;
        }
        // Reconfere conta e vínculo depois da reserva, inclusive em envios concorrentes.
        const assinatura = await banco().assinaturaPush.findFirst({ where: { id, ...elegivel } });
        if (!assinatura) {
          await banco().entregaPush.updateMany({
            where: { id: entrega.id, reservadaEm },
            data: { reservadaEm: null },
          });
          totais.ignoradas += 1;
          return;
        }
        const resultado = await enviarPush(
          {
            endpoint: assinatura.endpoint,
            keys: { p256dh: assinatura.p256dh, auth: assinatura.auth },
          },
          mensagemDoResumo(dia),
        );
        if (resultado === "expirada") {
          await banco().assinaturaPush.deleteMany({ where: { id } });
          totais.expiradas += 1;
        } else {
          await banco().entregaPush.updateMany({
            where: { id: entrega.id, reservadaEm },
            data:
              resultado === "enviada"
                ? { enviadaEm: new Date(), reservadaEm: null }
                : { reservadaEm: null },
          });
          if (resultado === "enviada") totais.enviadas += 1;
          else totais.falhas += 1;
        }
      }),
    );
  }
  await banco().entregaPush.deleteMany({
    where: { dia: { lt: new Date(`${diaSeguinte(dia, -30)}T12:00:00Z`) } },
  });
  return { configurada: true, ...totais };
}
