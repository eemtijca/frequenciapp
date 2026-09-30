// Regras da escola e preferências pessoais de notificações, com horários
// validados, auditoria da Gestão e separação dos avisos por papel.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ehHoraValida } from "@/domain/frequencia";
import {
  NOTIFICACOES_PADRAO,
  TIPOS_NOTIFICACAO,
  preferenciasParaPapel,
  tiposParaPapel,
} from "@/domain/notificacoes";
import { temCapacidade, type Identidade } from "@/domain/usuarios";

const camposPreferencias = {
  resumoDiario: z.boolean().optional(),
  novasChamadas: z.boolean().optional(),
  chamadasPendentes: z.boolean().optional(),
};
export const esquemaPreferenciasNotificacoes = z
  .object(camposPreferencias)
  .strict()
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));
export const esquemaConfiguracaoNotificacoes = z
  .object({
    ...camposPreferencias,
    horarioResumo: z.string().refine(ehHoraValida).optional(),
    horarioPendencias: z.string().refine(ehHoraValida).optional(),
  })
  .strict()
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));

const SELECAO = {
  resumoDiario: true,
  novasChamadas: true,
  chamadasPendentes: true,
  horarioResumo: true,
  horarioPendencias: true,
} as const;

export async function lerConfiguracaoNotificacoes() {
  const linha = await banco().configuracaoNotificacoes.findUnique({
    where: { id: "principal" },
    select: SELECAO,
  });
  return linha ?? { ...NOTIFICACOES_PADRAO };
}

export async function atualizarConfiguracaoNotificacoes(admin: { id: string }, entrada: unknown) {
  const dados = esquemaConfiguracaoNotificacoes.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp("Confira os tipos de aviso e os horários informados.", 400);
  return comTransacao(async (tx) => {
    const configuracao = await tx.configuracaoNotificacoes.upsert({
      where: { id: "principal" },
      create: { id: "principal", ...dados.data, atualizadoPorId: admin.id },
      update: { ...dados.data, atualizadoPorId: admin.id },
      select: SELECAO,
    });
    await auditar(tx, admin.id, "notificacoes.configurar", "notificacoes:principal");
    return configuracao;
  });
}

export async function exigirContaParaNotificacoes(usuario: Identidade): Promise<void> {
  if (!temCapacidade(usuario.papel, "receberNotificacoes")) {
    throw new ErroHttp("Acesso não permitido.", 403);
  }
  if (!temCapacidade(usuario.papel, "verEstatisticasDasTurmas")) return;
  const credencial = await banco().credencialDiretor.findUnique({
    where: { usuarioId: usuario.id },
  });
  if (
    !credencial ||
    credencial.trocaObrigatoria ||
    credencial.revogadaEm ||
    credencial.expiraEm <= new Date()
  ) {
    throw new ErroHttp("Troque a palavra-chave para configurar notificações.", 403);
  }
}

export async function lerPreferenciasNotificacoes(usuario: Identidade) {
  const salvas = await banco().preferenciaNotificacoes.findUnique({
    where: { usuarioId: usuario.id },
  });
  return preferenciasParaPapel(usuario.papel, salvas);
}

export async function atualizarPreferenciasNotificacoes(usuario: Identidade, entrada: unknown) {
  await exigirContaParaNotificacoes(usuario);
  const dados = esquemaPreferenciasNotificacoes.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira os tipos de aviso selecionados.", 400);
  const tipos = tiposParaPapel(usuario.papel);
  if (TIPOS_NOTIFICACAO.some((tipo) => dados.data[tipo] === true && !tipos.includes(tipo))) {
    throw new ErroHttp("Esse tipo de aviso não está disponível para esta conta.", 400);
  }
  const salvas = await comTransacao(async (tx) => {
    const anterior = await tx.preferenciaNotificacoes.findUnique({
      where: { usuarioId: usuario.id },
    });
    const preferencias = preferenciasParaPapel(usuario.papel, { ...anterior, ...dados.data });
    const desde = preferencias.novasChamadas
      ? anterior?.novasChamadas
        ? anterior.novasChamadasDesde
        : new Date()
      : null;
    return tx.preferenciaNotificacoes.upsert({
      where: { usuarioId: usuario.id },
      create: { usuarioId: usuario.id, ...preferencias, novasChamadasDesde: desde },
      update: { ...preferencias, novasChamadasDesde: desde },
    });
  });
  return preferenciasParaPapel(usuario.papel, salvas);
}

export async function opcoesNotificacoes(usuario: Identidade) {
  const configuracao = await lerConfiguracaoNotificacoes();
  return {
    preferencias: await lerPreferenciasNotificacoes(usuario),
    tipos: tiposParaPapel(usuario.papel).map((tipo) => ({ tipo, disponivel: configuracao[tipo] })),
    horarioResumo: configuracao.horarioResumo,
    horarioPendencias: configuracao.horarioPendencias,
    fuso: ambiente.fuso,
  };
}
