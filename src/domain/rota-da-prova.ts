// Rota da prova: paradas pelo local efetivo, melhor ordem a partir da origem escolhida e textos do trajeto.
import { normalizar } from "@/domain/frequencia";
import {
  distanciaEmMetros,
  resolverLocalDoAluno,
  type LocalGravado,
  type MarcaDaProva,
  type ParticipanteDaProva,
  type PontoGeografico,
} from "@/domain/provas-especificas";

/** Até este número de paradas a ordem é a melhor possível; acima dele a ordem é aproximada. */
export const LIMITE_PARADAS_EXATAS = 12;

/** Texto livre da origem, no mesmo espírito do local da prova, com folga para um endereço. */
export const LIMITE_TEXTO_ORIGEM = 200;

/**
 * Velocidade usada só quando não há tempo de rua: 50 km/h em linha reta.
 * Com malha viária, o tempo vem do serviço e esta constante não entra na conta.
 */
export const VELOCIDADE_DA_RETA_METROS_POR_SEGUNDO = 50_000 / 3_600;

/** Critério da melhor ordem. O padrão da tela é o tempo total. */
export type CriterioDaRota = "tempo" | "distancia";

export type TipoDeTrecho = "viagem" | "urbano" | "volta";

export interface AlunoNaParada {
  alunoId: string;
  nome: string;
  presente: MarcaDaProva;
}

/** Grupo que desce no mesmo lugar, com ponto no mapa. */
export interface ParadaDaRota {
  chave: string;
  local: string;
  latitude: number;
  longitude: number;
  alunos: AlunoNaParada[];
}

/** Grupo sem ponto: fica fora da ordem até alguém marcar o mapa. */
export interface GrupoSemCoordenada {
  chave: string;
  local: string | null;
  alunos: AlunoNaParada[];
}

export interface OrigemDaRota {
  texto: string;
  latitude: number;
  longitude: number;
}

export interface Medida {
  distanciaMetros: number;
  duracaoSegundos: number;
}

export interface TrechoMedido extends Medida {
  tipo: TipoDeTrecho;
}

export interface TotaisDaRota {
  viagem: Medida;
  urbano: Medida;
  volta: Medida;
  geral: Medida;
}

export interface TrechoDesenhado {
  tipo: TipoDeTrecho;
  pontos: PontoGeografico[];
}

export interface RotaResolvida {
  /** Índices na lista de paradas, na ordem de visita. A origem não entra aqui. */
  ordem: number[];
  custo: number;
  /** Falso quando passou do limite e a ordem veio da heurística. */
  exata: boolean;
}

const INFINITO = Number.POSITIVE_INFINITY;

function celula(matriz: readonly (readonly number[])[], linha: number, coluna: number): number {
  const valor = matriz[linha]?.[coluna];
  if (valor === undefined || !Number.isFinite(valor)) {
    throw new Error("Matriz de custo incompleta.");
  }
  return valor;
}

/** Confere matriz quadrada, finita e com zero na diagonal. */
export function matrizDeCustoValida(matriz: readonly (readonly number[])[]): boolean {
  const tamanho = matriz.length;
  if (tamanho === 0) return false;
  return matriz.every(
    (linha, i) =>
      linha.length === tamanho &&
      linha.every((valor, j) => Number.isFinite(valor) && valor >= 0 && (i !== j || valor === 0)),
  );
}

function medidaVazia(): Medida {
  return { distanciaMetros: 0, duracaoSegundos: 0 };
}

/** Chave estável da parada: texto sem acento e sem caixa, mais o ponto em seis casas. */
export function chaveDaParada(local: string, ponto: PontoGeografico): string {
  const texto = normalizar(local).replace(/\s+/g, " ");
  return `${texto}|${ponto.latitude.toFixed(6)}|${ponto.longitude.toFixed(6)}`;
}

function chaveSemPonto(local: string | null): string {
  return `sem-ponto|${normalizar(local ?? "").replace(/\s+/g, " ")}`;
}

/**
 * Separa quem tem ponto efetivo, agrupado por texto e coordenada, de quem ainda não tem ponto.
 * A origem não entra aqui: ela é um campo livre, nunca um lugar deduzido destes grupos.
 */
export function montarParadas(
  participantes: readonly ParticipanteDaProva[],
  prova: LocalGravado,
): { paradas: ParadaDaRota[]; semCoordenada: GrupoSemCoordenada[] } {
  const comPonto = new Map<string, ParadaDaRota>();
  const semPonto = new Map<string, GrupoSemCoordenada>();
  const ordenados = [...participantes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  for (const participante of ordenados) {
    const resolvido = resolverLocalDoAluno(participante, prova);
    const aluno: AlunoNaParada = {
      alunoId: participante.alunoId,
      nome: participante.nome,
      presente: participante.presente,
    };
    if (resolvido.latitude === null || resolvido.longitude === null) {
      const chave = chaveSemPonto(resolvido.local);
      const grupo = semPonto.get(chave) ?? { chave, local: resolvido.local, alunos: [] };
      grupo.alunos.push(aluno);
      semPonto.set(chave, grupo);
      continue;
    }
    const ponto = { latitude: resolvido.latitude, longitude: resolvido.longitude };
    const local = resolvido.local ?? "Ponto no mapa";
    const chave = chaveDaParada(local, ponto);
    const parada = comPonto.get(chave) ?? {
      chave,
      local,
      latitude: ponto.latitude,
      longitude: ponto.longitude,
      alunos: [],
    };
    parada.alunos.push(aluno);
    comPonto.set(chave, parada);
  }
  const paradas = [...comPonto.values()].sort((a, b) => a.local.localeCompare(b.local, "pt-BR"));
  const semCoordenada = [...semPonto.values()].sort((a, b) => {
    if (a.local === null && b.local === null) return 0;
    if (a.local === null) return 1;
    if (b.local === null) return -1;
    return a.local.localeCompare(b.local, "pt-BR");
  });
  return { paradas, semCoordenada };
}

/**
 * Mantém a ordem salva para as paradas que ainda existem e põe as novas no fim,
 * na ordem em que a lista chegou. Chave desconhecida é ignorada.
 */
export function conciliarOrdem(
  salva: readonly string[] | null | undefined,
  paradas: readonly { chave: string }[],
): string[] {
  const conhecidas = new Set(paradas.map((parada) => parada.chave));
  const usadas = new Set<string>();
  const ordem: string[] = [];
  for (const chave of salva ?? []) {
    if (!conhecidas.has(chave) || usadas.has(chave)) continue;
    usadas.add(chave);
    ordem.push(chave);
  }
  for (const parada of paradas) {
    if (usadas.has(parada.chave)) continue;
    ordem.push(parada.chave);
  }
  return ordem;
}

/** Índices das chaves na lista de paradas. Devolve nulo se faltar alguma ou houver repetição. */
export function indicesDaOrdem(
  ordem: readonly string[],
  paradas: readonly { chave: string }[],
): number[] | null {
  if (ordem.length !== paradas.length) return null;
  const posicao = new Map(paradas.map((parada, indice) => [parada.chave, indice]));
  const indices: number[] = [];
  const vistos = new Set<number>();
  for (const chave of ordem) {
    const indice = posicao.get(chave);
    if (indice === undefined || vistos.has(indice)) return null;
    vistos.add(indice);
    indices.push(indice);
  }
  return indices;
}

/**
 * Distância em linha reta e tempo estimado a 50 km/h. As duas matrizes ordenam igual;
 * o aviso da tela deixa isso claro quando não há malha viária.
 */
export function matrizEmReta(pontos: readonly PontoGeografico[]): {
  distanciaMetros: number[][];
  duracaoSegundos: number[][];
} {
  const distanciaMetros = pontos.map((origem, i) =>
    pontos.map((destino, j) => (i === j ? 0 : distanciaEmMetros(origem, destino))),
  );
  const duracaoSegundos = distanciaMetros.map((linha) =>
    linha.map((metros) => metros / VELOCIDADE_DA_RETA_METROS_POR_SEGUNDO),
  );
  return { distanciaMetros, duracaoSegundos };
}

/** Custo de visitar as paradas nesta ordem, partindo do índice 0 da matriz. */
export function custoDaOrdem(
  custos: readonly (readonly number[])[],
  ordem: readonly number[],
  voltar: boolean,
): number {
  let total = 0;
  let anterior = 0;
  for (const indice of ordem) {
    total += celula(custos, anterior, indice + 1);
    anterior = indice + 1;
  }
  if (voltar && ordem.length > 0) total += celula(custos, anterior, 0);
  return total;
}

function heldKarp(
  custos: readonly (readonly number[])[],
  voltar: boolean,
): {
  ordem: number[];
  custo: number;
} {
  const paradas = custos.length - 1;
  if (paradas === 1) {
    const ida = celula(custos, 0, 1);
    return { ordem: [0], custo: voltar ? ida + celula(custos, 1, 0) : ida };
  }
  const cheio = (1 << paradas) - 1;
  const dp: number[][] = Array.from({ length: cheio + 1 }, () => Array(paradas).fill(INFINITO));
  const pai: number[][] = Array.from({ length: cheio + 1 }, () => Array(paradas).fill(-1));
  for (let j = 0; j < paradas; j += 1) {
    const linha = dp[1 << j];
    if (linha) linha[j] = celula(custos, 0, j + 1);
  }
  for (let mascara = 1; mascara <= cheio; mascara += 1) {
    for (let j = 0; j < paradas; j += 1) {
      if ((mascara & (1 << j)) === 0) continue;
      const base = dp[mascara]?.[j];
      if (base === undefined || base === INFINITO) continue;
      for (let k = 0; k < paradas; k += 1) {
        if ((mascara & (1 << k)) !== 0) continue;
        const proxima = mascara | (1 << k);
        const candidato = base + celula(custos, j + 1, k + 1);
        const linha = dp[proxima];
        const atual = linha?.[k];
        if (linha && atual !== undefined && candidato < atual) {
          linha[k] = candidato;
          const origem = pai[proxima];
          if (origem) origem[k] = j;
        }
      }
    }
  }
  let melhor = INFINITO;
  let fim = 0;
  for (let j = 0; j < paradas; j += 1) {
    const parcial = dp[cheio]?.[j];
    if (parcial === undefined || parcial === INFINITO) continue;
    const total = parcial + (voltar ? celula(custos, j + 1, 0) : 0);
    if (total < melhor) {
      melhor = total;
      fim = j;
    }
  }
  const ordem: number[] = [];
  let mascara = cheio;
  let j = fim;
  while (j !== -1) {
    ordem.push(j);
    const anterior = pai[mascara]?.[j] ?? -1;
    mascara ^= 1 << j;
    j = anterior;
  }
  ordem.reverse();
  return { ordem, custo: melhor };
}

function vizinhoMaisProximo(custos: readonly (readonly number[])[]): number[] {
  const paradas = custos.length - 1;
  const usadas = new Set<number>();
  const ordem: number[] = [];
  let anterior = 0;
  while (ordem.length < paradas) {
    let melhor = -1;
    let custo = INFINITO;
    for (let j = 0; j < paradas; j += 1) {
      if (usadas.has(j)) continue;
      const valor = celula(custos, anterior, j + 1);
      if (valor < custo) {
        custo = valor;
        melhor = j;
      }
    }
    if (melhor < 0) break;
    usadas.add(melhor);
    ordem.push(melhor);
    anterior = melhor + 1;
  }
  return ordem;
}

function doisOpt(
  custos: readonly (readonly number[])[],
  ordem: readonly number[],
  voltar: boolean,
): number[] {
  let atual = [...ordem];
  let melhorou = true;
  let rodadas = 0;
  while (melhorou && rodadas < 40) {
    rodadas += 1;
    melhorou = false;
    const base = custoDaOrdem(custos, atual, voltar);
    for (let i = 0; i < atual.length && !melhorou; i += 1) {
      for (let k = i + 1; k < atual.length; k += 1) {
        const candidata = [...atual];
        let esquerda = i;
        let direita = k;
        while (esquerda < direita) {
          const a = candidata[esquerda];
          const b = candidata[direita];
          if (a === undefined || b === undefined) break;
          candidata[esquerda] = b;
          candidata[direita] = a;
          esquerda += 1;
          direita -= 1;
        }
        if (custoDaOrdem(custos, candidata, voltar) + 1e-6 < base) {
          atual = candidata;
          melhorou = true;
          break;
        }
      }
    }
  }
  return atual;
}

function orOpt(
  custos: readonly (readonly number[])[],
  ordem: readonly number[],
  voltar: boolean,
): number[] {
  let atual = [...ordem];
  let melhorou = true;
  let rodadas = 0;
  while (melhorou && rodadas < 40) {
    rodadas += 1;
    melhorou = false;
    const base = custoDaOrdem(custos, atual, voltar);
    for (let tamanho = 1; tamanho <= 3 && !melhorou; tamanho += 1) {
      for (let i = 0; i + tamanho <= atual.length && !melhorou; i += 1) {
        const bloco = atual.slice(i, i + tamanho);
        const resto = atual.slice(0, i).concat(atual.slice(i + tamanho));
        for (let j = 0; j <= resto.length; j += 1) {
          if (j === i) continue;
          const candidata = resto.slice(0, j).concat(bloco, resto.slice(j));
          if (custoDaOrdem(custos, candidata, voltar) + 1e-6 < base) {
            atual = candidata;
            melhorou = true;
            break;
          }
        }
      }
    }
  }
  return atual;
}

function trocaDois(
  custos: readonly (readonly number[])[],
  ordem: readonly number[],
  voltar: boolean,
): number[] {
  let atual = [...ordem];
  let melhorou = true;
  let rodadas = 0;
  while (melhorou && rodadas < 40) {
    rodadas += 1;
    melhorou = false;
    const base = custoDaOrdem(custos, atual, voltar);
    for (let i = 0; i < atual.length && !melhorou; i += 1) {
      for (let k = i + 1; k < atual.length; k += 1) {
        const candidata = [...atual];
        const a = candidata[i];
        const b = candidata[k];
        if (a === undefined || b === undefined) continue;
        candidata[i] = b;
        candidata[k] = a;
        if (custoDaOrdem(custos, candidata, voltar) + 1e-6 < base) {
          atual = candidata;
          melhorou = true;
          break;
        }
      }
    }
  }
  return atual;
}

function melhorar(
  custos: readonly (readonly number[])[],
  ordem: readonly number[],
  voltar: boolean,
): number[] {
  let atual = [...ordem];
  let melhorou = true;
  let rodadas = 0;
  while (melhorou && rodadas < 20) {
    rodadas += 1;
    const antes = custoDaOrdem(custos, atual, voltar);
    atual = trocaDois(custos, orOpt(custos, doisOpt(custos, atual, voltar), voltar), voltar);
    melhorou = custoDaOrdem(custos, atual, voltar) + 1e-6 < antes;
  }
  return atual;
}

function insercaoMaisBarata(custos: readonly (readonly number[])[], voltar: boolean): number[] {
  const paradas = custos.length - 1;
  const restantes = Array.from({ length: paradas }, (_, indice) => indice);
  const ordem: number[] = [];
  while (restantes.length > 0) {
    let melhorIndice = 0;
    let melhorPosicao = 0;
    let melhorCusto = INFINITO;
    restantes.forEach((parada, indice) => {
      for (let posicao = 0; posicao <= ordem.length; posicao += 1) {
        const candidata = ordem.slice(0, posicao).concat(parada, ordem.slice(posicao));
        const valor = custoDaOrdem(custos, candidata, voltar);
        if (valor < melhorCusto) {
          melhorCusto = valor;
          melhorIndice = indice;
          melhorPosicao = posicao;
        }
      }
    });
    const escolhida = restantes[melhorIndice];
    if (escolhida === undefined) break;
    ordem.splice(melhorPosicao, 0, escolhida);
    restantes.splice(melhorIndice, 1);
  }
  return ordem;
}

function vizinhoComPrimeira(custos: readonly (readonly number[])[], primeira: number): number[] {
  const paradas = custos.length - 1;
  const usadas = new Set<number>([primeira]);
  const ordem = [primeira];
  let anterior = primeira + 1;
  while (ordem.length < paradas) {
    let melhor = -1;
    let custo = INFINITO;
    for (let j = 0; j < paradas; j += 1) {
      if (usadas.has(j)) continue;
      const valor = celula(custos, anterior, j + 1);
      if (valor < custo) {
        custo = valor;
        melhor = j;
      }
    }
    if (melhor < 0) break;
    usadas.add(melhor);
    ordem.push(melhor);
    anterior = melhor + 1;
  }
  return ordem;
}

/**
 * Heurística forte para mais de 12 paradas: inserção mais barata, vizinho mais próximo
 * a partir de cada primeira parada próxima e busca local (2-opt, Or-opt e troca).
 * Não garante o ótimo.
 */
export function aproximarRota(
  custos: readonly (readonly number[])[],
  voltar: boolean,
): { ordem: number[]; custo: number } {
  if (!matrizDeCustoValida(custos)) throw new Error("Matriz de custo incompleta.");
  const paradas = custos.length - 1;
  if (paradas === 0) return { ordem: [], custo: 0 };
  const candidatas = [vizinhoMaisProximo(custos), insercaoMaisBarata(custos, voltar)];
  const limite = paradas <= 20 ? paradas : 10;
  const porProximidade = Array.from({ length: paradas }, (_, indice) => indice).sort(
    (a, b) => celula(custos, 0, a + 1) - celula(custos, 0, b + 1),
  );
  for (const primeira of porProximidade.slice(0, limite)) {
    candidatas.push(vizinhoComPrimeira(custos, primeira));
  }
  let melhorOrdem = candidatas[0] ?? [];
  let melhorCusto = INFINITO;
  for (const candidata of candidatas) {
    const ordem = melhorar(custos, candidata, voltar);
    const custo = custoDaOrdem(custos, ordem, voltar);
    if (custo < melhorCusto) {
      melhorCusto = custo;
      melhorOrdem = ordem;
    }
  }
  return { ordem: melhorOrdem, custo: melhorCusto };
}

/**
 * Melhor caminho aberto (ou com volta à origem) partindo do índice 0.
 * Até 12 paradas usa programação dinâmica; acima disso, a heurística forte.
 */
export function resolverRota(
  custos: readonly (readonly number[])[],
  voltar: boolean,
): RotaResolvida {
  if (!matrizDeCustoValida(custos)) {
    throw new Error("Matriz de custo incompleta.");
  }
  const paradas = custos.length - 1;
  if (paradas === 0) return { ordem: [], custo: 0, exata: true };
  if (paradas <= LIMITE_PARADAS_EXATAS) {
    const exata = heldKarp(custos, voltar);
    return { ordem: exata.ordem, custo: exata.custo, exata: true };
  }
  const aproximada = aproximarRota(custos, voltar);
  return { ordem: aproximada.ordem, custo: aproximada.custo, exata: false };
}

/**
 * Menor caminho por enumeração, para conferir o solver em instâncias pequenas.
 * Acima de 8 paradas recusa, porque o fatorial deixa de servir a um teste.
 */
export function menorRotaPorForcaBruta(
  custos: readonly (readonly number[])[],
  voltar: boolean,
): { ordem: number[]; custo: number } {
  if (!matrizDeCustoValida(custos)) throw new Error("Matriz de custo incompleta.");
  const paradas = custos.length - 1;
  if (paradas > 8) throw new Error("Força bruta só até 8 paradas.");
  if (paradas === 0) return { ordem: [], custo: 0 };
  let melhor = INFINITO;
  let melhorOrdem: number[] = [];
  const usadas = Array(paradas).fill(false);
  const caminho: number[] = [];
  function visitar(anterior: number, acumulado: number): void {
    if (caminho.length === paradas) {
      const total = voltar ? acumulado + celula(custos, anterior, 0) : acumulado;
      if (total < melhor) {
        melhor = total;
        melhorOrdem = [...caminho];
      }
      return;
    }
    for (let j = 0; j < paradas; j += 1) {
      if (usadas[j]) continue;
      usadas[j] = true;
      caminho.push(j);
      visitar(j + 1, acumulado + celula(custos, anterior, j + 1));
      caminho.pop();
      usadas[j] = false;
    }
  }
  visitar(0, 0);
  return { ordem: melhorOrdem, custo: melhor };
}

/** Mede cada trecho na ordem dada. O primeiro é a viagem desde a origem; a volta é opcional. */
export function medirTrechos(
  distancia: readonly (readonly number[])[],
  duracao: readonly (readonly number[])[],
  ordem: readonly number[],
  voltar: boolean,
): TrechoMedido[] {
  const trechos: TrechoMedido[] = [];
  let anterior = 0;
  ordem.forEach((indice, posicao) => {
    const atual = indice + 1;
    trechos.push({
      tipo: posicao === 0 ? "viagem" : "urbano",
      distanciaMetros: celula(distancia, anterior, atual),
      duracaoSegundos: celula(duracao, anterior, atual),
    });
    anterior = atual;
  });
  if (voltar && ordem.length > 0) {
    trechos.push({
      tipo: "volta",
      distanciaMetros: celula(distancia, anterior, 0),
      duracaoSegundos: celula(duracao, anterior, 0),
    });
  }
  return trechos;
}

export function somarTrechos(trechos: readonly TrechoMedido[]): TotaisDaRota {
  const totais: TotaisDaRota = {
    viagem: medidaVazia(),
    urbano: medidaVazia(),
    volta: medidaVazia(),
    geral: medidaVazia(),
  };
  for (const trecho of trechos) {
    totais[trecho.tipo].distanciaMetros += trecho.distanciaMetros;
    totais[trecho.tipo].duracaoSegundos += trecho.duracaoSegundos;
    totais.geral.distanciaMetros += trecho.distanciaMetros;
    totais.geral.duracaoSegundos += trecho.duracaoSegundos;
  }
  return totais;
}

/** Linhas retas entre a origem e as paradas já ordenadas, com a volta quando pedida. */
export function geometriaEmReta(
  origem: PontoGeografico,
  paradas: readonly PontoGeografico[],
  voltar: boolean,
): TrechoDesenhado[] {
  const primeira = paradas[0];
  if (!primeira) return [];
  const desenhos: TrechoDesenhado[] = [{ tipo: "viagem", pontos: [origem, primeira] }];
  for (let i = 0; i < paradas.length - 1; i += 1) {
    const a = paradas[i];
    const b = paradas[i + 1];
    if (!a || !b) continue;
    desenhos.push({ tipo: "urbano", pontos: [a, b] });
  }
  const ultima = paradas[paradas.length - 1];
  if (voltar && ultima) desenhos.push({ tipo: "volta", pontos: [ultima, origem] });
  return desenhos;
}

/** Apara o texto e arredonda o ponto. Os três vazios significam origem ainda não escolhida. */
export function normalizarOrigem(dados: {
  texto?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): { texto: string; latitude: number | null; longitude: number | null } {
  const texto = (dados.texto ?? "").trim().replace(/\s+/g, " ");
  const fator = 1_000_000;
  const arredondar = (valor: number | null | undefined) => {
    if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
    return Math.round(valor * fator) / fator;
  };
  return {
    texto,
    latitude: arredondar(dados.latitude),
    longitude: arredondar(dados.longitude),
  };
}

/** Confere a origem livre. Nulo nas três partes é válido e significa que ainda não há partida. */
export function problemaNaOrigem(origem: {
  texto: string;
  latitude: number | null;
  longitude: number | null;
}): string | null {
  const semTexto = origem.texto === "";
  const semPonto = origem.latitude === null && origem.longitude === null;
  if (semTexto && semPonto) return null;
  if (origem.texto.length > LIMITE_TEXTO_ORIGEM) {
    return `A origem deve ter no máximo ${LIMITE_TEXTO_ORIGEM} caracteres.`;
  }
  if (semTexto) return "Informe o endereço ou a cidade de partida.";
  if ((origem.latitude === null) !== (origem.longitude === null)) {
    return "Informe a latitude e a longitude juntas.";
  }
  if (semPonto) return "Marque o ponto de partida no mapa, pela busca ou pela posição do aparelho.";
  if (origem.latitude !== null && (origem.latitude < -90 || origem.latitude > 90)) {
    return "A latitude deve ficar entre -90 e 90.";
  }
  if (origem.longitude !== null && (origem.longitude < -180 || origem.longitude > 180)) {
    return "A longitude deve ficar entre -180 e 180.";
  }
  return null;
}

export function rotuloDeDistancia(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return "sem distância";
  if (metros < 1000) return `${Math.round(metros)} m`;
  const km = metros / 1000;
  const texto = (km >= 100 ? km.toFixed(0) : km.toFixed(1)).replace(".", ",");
  return `${texto} km`;
}

export function rotuloDeDuracao(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "sem tempo";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${Math.max(minutos, 1)} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

function coordenadaDeUrl(ponto: PontoGeografico): string {
  return `${ponto.latitude.toFixed(6)},${ponto.longitude.toFixed(6)}`;
}

/** O Google Maps na web aceita até 9 pontos intermediários além da partida e da chegada. */
export const LIMITE_INTERMEDIARIOS_GOOGLE = 9;

/** Abre o trajeto completo no Google Maps. Se passar do limite, leva as primeiras paradas. */
export function urlNoGoogleMaps(
  origem: PontoGeografico,
  paradas: readonly PontoGeografico[],
  voltar: boolean,
): { url: string; truncada: boolean } {
  const ultima = paradas[paradas.length - 1];
  if (!ultima) {
    const params = new URLSearchParams({ api: "1", query: coordenadaDeUrl(origem) });
    return { url: `https://www.google.com/maps/search/?${params.toString()}`, truncada: false };
  }
  const destino = voltar ? origem : ultima;
  const intermediarias = voltar ? [...paradas] : paradas.slice(0, -1);
  const usadas = intermediarias.slice(0, LIMITE_INTERMEDIARIOS_GOOGLE);
  const params = new URLSearchParams({
    api: "1",
    origin: coordenadaDeUrl(origem),
    destination: coordenadaDeUrl(destino),
    travelmode: "driving",
  });
  if (usadas.length > 0) params.set("waypoints", usadas.map(coordenadaDeUrl).join("|"));
  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    truncada: intermediarias.length > LIMITE_INTERMEDIARIOS_GOOGLE,
  };
}

/** Abre a navegação até um ponto no Waze. */
export function urlNoWaze(ponto: PontoGeografico): string {
  const params = new URLSearchParams({
    ll: coordenadaDeUrl(ponto),
    navigate: "yes",
  });
  return `https://www.waze.com/ul?${params.toString()}`;
}
