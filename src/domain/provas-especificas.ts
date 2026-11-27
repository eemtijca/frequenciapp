// Provas específicas (Enem, vestibulares e similares): regras puras de cadastro e de frequência, compartilhadas com a interface.
import { ehDiaValido } from "@/domain/frequencia";

/** Limites iguais aos das colunas do banco. */
export const LIMITE_NOME_PROVA_ESPECIFICA = 120;
export const LIMITE_LOCAL_PROVA_ESPECIFICA = 120;

/** Alunos de uma vez em uma prova, folgado para a escola inteira. */
export const LIMITE_PARTICIPANTES_PROVA = 3000;

/** Marca de um participante: presente, ausente ou ainda sem registro. */
export type MarcaDaProva = boolean | null;

export interface ProvaEspecifica {
  id: string;
  nome: string;
  /** Local de realização; nulo quando não foi informado. */
  local: string | null;
  /** Coordenadas do local no mapa, em graus decimais; as duas ou nenhuma. */
  latitude: number | null;
  longitude: number | null;
  /** Data civil YYYY-MM-DD. */
  dia: string;
  total: number;
  presentes: number;
  ausentes: number;
}

export interface ParticipanteDaProva {
  alunoId: string;
  nome: string;
  turmaId: string;
  presente: MarcaDaProva;
}

/** Prova aberta com a lista de participantes usada pela tela de frequência. */
export interface DetalheDaProva {
  prova: ProvaEspecifica;
  participantes: ParticipanteDaProva[];
}

export interface DadosDaProvaEspecifica {
  nome: string;
  local: string | null;
  latitude: number | null;
  longitude: number | null;
  dia: string;
}

/** Casas decimais gravadas nas coordenadas: seis dão cerca de 11 cm, mais que o GPS entrega. */
export const CASAS_DAS_COORDENADAS = 6;

function arredondar(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const fator = 10 ** CASAS_DAS_COORDENADAS;
  return Math.round(valor * fator) / fator;
}

/**
 * Remove espaços das pontas, transforma o local vazio em nulo e arredonda as coordenadas.
 * Um número que não é finito vira nulo; o par incompleto é recusado na validação.
 */
export function normalizarProvaEspecifica(dados: {
  nome: string;
  local?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  dia: string;
}): DadosDaProvaEspecifica {
  const local = (dados.local ?? "").trim();
  return {
    nome: dados.nome.trim(),
    local: local === "" ? null : local,
    latitude: arredondar(dados.latitude),
    longitude: arredondar(dados.longitude),
    dia: dados.dia,
  };
}

/**
 * Confere uma prova antes de gravar. A data pode ser passada, para registrar depois,
 * e pode cair no domingo, como o Enem. Devolve a mensagem do primeiro problema ou nulo.
 */
export function problemaNaProvaEspecifica(prova: DadosDaProvaEspecifica): string | null {
  if (!prova.nome) return "Informe o nome da prova.";
  if (prova.nome.length > LIMITE_NOME_PROVA_ESPECIFICA)
    return `O nome deve ter no máximo ${LIMITE_NOME_PROVA_ESPECIFICA} caracteres.`;
  if (prova.local !== null && prova.local.length > LIMITE_LOCAL_PROVA_ESPECIFICA)
    return `O local deve ter no máximo ${LIMITE_LOCAL_PROVA_ESPECIFICA} caracteres.`;
  const coordenadas = problemaNasCoordenadas(prova.latitude, prova.longitude);
  if (coordenadas) return coordenadas;
  if (!ehDiaValido(prova.dia)) return "Data da prova inválida.";
  return null;
}

/** Limites geográficos das coordenadas. */
export const LIMITE_LATITUDE = 90;
export const LIMITE_LONGITUDE = 180;

/** Confere uma coordenada isolada e devolve a mensagem do primeiro problema. */
export function problemaNaCoordenada(
  valor: number,
  limite: number,
  nome: "latitude" | "longitude",
): string | null {
  if (valor < -limite || valor > limite)
    return `A ${nome} deve ficar entre -${limite} e ${limite}.`;
  return null;
}

/** Confere o par de coordenadas: as duas ou nenhuma, dentro da faixa geográfica. */
export function problemaNasCoordenadas(
  latitude: number | null,
  longitude: number | null,
): string | null {
  if ((latitude === null) !== (longitude === null))
    return "Informe a latitude e a longitude juntas.";
  if (latitude !== null) {
    const problema = problemaNaCoordenada(latitude, LIMITE_LATITUDE, "latitude");
    if (problema) return problema;
  }
  if (longitude !== null) {
    const problema = problemaNaCoordenada(longitude, LIMITE_LONGITUDE, "longitude");
    if (problema) return problema;
  }
  return null;
}

/**
 * Lê uma coordenada digitada, com vírgula ou ponto decimal. Devolve nulo para texto vazio ou que
 * não seja um número simples; a faixa geográfica é conferida à parte, na validação da prova.
 */
export function coordenadaDoTexto(texto: string): number | null {
  const limpo = texto.trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(limpo)) return null;
  return Number(limpo.replace(",", "."));
}

/** Coordenadas em texto para a tela, com vírgula decimal: "-3,731900, -38,526700". */
export function rotuloDasCoordenadas(latitude: number, longitude: number): string {
  const texto = (valor: number) => valor.toFixed(CASAS_DAS_COORDENADAS).replace(".", ",");
  return `${texto(latitude)}, ${texto(longitude)}`;
}

/** Endereço do local no openstreetmap.org, para abrir o mapa completo em outra aba. */
export function enderecoNoOpenStreetMap(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(CASAS_DAS_COORDENADAS);
  const lon = longitude.toFixed(CASAS_DAS_COORDENADAS);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

/** Contagens da frequência de uma lista de marcas. */
export function resumirMarcas(marcas: readonly MarcaDaProva[]): {
  total: number;
  presentes: number;
  ausentes: number;
  pendentes: number;
} {
  let presentes = 0;
  let ausentes = 0;
  for (const marca of marcas) {
    if (marca === true) presentes += 1;
    else if (marca === false) ausentes += 1;
  }
  return {
    total: marcas.length,
    presentes,
    ausentes,
    pendentes: marcas.length - presentes - ausentes,
  };
}

/** Raio, em metros, dentro do qual duas provas contam como no mesmo lugar. */
export const RAIO_DO_MESMO_LOCAL_METROS = 100;

export interface PontoGeografico {
  latitude: number;
  longitude: number;
}

/** Prova que acontece no mesmo lugar, com os alunos inscritos nela. */
export interface ProvaNoLocal {
  id: string;
  nome: string;
  /** Data civil YYYY-MM-DD. */
  dia: string;
  alunos: number;
  /** Verdadeiro para a prova em edição, que entra na conta mesmo antes de o ponto ser salvo. */
  atual: boolean;
}

/** Quantos alunos fazem prova em um lugar: distintos, somando todas as provas do ponto. */
export interface OcupacaoDoLocal {
  alunos: number;
  provas: ProvaNoLocal[];
}

const RAIO_DA_TERRA_METROS = 6_371_008.8;

function emRadianos(graus: number): number {
  return (graus * Math.PI) / 180;
}

/** Caixa em graus que pré-filtra as provas antes da distância exata. */
export interface CaixaGeografica {
  latitude: { gte: number; lte: number };
  longitude: { gte: number; lte: number };
}

/** Metros por grau de latitude, com folga de 50% sobre o raio. */
export function caixaDeBusca(ponto: PontoGeografico, raioMetros: number): CaixaGeografica {
  const margemEmGraus = (raioMetros / 111_320) * 1.5;
  const margemEmLongitude =
    margemEmGraus / Math.max(Math.cos((ponto.latitude * Math.PI) / 180), 0.05);
  return {
    latitude: { gte: ponto.latitude - margemEmGraus, lte: ponto.latitude + margemEmGraus },
    longitude: {
      gte: ponto.longitude - margemEmLongitude,
      lte: ponto.longitude + margemEmLongitude,
    },
  };
}

/** Distância entre dois pontos pela fórmula de haversine, em metros. */
export function distanciaEmMetros(a: PontoGeografico, b: PontoGeografico): number {
  const dLat = emRadianos(b.latitude - a.latitude);
  const dLon = emRadianos(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(emRadianos(a.latitude)) * Math.cos(emRadianos(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_DA_TERRA_METROS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Número do selo sobre o marcador; passa de 999 vira "999+" para o selo não crescer sem fim. */
export function rotuloDaContagem(alunos: number): string {
  return alunos > 999 ? "999+" : String(alunos);
}

function plural(quantidade: number, singular: string, pluralDoTermo: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralDoTermo}`;
}

/** Frase de apoio ao selo do mapa, para quem não enxerga o selo e para conferir a conta. */
export function resumoDaOcupacao(ocupacao: OcupacaoDoLocal): string {
  if (ocupacao.alunos === 0) return "Nenhum aluno inscrito em provas neste local.";
  return `Neste local: ${plural(ocupacao.alunos, "aluno", "alunos")} em ${plural(ocupacao.provas.length, "prova", "provas")}.`;
}

/** Atualiza a marca de um aluno e recalcula os contadores, sem tocar nos demais. */
export function comMarca(
  detalhe: DetalheDaProva,
  alunoId: string,
  marca: MarcaDaProva,
): DetalheDaProva {
  const participantes = detalhe.participantes.map((item) =>
    item.alunoId === alunoId ? { ...item, presente: marca } : item,
  );
  const contagem = resumirMarcas(participantes.map((item) => item.presente));
  return {
    prova: { ...detalhe.prova, presentes: contagem.presentes, ausentes: contagem.ausentes },
    participantes,
  };
}
