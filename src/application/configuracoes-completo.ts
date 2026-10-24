// Leitura e gravação do conjunto completo de configurações: recursos, catálogos,
// notificações, acesso, almoço, feriados, chaves do BI e planilhas em um lote.
import { createHash } from "node:crypto";
import { z } from "zod";
import { banco, usarTransacao } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import type { OrdemAlmocoDoDia } from "@/domain/ordem-almoco";
import type {
  ConfiguracoesCompletas,
  FinalidadePlanilhaConfigurada,
  PreferenciasPlanilhas,
  ResultadoLote,
  SecaoConfiguracao,
} from "@/domain/configuracoes";
import { lerConfiguracoes, atualizarConfiguracoes } from "@/application/configuracoes";
import { listarFeriados, criarFeriado, removerFeriado } from "@/application/calendario-letivo";
import {
  listarBeneficios,
  criarBeneficio,
  atualizarBeneficio,
  removerBeneficio,
} from "@/application/beneficios-frequencia";
import {
  listarJustificativas,
  criarJustificativa,
  atualizarJustificativa,
  removerJustificativa,
} from "@/application/justificativas";
import {
  listarLiberadores,
  criarLiberador,
  atualizarLiberador,
  removerLiberador,
} from "@/application/liberadores";
import {
  lerConfiguracaoNotificacoes,
  atualizarConfiguracaoNotificacoes,
} from "@/application/notificacoes-configuracao";
import { lerParametrosAcesso, atualizarParametrosAcesso } from "@/application/parametros-acesso";
import { lerOrdemAlmoco, definirOrdemAlmoco } from "@/application/ordem-almoco";
import { listarChavesBi, administrarChaveBi } from "@/application/chaves-bi";
import {
  lerLinha,
  salvarConfiguracao,
  type FinalidadeIntegracao,
} from "@/application/planilha-comum";

export type { ConfiguracoesCompletas, ResultadoLote, SecaoConfiguracao };

const itemOrdem = z.object({
  turmaId: z.string().min(1),
  inicio: z.string().nullable().optional(),
});

const esquemaPreferenciaPlanilha = z
  .object({
    ativa: z.boolean().optional(),
    envioAutomatico: z.boolean().optional(),
  })
  .strict();

const esquemaLote = z
  .object({
    revisoes: z.record(z.string(), z.string()),
    desejado: z
      .object({
        configuracoes: z.record(z.string(), z.unknown()).optional(),
        notificacoes: z.record(z.string(), z.unknown()).optional(),
        acesso: z.record(z.string(), z.unknown()).optional(),
        ordemAlmoco: z
          .array(z.object({ diaSemana: z.number().int(), itens: z.array(itemOrdem) }))
          .optional(),
        beneficios: z
          .array(
            z.object({
              id: z.string().optional(),
              nome: z.string(),
              percentualMinimoFrequencia: z.number(),
              aulasPorDia: z.number().nullable().optional(),
              faltasJustificadasContam: z.boolean(),
              ativo: z.boolean(),
            }),
          )
          .optional(),
        justificativas: z
          .array(z.object({ codigo: z.string(), rotulo: z.string(), ativo: z.boolean() }))
          .optional(),
        liberadores: z
          .array(z.object({ codigo: z.string(), rotulo: z.string(), ativo: z.boolean() }))
          .optional(),
        feriados: z.array(z.object({ dia: z.string(), nome: z.string() })).optional(),
        chavesBi: z
          .array(
            z.object({
              id: z.string(),
              rotulo: z.string(),
              escopo: z.unknown(),
              expiraEm: z.string().nullable().optional(),
              revogada: z.boolean().optional(),
              rotacionar: z.boolean().optional(),
            }),
          )
          .optional(),
        limparChavesBi: z.boolean().optional(),
        planilhas: z
          .object({
            frequencia: esquemaPreferenciaPlanilha.optional(),
            saidas: esquemaPreferenciaPlanilha.optional(),
            parcial: esquemaPreferenciaPlanilha.optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    senhaBi: z.string().optional(),
  })
  .strict();

const FINALIDADES: Record<FinalidadePlanilhaConfigurada, FinalidadeIntegracao> = {
  frequencia: "FREQUENCIA",
  saidas: "SAIDAS",
  parcial: "PARCIAL",
};

function hash(valor: unknown): string {
  return createHash("sha256").update(JSON.stringify(valor)).digest("hex");
}

async function lerPlanilhas(): Promise<PreferenciasPlanilhas> {
  const [frequencia, saidas, parcial] = await Promise.all([
    lerLinha("FREQUENCIA"),
    lerLinha("SAIDAS"),
    lerLinha("PARCIAL"),
  ]);
  return {
    frequencia: { ativa: frequencia.ativa, envioAutomatico: frequencia.envioAutomatico },
    saidas: { ativa: saidas.ativa, envioAutomatico: saidas.envioAutomatico },
    parcial: { ativa: parcial.ativa, envioAutomatico: parcial.envioAutomatico },
  };
}

async function lerRevisoes(): Promise<Record<SecaoConfiguracao, string>> {
  // As leituras garantem a criação das linhas únicas antes de calcular a versão.
  await Promise.all([
    lerConfiguracoes(),
    lerConfiguracaoNotificacoes(),
    lerParametrosAcesso(),
    lerPlanilhas(),
  ]);
  const [
    configuracao,
    notificacoes,
    acesso,
    ordem,
    beneficios,
    justificativas,
    liberadores,
    feriados,
    chaves,
    planilhas,
  ] = await Promise.all([
    banco().configuracao.findUnique({
      where: { id: "principal" },
      select: {
        atualizadoEm: true,
        origemSeries: { select: { serieId: true }, orderBy: { serieId: "asc" } },
        origemTurmas: { select: { turmaId: true }, orderBy: { turmaId: "asc" } },
      },
    }),
    banco().configuracaoNotificacoes.findUnique({
      where: { id: "principal" },
      select: { atualizadoEm: true },
    }),
    banco().parametrosAcesso.findUnique({
      where: { id: "principal" },
      select: { atualizadoEm: true },
    }),
    banco().ordemAlmoco.findMany({
      select: { diaSemana: true, turmaId: true, posicao: true, inicio: true, atualizadoEm: true },
      orderBy: [{ diaSemana: "asc" }, { posicao: "asc" }],
    }),
    banco().beneficioFrequencia.findMany({
      select: { id: true, atualizadoEm: true },
      orderBy: { id: "asc" },
    }),
    banco().justificativa.findMany({
      select: { codigo: true, atualizadoEm: true },
      orderBy: { codigo: "asc" },
    }),
    banco().liberador.findMany({
      select: { codigo: true, atualizadoEm: true },
      orderBy: { codigo: "asc" },
    }),
    banco().feriado.findMany({
      select: { dia: true, atualizadoEm: true },
      orderBy: { dia: "asc" },
    }),
    banco().chaveBi.findMany({
      select: {
        id: true,
        rotulo: true,
        escopo: true,
        expiraEm: true,
        revogadaEm: true,
      },
      orderBy: { id: "asc" },
    }),
    banco().integracaoPlanilha.findMany({
      select: { id: true, ativa: true, envioAutomatico: true, atualizadoEm: true },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    configuracao: hash({
      atualizadoEm: configuracao?.atualizadoEm ?? null,
      series: configuracao?.origemSeries.map((item) => item.serieId) ?? [],
      turmas: configuracao?.origemTurmas.map((item) => item.turmaId) ?? [],
    }),
    notificacoes: hash(notificacoes?.atualizadoEm ?? null),
    acesso: hash(acesso?.atualizadoEm ?? null),
    ordemAlmoco: hash(ordem),
    beneficios: hash(beneficios),
    justificativas: hash(justificativas),
    liberadores: hash(liberadores),
    feriados: hash(feriados),
    chavesBi: hash(chaves),
    planilhas: hash(planilhas),
  };
}

/** Lê tudo que a tela de Configurações precisa em uma única chamada. */
export async function lerConfiguracoesCompletas(): Promise<ConfiguracoesCompletas> {
  const [
    configuracoes,
    notificacoes,
    acesso,
    ordemAlmoco,
    beneficios,
    justificativas,
    liberadores,
    feriados,
    chavesBi,
    planilhas,
    revisoes,
  ] = await Promise.all([
    lerConfiguracoes(),
    lerConfiguracaoNotificacoes(),
    lerParametrosAcesso(),
    lerOrdemAlmoco(),
    listarBeneficios(),
    listarJustificativas(),
    listarLiberadores(),
    listarFeriados(),
    listarChavesBi(),
    lerPlanilhas(),
    lerRevisoes(),
  ]);
  return {
    configuracoes,
    notificacoes,
    acesso,
    ordemAlmoco,
    beneficios,
    justificativas,
    liberadores,
    feriados,
    chavesBi,
    planilhas,
    revisoes,
  };
}

function semFeriados(configuracoes: Record<string, unknown>): Record<string, unknown> {
  const { feriados: _feriados, atualizadoEm: _atualizadoEm, ...resto } = configuracoes;
  return resto;
}

function itensDaOrdem(dia: OrdemAlmocoDoDia): { turmaId: string; inicio: string | null }[] {
  return dia.itens.map((item) => ({ turmaId: item.turmaId, inicio: item.inicio }));
}

function diferencaDeOrdem(
  atual: OrdemAlmocoDoDia,
  desejado: { diaSemana: number; itens: { turmaId: string; inicio?: string | null }[] },
): boolean {
  const normalizado = desejado.itens.map((item, indice) => ({
    turmaId: item.turmaId,
    posicao: indice + 1,
    inicio: item.inicio ?? null,
  }));
  return (
    JSON.stringify(itensDaOrdem(atual)) !==
    JSON.stringify(normalizado.map(({ turmaId, inicio }) => ({ turmaId, inicio })))
  );
}

/** Aplica o conjunto completo em uma única transação serializável. */
export async function salvarConfiguracoesCompletas(
  admin: { id: string },
  entrada: unknown,
): Promise<ResultadoLote> {
  const analise = esquemaLote.safeParse(entrada);
  if (!analise.success) {
    throw new ErroHttp(analise.error.issues[0]?.message ?? "Confira as configurações.", 400);
  }
  const { revisoes, desejado, senhaBi } = analise.data;

  if ((desejado.chavesBi || desejado.limparChavesBi) && !senhaBi) {
    throw new ErroHttp(
      "Informe a senha do administrador para alterar as chaves do BI.",
      400,
      "SENHA_BI_OBRIGATORIA",
    );
  }

  return comTransacao(async (tx) =>
    usarTransacao(tx, async () => {
      const atuais = await lerRevisoes();
      const divergentes = (Object.keys(atuais) as SecaoConfiguracao[]).filter(
        (secao) => revisoes[secao] !== atuais[secao],
      );
      if (divergentes.length > 0) {
        const rotulos: Record<SecaoConfiguracao, string> = {
          configuracao: "Recursos da escola",
          notificacoes: "Notificações",
          acesso: "Acesso dos diretores",
          ordemAlmoco: "Ordem do almoço",
          beneficios: "Benefícios",
          justificativas: "Justificativas",
          liberadores: "Responsáveis",
          feriados: "Calendário letivo",
          chavesBi: "Chaves do BI",
          planilhas: "Planilhas",
        };
        throw new ErroHttp(
          `As configurações mudaram em outro acesso. Revise: ${divergentes.map((secao) => rotulos[secao]).join(", ")}.`,
          409,
          "CONFIGURACOES_ALTERADAS",
        );
      }

      const secoes = new Map<string, number>();
      const marcarSecao = (nome: string, quantidade = 1) => {
        secoes.set(nome, (secoes.get(nome) ?? 0) + quantidade);
      };
      const segredosBi: ResultadoLote["segredosBi"] = [];

      if (desejado.configuracoes) {
        const campos = semFeriados(desejado.configuracoes);
        if (Object.keys(campos).length > 0) {
          await atualizarConfiguracoes(admin, campos);
          marcarSecao("recursos");
        }
      }

      if (desejado.notificacoes) {
        await atualizarConfiguracaoNotificacoes(admin, desejado.notificacoes);
        marcarSecao("notificações");
      }

      if (desejado.acesso) {
        await atualizarParametrosAcesso(admin, desejado.acesso);
        marcarSecao("acesso");
      }

      if (desejado.ordemAlmoco) {
        const atuaisOrdem = await lerOrdemAlmoco();
        for (const dia of desejado.ordemAlmoco) {
          const atual = atuaisOrdem.find((item) => item.diaSemana === dia.diaSemana) ?? {
            diaSemana: dia.diaSemana,
            itens: [],
          };
          if (diferencaDeOrdem(atual, dia)) {
            await definirOrdemAlmoco(admin, dia.diaSemana, { itens: dia.itens });
            marcarSecao("ordem do almoço");
          }
        }
      }

      if (desejado.beneficios) {
        const atuaisBeneficios = await listarBeneficios();
        const idsAtuais = new Set(atuaisBeneficios.map((item) => item.id));
        const idsDesejados = new Set(desejado.beneficios.map((item) => item.id).filter(Boolean));
        for (const item of desejado.beneficios) {
          const dados = {
            nome: item.nome,
            percentualMinimoFrequencia: item.percentualMinimoFrequencia,
            aulasPorDia: item.aulasPorDia ?? null,
            faltasJustificadasContam: item.faltasJustificadasContam,
            ativo: item.ativo,
          };
          if (!item.id || item.id.startsWith("novo-") || !idsAtuais.has(item.id)) {
            await criarBeneficio(admin, dados);
          } else {
            await atualizarBeneficio(admin, item.id, dados);
          }
        }
        for (const atual of atuaisBeneficios) {
          if (!idsDesejados.has(atual.id)) await removerBeneficio(admin, atual.id);
        }
        marcarSecao("benefícios", desejado.beneficios.length);
      }

      if (desejado.justificativas) {
        const atuaisJustificativas = await listarJustificativas();
        const codigosAtuais = new Set(atuaisJustificativas.map((item) => item.codigo));
        const codigosDesejados = new Set(desejado.justificativas.map((item) => item.codigo));
        for (const item of desejado.justificativas) {
          const dados = { codigo: item.codigo, rotulo: item.rotulo, ativo: item.ativo };
          if (!codigosAtuais.has(item.codigo)) await criarJustificativa(admin, dados);
          else
            await atualizarJustificativa(admin, item.codigo, {
              rotulo: item.rotulo,
              ativo: item.ativo,
            });
        }
        for (const atual of atuaisJustificativas) {
          if (!codigosDesejados.has(atual.codigo)) await removerJustificativa(admin, atual.codigo);
        }
        marcarSecao("justificativas", desejado.justificativas.length);
      }

      if (desejado.liberadores) {
        const atuaisLiberadores = await listarLiberadores();
        const codigosAtuais = new Set(atuaisLiberadores.map((item) => item.codigo));
        const codigosDesejados = new Set(desejado.liberadores.map((item) => item.codigo));
        for (const item of desejado.liberadores) {
          const dados = { codigo: item.codigo, rotulo: item.rotulo, ativo: item.ativo };
          if (!codigosAtuais.has(item.codigo)) await criarLiberador(admin, dados);
          else
            await atualizarLiberador(admin, item.codigo, {
              rotulo: item.rotulo,
              ativo: item.ativo,
            });
        }
        for (const atual of atuaisLiberadores) {
          if (!codigosDesejados.has(atual.codigo)) await removerLiberador(admin, atual.codigo);
        }
        marcarSecao("responsáveis", desejado.liberadores.length);
      }

      if (desejado.feriados) {
        const atuaisFeriados = await listarFeriados();
        const porDia = new Map(atuaisFeriados.map((item) => [item.dia, item]));
        const desejadosPorDia = new Map(desejado.feriados.map((item) => [item.dia, item]));
        for (const item of desejado.feriados) {
          const atual = porDia.get(item.dia);
          if (!atual) await criarFeriado(admin, { dia: item.dia, nome: item.nome });
          else if (atual.nome !== item.nome) {
            await removerFeriado(admin, item.dia);
            await criarFeriado(admin, { dia: item.dia, nome: item.nome });
          }
        }
        for (const atual of atuaisFeriados) {
          if (!desejadosPorDia.has(atual.dia)) await removerFeriado(admin, atual.dia);
        }
        marcarSecao("calendário", desejado.feriados.length);
      }

      if (desejado.limparChavesBi) {
        await administrarChaveBi(admin, {
          acao: "limpar",
          senha: senhaBi ?? "",
        });
        marcarSecao("chaves do BI");
      }

      if (desejado.chavesBi) {
        const atuaisChaves = await listarChavesBi();
        const porId = new Map(atuaisChaves.map((item) => [item.id, item]));
        for (const item of desejado.chavesBi) {
          const atual = porId.get(item.id);
          if (item.rotacionar && atual) {
            const resultado = await administrarChaveBi(admin, {
              acao: "rotacionar",
              id: item.id,
              senha: senhaBi ?? "",
            });
            if (resultado.segredo && resultado.chave) {
              segredosBi.push({
                id: resultado.chave.id,
                rotulo: resultado.chave.rotulo,
                segredo: resultado.segredo,
              });
            }
          } else if (item.id.startsWith("novo-")) {
            const resultado = await administrarChaveBi(admin, {
              acao: "criar",
              rotulo: item.rotulo,
              escopo: item.escopo,
              expiraEm: item.expiraEm ?? null,
              senha: senhaBi ?? "",
            });
            if (resultado.segredo && resultado.chave) {
              segredosBi.push({
                id: resultado.chave.id,
                rotulo: resultado.chave.rotulo,
                segredo: resultado.segredo,
              });
            }
          } else if (!atual) {
            throw new ErroHttp(
              "Esta chave não existe mais. Recarregue as configurações.",
              409,
              "CHAVE_BI_AUSENTE",
            );
          } else if (item.revogada && !atual.revogadaEm) {
            await administrarChaveBi(admin, {
              acao: "revogar",
              id: item.id,
              senha: senhaBi ?? "",
            });
          } else if (
            !item.revogada &&
            (item.rotulo !== atual.rotulo ||
              JSON.stringify(item.escopo) !== JSON.stringify(atual.escopo) ||
              (item.expiraEm ?? null) !== atual.expiraEm)
          ) {
            await administrarChaveBi(admin, {
              acao: "editar",
              id: item.id,
              rotulo: item.rotulo,
              escopo: item.escopo,
              expiraEm: item.expiraEm ?? null,
              senha: senhaBi ?? "",
            });
          }
        }
        marcarSecao("chaves do BI", desejado.chavesBi.length);
      }

      if (desejado.planilhas) {
        for (const chave of ["frequencia", "saidas", "parcial"] as const) {
          const entrada = desejado.planilhas[chave];
          if (entrada && Object.keys(entrada).length > 0) {
            await salvarConfiguracao(admin, FINALIDADES[chave], entrada);
            marcarSecao("planilhas");
          }
        }
      }

      await auditar(
        tx,
        admin.id,
        "configuracao.lote",
        secoes.size > 0
          ? [...secoes.entries()].map(([nome, quantidade]) => `${nome}: ${quantidade}`).join(", ")
          : "sem alterações",
      );

      return {
        completo: await lerConfiguracoesCompletas(),
        segredosBi,
      };
    }),
  );
}
