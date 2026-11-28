// Planejamento da rota de uma prova: origem livre, ordem salva e cálculo sem gravar o GPS de quem acompanha.
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";
import { geometriaOsrm, matrizOsrm } from "@/infra/osrm";
import { buscarNoNominatim, type LugarEncontrado } from "@/infra/nominatim";
import type { Identidade } from "@/domain/usuarios";
import {
  geometriaEmReta,
  indicesDaOrdem,
  LIMITE_PARADAS_EXATAS,
  LIMITE_TEXTO_ORIGEM,
  matrizEmReta,
  medirTrechos,
  montarParadas,
  normalizarOrigem,
  problemaNaOrigem,
  resolverRota,
  somarTrechos,
  type CriterioDaRota,
  type OrigemDaRota,
  type TotaisDaRota,
  type TrechoDesenhado,
  type TrechoMedido,
} from "@/domain/rota-da-prova";
import type { PontoGeografico } from "@/domain/provas-especificas";
import { exigirAcessoAProva, exigirQuemConsultaRota } from "@/application/acesso-prova";
import { lerProvaEspecifica } from "@/application/provas-especificas";

const LIMITE_PARADAS = 80;

const esquemaOrigem = z
  .object({
    texto: z.string("Informe a origem.").max(LIMITE_TEXTO_ORIGEM, "A origem é longa demais."),
    latitude: z.number("Latitude inválida."),
    longitude: z.number("Longitude inválida."),
  })
  .strict();

const esquemaCalculo = z
  .object({
    origem: esquemaOrigem,
    criterio: z.enum(["tempo", "distancia"], "Escolha tempo ou distância.").default("tempo"),
    voltar: z.boolean("Informe se a rota volta à origem.").default(false),
    ordem: z.array(z.string("Parada inválida.")).max(LIMITE_PARADAS).optional(),
  })
  .strict();

const esquemaSalvar = z
  .object({
    origem: esquemaOrigem.nullable(),
    criterio: z.enum(["tempo", "distancia"], "Escolha tempo ou distância.").nullable(),
    voltar: z.boolean("Informe se a rota volta à origem.").nullable(),
    ordem: z.array(z.string("Parada inválida.")).max(LIMITE_PARADAS).nullable(),
  })
  .strict();

function primeiroErro(erro: z.ZodError): ErroHttp {
  return new ErroHttp(erro.issues[0]?.message ?? "Dados inválidos.", 400);
}

function lerOrdem(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || !valor.every((item) => typeof item === "string")) return null;
  return valor;
}

export interface PlanoDaRota {
  origem: OrigemDaRota | null;
  criterio: CriterioDaRota | null;
  voltar: boolean | null;
  ordem: string[] | null;
  servicos: { ruas: boolean; enderecos: boolean };
}

export interface CalculoDaRota {
  metodo: "exata" | "aproximada" | "manual";
  fonte: "ruas" | "reta";
  aviso: string | null;
  criterio: CriterioDaRota;
  voltar: boolean;
  origem: OrigemDaRota;
  ordem: string[];
  trechos: TrechoMedido[];
  totais: TotaisDaRota;
  geometria: TrechoDesenhado[];
}

/** O que já foi salvo na prova, mais se há serviço de ruas e de endereço. Não calcula trajeto. */
export async function lerPlanoDaRota(usuario: Identidade, id: string): Promise<PlanoDaRota> {
  await exigirAcessoAProva(usuario, id, "ler");
  const prova = await banco().provaEspecifica.findUnique({
    where: { id },
    select: {
      origemRota: true,
      origemLatitude: true,
      origemLongitude: true,
      rotaCriterio: true,
      rotaVoltar: true,
      rotaOrdem: true,
    },
  });
  if (!prova) throw new ErroHttp("Prova não encontrada.", 404);
  const origem =
    prova.origemRota && prova.origemLatitude !== null && prova.origemLongitude !== null
      ? {
          texto: prova.origemRota,
          latitude: prova.origemLatitude,
          longitude: prova.origemLongitude,
        }
      : null;
  const criterio =
    prova.rotaCriterio === "tempo" || prova.rotaCriterio === "distancia"
      ? prova.rotaCriterio
      : null;
  return {
    origem,
    criterio,
    voltar: prova.rotaVoltar,
    ordem: lerOrdem(prova.rotaOrdem),
    servicos: { ruas: ambiente.osrmUrl !== null, enderecos: ambiente.nominatimUrl !== null },
  };
}

/** Calcula a ordem e o traçado. Não grava origem, ordem nem posição de quem acompanha. */
export async function calcularRotaDaProva(
  usuario: Identidade,
  id: string,
  entrada: unknown,
): Promise<CalculoDaRota> {
  await exigirAcessoAProva(usuario, id, "ler");
  const dados = esquemaCalculo.safeParse(entrada);
  if (!dados.success) throw primeiroErro(dados.error);
  const origemNormalizada = normalizarOrigem(dados.data.origem);
  const problema = problemaNaOrigem(origemNormalizada);
  if (problema || origemNormalizada.latitude === null || origemNormalizada.longitude === null) {
    throw new ErroHttp(problema ?? "Informe a origem da rota.", 400);
  }
  const origem: OrigemDaRota = {
    texto: origemNormalizada.texto,
    latitude: origemNormalizada.latitude,
    longitude: origemNormalizada.longitude,
  };
  const detalhe = await lerProvaEspecifica(id);
  const { paradas } = montarParadas(detalhe.participantes, detalhe.prova);
  if (paradas.length === 0) {
    throw new ErroHttp("Nenhuma parada tem ponto no mapa.", 400);
  }
  if (paradas.length > LIMITE_PARADAS) {
    throw new ErroHttp(`A rota passa de ${LIMITE_PARADAS} paradas.`, 400);
  }
  const manual = dados.data.ordem ? indicesDaOrdem(dados.data.ordem, paradas) : null;
  if (dados.data.ordem && !manual) {
    throw new ErroHttp("A ordem precisa incluir todas as paradas com ponto.", 400);
  }

  const pontos: PontoGeografico[] = [
    { latitude: origem.latitude, longitude: origem.longitude },
    ...paradas.map((parada) => ({ latitude: parada.latitude, longitude: parada.longitude })),
  ];
  let fonte: CalculoDaRota["fonte"] = "reta";
  const avisos: string[] = [];
  let matrizes = matrizEmReta(pontos);
  if (ambiente.osrmUrl) {
    const viaria = await matrizOsrm(ambiente.osrmUrl, pontos);
    if (viaria) {
      matrizes = viaria;
      fonte = "ruas";
    } else {
      avisos.push(
        "Não foi possível consultar as ruas. A ordem e os tempos usam linha reta, a 50 km/h.",
      );
    }
  } else {
    avisos.push(
      "A consulta de ruas não está configurada. A ordem e os tempos usam linha reta, a 50 km/h.",
    );
  }

  const criterio = dados.data.criterio;
  const voltar = dados.data.voltar;
  const custos = criterio === "tempo" ? matrizes.duracaoSegundos : matrizes.distanciaMetros;
  let metodo: CalculoDaRota["metodo"];
  let ordemIndices: number[];
  if (manual) {
    ordemIndices = manual;
    metodo = "manual";
  } else {
    const resolvida = resolverRota(custos, voltar);
    ordemIndices = resolvida.ordem;
    metodo = resolvida.exata ? "exata" : "aproximada";
    if (!resolvida.exata) {
      avisos.push(`Acima de ${LIMITE_PARADAS_EXATAS} paradas, a ordem é aproximada.`);
    }
  }

  const ordenadas = ordemIndices.map((indice) => {
    const parada = paradas[indice];
    if (!parada) throw new ErroHttp("Não foi possível ordenar as paradas.", 500);
    return parada;
  });
  const pontosOrdenados: PontoGeografico[] = [
    { latitude: origem.latitude, longitude: origem.longitude },
    ...ordenadas.map((parada) => ({ latitude: parada.latitude, longitude: parada.longitude })),
  ];
  if (voltar) pontosOrdenados.push({ latitude: origem.latitude, longitude: origem.longitude });

  let geometria = geometriaEmReta(
    { latitude: origem.latitude, longitude: origem.longitude },
    ordenadas,
    voltar,
  );
  if (fonte === "ruas" && ambiente.osrmUrl) {
    const desenhada = await geometriaOsrm(ambiente.osrmUrl, pontosOrdenados, voltar);
    if (desenhada) geometria = desenhada;
    else {
      avisos.push(
        "O traçado por ruas não veio. O mapa mostra linhas retas; os tempos continuam os da malha.",
      );
    }
  }

  const trechos = medirTrechos(
    matrizes.distanciaMetros,
    matrizes.duracaoSegundos,
    ordemIndices,
    voltar,
  );
  return {
    metodo,
    fonte,
    aviso: avisos.length > 0 ? avisos.join(" ") : null,
    criterio,
    voltar,
    origem,
    ordem: ordenadas.map((parada) => parada.chave),
    trechos,
    totais: somarTrechos(trechos),
    geometria,
  };
}

/** Grava a origem escolhida e a ordem das paradas. A auditoria não leva coordenada nem nome. */
export async function salvarRotaDaProva(
  usuario: Identidade,
  id: string,
  entrada: unknown,
): Promise<PlanoDaRota> {
  await exigirAcessoAProva(usuario, id, "gravar");
  const dados = esquemaSalvar.safeParse(entrada);
  if (!dados.success) throw primeiroErro(dados.error);
  const origem = dados.data.origem ? normalizarOrigem(dados.data.origem) : normalizarOrigem({});
  const problema = problemaNaOrigem(origem);
  if (problema) throw new ErroHttp(problema, 400);
  if (dados.data.origem && (origem.latitude === null || origem.longitude === null)) {
    throw new ErroHttp("Marque o ponto de partida.", 400);
  }
  const ordem = dados.data.ordem;
  if (ordem && new Set(ordem).size !== ordem.length) {
    throw new ErroHttp("A ordem tem parada repetida.", 400);
  }
  await comTransacao(async (tx) => {
    const alteradas = await tx.provaEspecifica.updateMany({
      where: { id },
      data: {
        origemRota: origem.texto === "" ? null : origem.texto,
        origemLatitude: origem.latitude,
        origemLongitude: origem.longitude,
        rotaCriterio: dados.data.criterio,
        rotaVoltar: dados.data.voltar,
        rotaOrdem: ordem === null ? Prisma.DbNull : ordem,
      },
    });
    if (alteradas.count === 0) throw new ErroHttp("Prova não encontrada.", 404);
    await auditar(
      tx,
      usuario.id,
      "prova-especifica.rota",
      `prova:${id} paradas:${ordem?.length ?? 0}`,
    );
  });
  return lerPlanoDaRota(usuario, id);
}

/** Busca um endereço ou uma cidade. Não grava o texto nem o ponto. */
export async function buscarOrigemDaRota(
  usuario: Identidade,
  consulta: string,
): Promise<LugarEncontrado[]> {
  await exigirQuemConsultaRota(usuario);
  const texto = consulta.trim().replace(/\s+/g, " ");
  if (texto.length < 3) throw new ErroHttp("Informe ao menos 3 caracteres para buscar.", 400);
  if (texto.length > LIMITE_TEXTO_ORIGEM) {
    throw new ErroHttp(`A busca deve ter no máximo ${LIMITE_TEXTO_ORIGEM} caracteres.`, 400);
  }
  if (!ambiente.nominatimUrl) {
    throw new ErroHttp("A busca por endereço não está configurada.", 404);
  }
  const lugares = await buscarNoNominatim(ambiente.nominatimUrl, texto);
  if (!lugares) throw new ErroHttp("Não foi possível buscar o endereço agora.", 503);
  return lugares;
}
