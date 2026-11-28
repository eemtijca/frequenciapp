// Provas específicas (Enem, vestibulares e similares): regras puras de cadastro e de frequência, compartilhadas com a interface.
import { ehDiaValido, normalizar } from "@/domain/frequencia";

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

/** Local gravado: texto e ponto no mapa, cada um opcional. */
export interface LocalGravado {
  local: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Local que a tela mostra: o próprio ou o herdado da prova. */
export interface LocalResolvido extends LocalGravado {
  /** Verdadeiro quando o aluno tem local ou ponto próprio. */
  proprio: boolean;
}

export interface ParticipanteDaProva extends LocalGravado {
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

/**
 * Apara o local e arredonda as coordenadas de um aluno. O texto vazio vira nulo,
 * o que significa herdar o local da prova.
 */
export function normalizarLocalDoAluno(dados: {
  local?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): LocalGravado {
  const local = (dados.local ?? "").trim();
  return {
    local: local === "" ? null : local,
    latitude: arredondar(dados.latitude),
    longitude: arredondar(dados.longitude),
  };
}

/**
 * Confere o local próprio de um aluno. Nulo nas três partes é válido e herda a prova.
 * Ponto sem nome é recusado, para o mapa não apontar um lugar que a lista chama de outro.
 */
export function problemaNoLocalDoAluno(local: LocalGravado): string | null {
  if (local.local !== null && local.local.length > LIMITE_LOCAL_PROVA_ESPECIFICA) {
    return `O local deve ter no máximo ${LIMITE_LOCAL_PROVA_ESPECIFICA} caracteres.`;
  }
  const coordenadas = problemaNasCoordenadas(local.latitude, local.longitude);
  if (coordenadas) return coordenadas;
  if (local.local === null && (local.latitude !== null || local.longitude !== null)) {
    return "Informe o nome do local junto com o ponto no mapa.";
  }
  return null;
}

/** Local exibido: o próprio, quando houver; senão o da prova, inclusive o ponto. */
export function resolverLocalDoAluno(aluno: LocalGravado, prova: LocalGravado): LocalResolvido {
  const proprio = aluno.local !== null || aluno.latitude !== null || aluno.longitude !== null;
  if (!proprio) {
    return {
      local: prova.local,
      latitude: prova.latitude,
      longitude: prova.longitude,
      proprio: false,
    };
  }
  return {
    local: aluno.local,
    latitude: aluno.latitude,
    longitude: aluno.longitude,
    proprio: true,
  };
}

/**
 * Ponto usado na contagem do mapa. Coordenadas próprias vencem. Texto próprio sem ponto
 * não herda o ponto da prova. Sem nada próprio, usa o ponto herdado (prova em edição)
 * ou o ponto já gravado na prova.
 */
export function pontoEfetivoDoAluno(
  aluno: LocalGravado,
  prova: Pick<LocalGravado, "latitude" | "longitude">,
  pontoHerdado: PontoGeografico | null,
): PontoGeografico | null {
  if (aluno.latitude !== null || aluno.longitude !== null) {
    if (aluno.latitude !== null && aluno.longitude !== null) {
      return { latitude: aluno.latitude, longitude: aluno.longitude };
    }
    return null;
  }
  if (aluno.local !== null) return null;
  if (pontoHerdado) return pontoHerdado;
  if (prova.latitude !== null && prova.longitude !== null) {
    return { latitude: prova.latitude, longitude: prova.longitude };
  }
  return null;
}

/** Prova candidata à ocupação de um ponto, com o que cada aluno gravou. */
export interface ProvaParaOcupacao {
  id: string;
  nome: string;
  /** Data civil YYYY-MM-DD. */
  dia: string;
  latitude: number | null;
  longitude: number | null;
  participantes: readonly (LocalGravado & { alunoId: string })[];
  /** Verdadeiro para a prova cujo ponto novo ainda pode não estar salvo. */
  emEdicao: boolean;
  /** Ponto consultado, usado só por quem herda o local dessa prova em edição. */
  pontoHerdado: PontoGeografico | null;
}

/**
 * Ocupação de um ponto a partir dos locais efetivos. Quem está em duas provas conta uma vez.
 * A prova em edição entra na lista mesmo sem aluno naquele ponto, para a conta aparecer.
 */
export function ocupacaoDasProvas(
  ponto: PontoGeografico,
  provas: readonly ProvaParaOcupacao[],
): OcupacaoDoLocal {
  const distintos = new Set<string>();
  const saida: ProvaNoLocal[] = [];
  const ordenadas = [...provas].sort(
    (a, b) => b.dia.localeCompare(a.dia) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  for (const prova of ordenadas) {
    let alunos = 0;
    for (const participante of prova.participantes) {
      const efetivo = pontoEfetivoDoAluno(participante, prova, prova.pontoHerdado);
      if (!efetivo) continue;
      if (distanciaEmMetros(ponto, efetivo) > RAIO_DO_MESMO_LOCAL_METROS) continue;
      alunos += 1;
      distintos.add(participante.alunoId);
    }
    if (alunos === 0 && !prova.emEdicao) continue;
    saida.push({
      id: prova.id,
      nome: prova.nome,
      dia: prova.dia,
      alunos,
      atual: prova.emEdicao,
    });
  }
  return { alunos: distintos.size, provas: saida };
}

/** Comparecimento dos alunos que compartilham o mesmo local efetivo. */
export interface GrupoDeLocal {
  /** Texto normalizado, vazio quando não há local. */
  chave: string;
  local: string | null;
  total: number;
  presentes: number;
  ausentes: number;
  pendentes: number;
}

/** Chave do agrupamento: sem acento, sem caixa e com espaços repetidos reduzidos. */
export function chaveDoGrupoDeLocal(local: string | null): string {
  return normalizar(local ?? "").replace(/\s+/g, " ");
}

/** Agrupa os alunos pelo local efetivo e conta presente, ausente e sem registro. */
export function agruparPorLocal(
  participantes: readonly ParticipanteDaProva[],
  prova: LocalGravado,
): GrupoDeLocal[] {
  const grupos = new Map<string, GrupoDeLocal>();
  for (const participante of participantes) {
    const resolvido = resolverLocalDoAluno(participante, prova);
    const chave = chaveDoGrupoDeLocal(resolvido.local);
    const grupo = grupos.get(chave) ?? {
      chave,
      local: resolvido.local,
      total: 0,
      presentes: 0,
      ausentes: 0,
      pendentes: 0,
    };
    if (grupo.local === null && resolvido.local !== null) grupo.local = resolvido.local;
    grupo.total += 1;
    if (participante.presente === true) grupo.presentes += 1;
    else if (participante.presente === false) grupo.ausentes += 1;
    else grupo.pendentes += 1;
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].sort((a, b) => {
    if (a.local === null && b.local === null) return 0;
    if (a.local === null) return 1;
    if (b.local === null) return -1;
    return a.local.localeCompare(b.local, "pt-BR");
  });
}

/** Linha da lista colada que não foi aplicada. */
export interface LocalRecusado {
  /** Número da linha no texto, começando em 1. */
  linha: number;
  nome: string;
  motivo: string;
}

/** Nomes que casaram com um único aluno inscrito e o local a gravar. */
export interface CasamentoDeLocais {
  casados: Array<{ alunoId: string; nome: string; local: string }>;
  recusados: LocalRecusado[];
}

/** Tamanho máximo do texto colado, para uma lista da escola inteira caber sem arquivo enorme. */
export const LIMITE_TEXTO_LOCAIS_COLADOS = 200_000;

const CABECALHOS_DE_NOME = new Set(["nome", "aluno", "nome do aluno"]);

function chaveDoNome(nome: string): string {
  return normalizar(nome).replace(/\s+/g, " ");
}

/** Separa nome e local no primeiro tab, na primeira barra vertical ou no primeiro ponto e vírgula. */
function separarNomeELocal(linha: string): { nome: string; local: string } | null {
  for (const separador of ["\t", "|", ";"] as const) {
    const indice = linha.indexOf(separador);
    if (indice === -1) continue;
    return {
      nome: linha.slice(0, indice).trim(),
      local: linha.slice(indice + separador.length).trim(),
    };
  }
  return null;
}

/**
 * Casa uma lista colada (nome e local) com os alunos já inscritos. Não cria aluno,
 * não altera frequência e não aplica linha sem par, nome ambíguo ou local divergente.
 * O casamento ignora acento, caixa e espaços repetidos. Cabeçalho "nome" e "local" é ignorado.
 */
export function casarLocaisColados(
  texto: string,
  alunos: readonly { alunoId: string; nome: string }[],
): CasamentoDeLocais {
  if (texto.length > LIMITE_TEXTO_LOCAIS_COLADOS) {
    return {
      casados: [],
      recusados: [{ linha: 1, nome: "", motivo: "A lista é grande demais para conferir." }],
    };
  }
  const linhas = texto.split(/\r?\n/);
  const preenchidas = linhas.filter((linha) => linha.trim() !== "");
  if (preenchidas.length > LIMITE_PARTICIPANTES_PROVA) {
    return {
      casados: [],
      recusados: [
        {
          linha: 1,
          nome: "",
          motivo: `A lista passa de ${LIMITE_PARTICIPANTES_PROVA} linhas.`,
        },
      ],
    };
  }

  const recusados: LocalRecusado[] = [];
  const lidas: Array<{ linha: number; nome: string; local: string; chave: string }> = [];
  linhas.forEach((bruta, indice) => {
    const linha = indice + 1;
    if (bruta.trim() === "") return;
    const partes = separarNomeELocal(bruta);
    if (!partes) {
      recusados.push({
        linha,
        nome: bruta.trim().slice(0, LIMITE_NOME_PROVA_ESPECIFICA),
        motivo:
          "Informe o nome e o local separados por tabulação, ponto e vírgula ou barra vertical.",
      });
      return;
    }
    if (CABECALHOS_DE_NOME.has(chaveDoNome(partes.nome)) && chaveDoNome(partes.local) === "local") {
      return;
    }
    if (partes.nome === "") {
      recusados.push({ linha, nome: "", motivo: "Informe o nome do aluno." });
      return;
    }
    if (partes.local === "") {
      recusados.push({ linha, nome: partes.nome, motivo: "Informe o local." });
      return;
    }
    if (partes.local.length > LIMITE_LOCAL_PROVA_ESPECIFICA) {
      recusados.push({
        linha,
        nome: partes.nome,
        motivo: `O local deve ter no máximo ${LIMITE_LOCAL_PROVA_ESPECIFICA} caracteres.`,
      });
      return;
    }
    lidas.push({ linha, nome: partes.nome, local: partes.local, chave: chaveDoNome(partes.nome) });
  });

  const alunosPorNome = new Map<string, Array<{ alunoId: string; nome: string }>>();
  for (const aluno of alunos) {
    const chave = chaveDoNome(aluno.nome);
    const grupo = alunosPorNome.get(chave) ?? [];
    grupo.push(aluno);
    alunosPorNome.set(chave, grupo);
  }

  const porNome = new Map<string, typeof lidas>();
  for (const lida of lidas) {
    const grupo = porNome.get(lida.chave) ?? [];
    grupo.push(lida);
    porNome.set(lida.chave, grupo);
  }

  const casados: CasamentoDeLocais["casados"] = [];
  for (const [chave, grupo] of porNome) {
    const daProva = alunosPorNome.get(chave) ?? [];
    if (daProva.length === 0) {
      for (const linha of grupo) {
        recusados.push({
          linha: linha.linha,
          nome: linha.nome,
          motivo: "Não há aluno com esse nome nesta prova.",
        });
      }
      continue;
    }
    if (daProva.length > 1) {
      for (const linha of grupo) {
        recusados.push({
          linha: linha.linha,
          nome: linha.nome,
          motivo: "Há mais de um aluno com esse nome nesta prova.",
        });
      }
      continue;
    }
    const locais = new Set(grupo.map((linha) => linha.local));
    if (locais.size > 1) {
      for (const linha of grupo) {
        recusados.push({
          linha: linha.linha,
          nome: linha.nome,
          motivo: "O nome aparece mais de uma vez com locais diferentes.",
        });
      }
      continue;
    }
    const aluno = daProva[0];
    const local = grupo[0]?.local;
    if (!aluno || local === undefined) continue;
    casados.push({ alunoId: aluno.alunoId, nome: aluno.nome, local });
  }

  casados.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  recusados.sort((a, b) => a.linha - b.linha || a.nome.localeCompare(b.nome, "pt-BR"));
  return { casados, recusados };
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
