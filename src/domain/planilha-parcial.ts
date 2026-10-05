// Planejamento conservador da chamada parcial, preservando registros da planilha.
import {
  rotuloFrequenciaPersonalizada,
  type RegistroPersonalizado,
} from "./frequencia-personalizada";
import { normalizar, rotuloData } from "./frequencia";
import { assinarAba, dataDoRotulo, hashTexto, type LeituraAba } from "./planilha";

export const ABA_PARCIAL = "Chamada Parcial";
export const CABECALHO_PARCIAL = [
  "Data",
  "Aluno",
  "Turma",
  "Frequência parcial",
  "Registrado na Seduc",
  "Confirmação Seduc",
  "Observação",
  "Código",
  "Revisão",
];

function codigoDaFrequencia(frequencia: RegistroPersonalizado): string {
  return `chamada:${frequencia.alunoId}:${frequencia.dia}`;
}

function codigosDaFrequencia(frequencia: RegistroPersonalizado): string[] {
  return [...new Set([codigoDaFrequencia(frequencia), frequencia.id])];
}

function valoresDaFrequencia(
  frequencia: RegistroPersonalizado,
  codigo = codigoDaFrequencia(frequencia),
): string[] {
  const parcial =
    frequencia.tipo === "AULAS"
      ? `Aulas ${[...frequencia.aulas].sort((a, b) => a - b).join(", ")}`
      : rotuloFrequenciaPersonalizada(frequencia);
  return [
    rotuloData(frequencia.dia),
    frequencia.alunoNome,
    frequencia.turmaNome,
    parcial,
    frequencia.registradoSeduc ? "Sim" : "Não",
    frequencia.registradoSeducEm ?? "",
    frequencia.tipo === "CHAMADA" ? "" : (frequencia.observacao ?? ""),
    codigo,
    frequencia.tipo === "CHAMADA"
      ? `chamada:${frequencia.revisao}:seduc:${frequencia.revisaoSeduc}`
      : String(frequencia.revisao),
  ];
}

export function planejarParciais(
  frequencias: RegistroPersonalizado[],
  leitura: LeituraAba,
  mesclagens: string[],
  atualizarExistentes = false,
) {
  const largura = [...leitura.valores, ...leitura.formula].reduce(
    (maior, linha) => Math.max(maior, linha.length),
    CABECALHO_PARCIAL.length,
  );
  const cabecalho = Array.from(
    { length: largura },
    (_, indice) => leitura.valores[0]?.[indice] ?? "",
  );
  const assinatura = assinarAba(ABA_PARCIAL, cabecalho, mesclagens);
  const criar: { linha: number; nome: string; celulas: { coluna: number; valor: string }[] }[] = [];
  const atualizar: {
    linha: number;
    nome: string;
    codigo: string;
    anteriores: string[];
    celulas: { coluna: number; valor: string }[];
  }[] = [];
  const avisos: string[] = [];
  let bloqueado =
    leitura.nome !== ABA_PARCIAL ||
    leitura.linhaInicial !== 1 ||
    leitura.colunaInicial !== 1 ||
    mesclagens.length > 0 ||
    CABECALHO_PARCIAL.some(
      (rotulo, indice) => normalizar(cabecalho[indice] ?? "") !== normalizar(rotulo),
    ) ||
    leitura.formula[0]?.some(Boolean) === true;
  if (bloqueado)
    avisos.push(
      "A aba Chamada Parcial precisa do cabeçalho padrão, sem fórmulas ou mesclagens. Confira a planilha antes de enviar.",
    );

  const porCodigo = new Map<string, number[]>();
  const manuais = new Set<string>();
  const legadosSemOrigem = new Set<string>();
  const codigosConhecidos = new Set(frequencias.flatMap(codigosDaFrequencia));
  const anos = new Set(frequencias.map((frequencia) => Number(frequencia.dia.slice(0, 4))));
  // Fórmulas com resultado vazio e anotações além das colunas do registro reservam linhas.
  let ultimaLinha = Math.max(1, leitura.ultimaLinhaAba ?? 1);
  for (
    let indice = 0;
    indice < Math.max(leitura.valores.length, leitura.formula.length);
    indice++
  ) {
    const valores = leitura.valores[indice] ?? [];
    if (valores.some((valor) => valor !== "") || leitura.formula[indice]?.some(Boolean))
      ultimaLinha = Math.max(ultimaLinha, indice + 1);
    if (indice === 0) continue;
    const codigo = valores[7]?.trim();
    if (codigo) porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), indice]);
    // Um ajuste excluído perde seu vínculo com o aluno; o nome pode ter mudado.
    if ((!codigo || !codigosConhecidos.has(codigo)) && valores[0]?.trim())
      for (const ano of anos) {
        const dia = dataDoRotulo(valores[0], ano);
        if (!dia) continue;
        if (valores[1]?.trim()) manuais.add(`${dia}|${normalizar(valores[1])}`);
        if (
          codigo &&
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(codigo) &&
          valores[2]?.trim()
        )
          legadosSemOrigem.add(`${dia}|${normalizar(valores[2])}`);
      }
  }

  let existentes = 0;
  let divergentes = 0;
  let pendentesManuais = 0;
  let conflitoBloqueante = false;
  const linhasDaIntegracao = new Set(leitura.linhasCriadas ?? []);
  const codigosDaOrigem = new Map<string, number>();
  for (const frequencia of frequencias)
    for (const codigo of codigosDaFrequencia(frequencia))
      codigosDaOrigem.set(codigo, (codigosDaOrigem.get(codigo) ?? 0) + 1);
  if (!bloqueado)
    for (const frequencia of [...frequencias].sort(
      (a, b) => a.dia.localeCompare(b.dia) || a.id.localeCompare(b.id),
    )) {
      const codigos = codigosDaFrequencia(frequencia);
      if (codigos.some((codigo) => (codigosDaOrigem.get(codigo) ?? 0) > 1)) {
        divergentes++;
        conflitoBloqueante = true;
        avisos.push("Há um código repetido nos registros do aplicativo. Confira antes de enviar.");
        continue;
      }
      const linhas = [...new Set(codigos.flatMap((codigo) => porCodigo.get(codigo) ?? []))];
      if (linhas.length > 0) {
        existentes++;
        const indiceLinha = linhas[0] ?? -1;
        const atual = leitura.valores[indiceLinha];
        const formulaNoRegistro = leitura.formula[indiceLinha]
          ?.slice(0, CABECALHO_PARCIAL.length)
          .some(Boolean);
        const codigo = atual?.[7] ?? "";
        if (linhas.length > 1 || formulaNoRegistro || !codigos.includes(codigo)) {
          divergentes++;
          conflitoBloqueante = true;
          avisos.push(
            "Há um registro já enviado com fórmula, código alterado ou repetido. Confira a planilha antes de enviar; o conteúdo existente foi preservado.",
          );
          continue;
        }
        // Não reescreve o identificador das linhas legadas reconhecidas pelo UUID.
        const valores = valoresDaFrequencia(frequencia, codigo);
        const anteriores = CABECALHO_PARCIAL.map((_, indice) => atual?.[indice] ?? "");
        const celulas = valores.flatMap((valor, indice) =>
          anteriores[indice] === valor ? [] : [{ coluna: indice + 1, valor }],
        );
        if (celulas.length > 0) {
          divergentes++;
          const linha = indiceLinha + 1;
          if (!linhasDaIntegracao.has(linha)) {
            conflitoBloqueante = true;
            avisos.push(
              "Há um registro com dados diferentes sem marca de criação pela integração. Confira a planilha antes de enviar; o conteúdo existente foi preservado.",
            );
          } else if (!atualizarExistentes) {
            conflitoBloqueante = true;
            avisos.push(
              "Há alterações em registros já enviados. Confirme a atualização das linhas criadas pela integração na prévia antes de enviar.",
            );
          } else {
            atualizar.push({
              linha,
              nome: frequencia.alunoNome,
              codigo,
              anteriores,
              celulas,
            });
          }
        }
        continue;
      }
      if (manuais.has(`${frequencia.dia}|${normalizar(frequencia.alunoNome)}`)) {
        pendentesManuais++;
        avisos.push(
          "Há um registro manual ou com código não reconhecido para o mesmo nome e data. Confira esse registro antes de enviar; nenhuma linha foi acrescentada para ele.",
        );
        continue;
      }
      if (legadosSemOrigem.has(`${frequencia.dia}|${normalizar(frequencia.turmaNome)}`)) {
        pendentesManuais++;
        avisos.push(
          "Há um registro antigo sem correspondência no aplicativo para essa turma e data. Confira esse registro antes de acrescentar novas linhas; o conteúdo existente foi preservado.",
        );
        continue;
      }
      criar.push({
        linha: ++ultimaLinha,
        nome: frequencia.alunoNome,
        celulas: valoresDaFrequencia(frequencia).map((valor, indice) => ({
          coluna: indice + 1,
          valor,
        })),
      });
    }
  // Uma prévia com conflito exige conferência antes de qualquer escrita.
  if (conflitoBloqueante) {
    bloqueado = true;
    criar.length = 0;
    atualizar.length = 0;
  }
  return {
    aba: ABA_PARCIAL,
    assinatura,
    bloqueado,
    criar,
    atualizar,
    existentes,
    divergentes,
    pendentesManuais,
    avisos: [...new Set(avisos)],
    planoHash: hashTexto(
      JSON.stringify({ frequencias, leitura, mesclagens, atualizarExistentes, criar, atualizar }),
    ),
  };
}
