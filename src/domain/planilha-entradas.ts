// Plano conservador da aba de entradas, identificado pelo código do registro.
import type { EntradaAtrasada } from "./entradas";
import { assinarAba, hashTexto, type LeituraAba } from "./planilha";
import { normalizar, rotuloData } from "./frequencia";

export const ABA_ENTRADAS = "Entradas";
export const CABECALHO_ENTRADAS = [
  "Data",
  "Aluno",
  "Turma",
  "Horário",
  "Motivo",
  "Registrado por",
  "Código",
];

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
  const bloqueado =
    leitura.nome !== ABA_ENTRADAS ||
    leitura.linhaInicial !== 1 ||
    leitura.colunaInicial !== 1 ||
    mesclagens.length > 0 ||
    CABECALHO_ENTRADAS.some(
      (rotulo, indice) => normalizar(cabecalho[indice] ?? "") !== normalizar(rotulo),
    ) ||
    leitura.formula[0]?.some(Boolean) === true;
  if (bloqueado)
    avisos.push(
      "A aba Entradas precisa do cabeçalho padrão, sem fórmulas ou mesclagens. Confira a planilha antes de enviar.",
    );
  // A leitura abrange todas as colunas: conteúdo e fórmulas no fim da aba
  // também reservam linhas, mesmo quando não são registros de entrada.
  let ultimaLinha = 1;
  const porCodigo = new Map<string, number[]>();
  const porNomeDia = new Set<string>();
  leitura.valores.forEach((valores, indice) => {
    if (valores.some((valor) => valor !== "") || leitura.formula[indice]?.some(Boolean))
      ultimaLinha = indice + 1;
    if (indice === 0) return;
    const codigo = valores[6]?.trim();
    if (codigo) porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), indice]);
    else if (valores[0] && valores[1]) porNomeDia.add(`${valores[0]}|${normalizar(valores[1])}`);
  });
  let existentes = 0;
  if (!bloqueado)
    for (const entrada of [...entradas].sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        a.horario.localeCompare(b.horario) ||
        a.id.localeCompare(b.id),
    )) {
      const valores = [
        rotuloData(entrada.dia),
        entrada.nome,
        entrada.turmaRotulo,
        entrada.horario,
        entrada.motivo,
        entrada.registradoPorNome,
        `${entrada.alunoId}:${entrada.dia}`,
      ];
      const linhas = porCodigo.get(`${entrada.alunoId}:${entrada.dia}`);
      if (linhas) {
        existentes += 1;
        const atual = leitura.valores[linhas[0] ?? -1];
        if (linhas.length > 1 || valores.some((valor, indice) => atual?.[indice] !== valor))
          avisos.push(
            "Há um registro já enviado com dados diferentes ou código repetido. O conteúdo existente foi preservado.",
          );
        continue;
      }
      if (porNomeDia.has(`${valores[0]}|${normalizar(entrada.nome)}`)) {
        avisos.push(
          "Há uma entrada manual com o mesmo nome e data, sem código. Confira esse registro antes de enviar; nenhuma linha foi acrescentada para ele.",
        );
        continue;
      }
      criar.push({
        linha: ++ultimaLinha,
        nome: entrada.nome,
        celulas: valores.map((valor, indice) => ({ coluna: indice + 1, valor })),
      });
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
