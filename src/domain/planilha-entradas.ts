// Plano conservador da aba de entradas, com as mesmas colunas da aba de saídas.
import type { EntradaAtrasada } from "./entradas";
import { assinarAba, hashTexto, type LeituraAba } from "./planilha";
import { CABECALHO_SAIDAS } from "./planilha-saidas";
import { normalizar, rotuloData, rotuloMomento } from "./frequencia";

export const ABA_ENTRADAS = "Entradas";
/** As abas Entradas e de saídas têm as mesmas colunas e a mesma estrutura. */
export const CABECALHO_ENTRADAS = CABECALHO_SAIDAS;
/** Cabeçalho anterior da aba Entradas, realinhado ao preparar. */
export const CABECALHO_ENTRADAS_ANTERIOR = [
  "Data",
  "Aluno",
  "Turma",
  "Horário",
  "Motivo",
  "Registrado por",
  "Código",
];

function cabecalhoIgual(cabecalho: string[], padrao: string[]): boolean {
  return padrao.every(
    (rotulo, indice) => normalizar(cabecalho[indice] ?? "") === normalizar(rotulo),
  );
}

/** Reconhece o cabeçalho atual, o anterior (com Código) ou nenhum dos dois. */
export function formatoCabecalhoEntradas(cabecalho: string[]): "atual" | "anterior" | "outro" {
  if (cabecalhoIgual(cabecalho, CABECALHO_ENTRADAS)) return "atual";
  if (cabecalhoIgual(cabecalho, CABECALHO_ENTRADAS_ANTERIOR)) return "anterior";
  return "outro";
}

/** Linha de uma entrada na aba, na ordem do cabeçalho comum. */
export function valoresDaEntrada(entrada: EntradaAtrasada): string[] {
  return [
    rotuloData(entrada.dia),
    entrada.nome,
    entrada.turmaRotulo,
    entrada.momento ? `${entrada.horario} · ${rotuloMomento(entrada.momento)}` : entrada.horario,
    entrada.motivo,
    "",
    entrada.responsavelRegistroNome ?? entrada.registradoPorNome,
  ];
}

const chaveLinha = (dia: string, nome: string) => `${dia}|${normalizar(nome)}`;

export function planejarEntradas(
  entradas: EntradaAtrasada[],
  leitura: LeituraAba,
  mesclagens: string[],
) {
  const largura = leitura.valores.reduce((maior, linha) => Math.max(maior, linha.length), 1);
  const cabecalho = Array.from(
    { length: largura },
    (_, indice) => leitura.valores[0]?.[indice] ?? "",
  );
  const assinatura = assinarAba(ABA_ENTRADAS, cabecalho, mesclagens);
  const criar: { linha: number; nome: string; celulas: { coluna: number; valor: string }[] }[] = [];
  const avisos: string[] = [];
  const formato = formatoCabecalhoEntradas(cabecalho);
  const bloqueado =
    leitura.nome !== ABA_ENTRADAS ||
    leitura.linhaInicial !== 1 ||
    leitura.colunaInicial !== 1 ||
    mesclagens.length > 0 ||
    formato !== "atual" ||
    leitura.formula[0]?.some(Boolean) === true;
  if (bloqueado)
    avisos.push(
      formato === "anterior"
        ? "A aba Entradas está no formato anterior. Prepare a aba Entradas em Gestão, Configurações, Planilhas, para atualizar as colunas."
        : "A aba Entradas precisa do cabeçalho padrão, sem fórmulas ou mesclagens. Confira a planilha antes de enviar.",
    );
  // A leitura abrange todas as colunas: conteúdo e fórmulas no fim da aba
  // também reservam linhas, mesmo quando não são registros de entrada.
  let ultimaLinha = 1;
  const existentesPorChave = new Map<string, string[][]>();
  leitura.valores.forEach((valores, indice) => {
    if (valores.some((valor) => valor !== "") || leitura.formula[indice]?.some(Boolean))
      ultimaLinha = indice + 1;
    if (indice === 0 || !valores[0] || !valores[1]) return;
    const chave = chaveLinha(valores[0], valores[1]);
    existentesPorChave.set(chave, [...(existentesPorChave.get(chave) ?? []), valores]);
  });
  let existentes = 0;
  if (!bloqueado) {
    const usadas = new Map<string, number>();
    for (const entrada of [...entradas].sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        a.horario.localeCompare(b.horario) ||
        a.id.localeCompare(b.id),
    )) {
      const valores = valoresDaEntrada(entrada);
      const chave = chaveLinha(valores[0] ?? "", entrada.nome);
      // Cada linha da planilha cobre uma entrada; homônimos no mesmo dia usam uma linha cada.
      const posicao = usadas.get(chave) ?? 0;
      usadas.set(chave, posicao + 1);
      const atual = existentesPorChave.get(chave)?.[posicao];
      if (atual) {
        existentes += 1;
        if (valores.some((valor, indice) => valor !== "" && (atual[indice] ?? "") !== valor))
          avisos.push(
            "Há um registro já enviado com dados diferentes. O conteúdo existente foi preservado.",
          );
        continue;
      }
      criar.push({
        linha: ++ultimaLinha,
        nome: entrada.nome,
        celulas: valores.map((valor, indice) => ({ coluna: indice + 1, valor })),
      });
    }
  }
  return {
    aba: ABA_ENTRADAS,
    assinatura,
    bloqueado,
    criar,
    existentes,
    avisos: [...new Set(avisos)],
    planoHash: hashTexto(JSON.stringify({ entradas, leitura, mesclagens, criar })),
  };
}

/** O envio automático das entradas só acrescenta linhas; plano bloqueado fica para o manual. */
export function entradasEnviaveisSozinhas(plano: {
  bloqueado?: boolean;
  criar: unknown[];
}): boolean {
  return !plano.bloqueado && plano.criar.length > 0;
}
