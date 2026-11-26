// Desenho do relatório da Grade em PDF no navegador, a partir do retrato
// imutável devolvido pelo servidor. As bibliotecas entram sob demanda.
import type { jsPDF } from "jspdf";
import type { CellHookData, UserOptions } from "jspdf-autotable";
import type {
  AlunoRelatorioGrade,
  OcorrenciaGrade,
  RelatorioGrade,
  RetratoGrade,
} from "@/domain/relatorio-grade";
import { rotuloData } from "@/domain/frequencia";

const LARGURA_A4 = 210;
const ALTURA_A4 = 297;
const MARGEM_LATERAL = 14;
const MARGEM_CONTEUDO_TOPO = 46;
const MARGEM_CONTEUDO_RODAPE = 18;
const LARGURA_CONTEUDO = LARGURA_A4 - MARGEM_LATERAL * 2;

const COR_TEXTO: [number, number, number] = [31, 41, 51];
const COR_SECUNDARIA: [number, number, number] = [90, 103, 117];
const COR_CABECALHO: [number, number, number] = [238, 241, 244];
const COR_LINHA: [number, number, number] = [207, 214, 222];
const COR_FALTA: [number, number, number] = [179, 38, 30];
const COR_JUSTIFICADA: [number, number, number] = [138, 90, 0];
const COR_PARCIAL: [number, number, number] = [74, 85, 104];

interface DocComAutoTable extends jsPDF {
  lastAutoTable?: { finalY?: number };
}

interface OpcoesDesenho {
  relatorio: RelatorioGrade;
  retrato: RetratoGrade["retrato"];
  autoTable: (doc: jsPDF, opcoes: UserOptions) => void;
}

function ultimaPosicao(doc: jsPDF): number {
  return (doc as DocComAutoTable).lastAutoTable?.finalY ?? MARGEM_CONTEUDO_TOPO;
}

function rotuloPeriodo(de: string, ate: string): string {
  if (!de && !ate) return "Período não informado";
  if (de === ate) return rotuloData(de);
  return `${rotuloData(de)} a ${rotuloData(ate)}`;
}

function textoAulas(ocorrencia: OcorrenciaGrade): string {
  const previstas = ocorrencia.aulasPrevistas;
  const faltadas = ocorrencia.aulasFaltadas;
  if (previstas === null) return "Aulas não informadas";
  if (faltadas === previstas) return `Todas as aulas (${previstas})`;
  if (faltadas > previstas) {
    return `${faltadas} aulas (${previstas} previstas, inclui aula fora da grade)`;
  }
  const base = `${faltadas} de ${previstas}`;
  const rotulos =
    ocorrencia.aulasFaltadasRotulos.length > 0
      ? `: ${ocorrencia.aulasFaltadasRotulos.join("; ")}`
      : "";
  const referencia = ocorrencia.referenciaAulas === "grade_atual" ? " (grade atual)" : "";
  return `${base}${rotulos}${referencia}`;
}

function textoJustificativa(ocorrencia: OcorrenciaGrade): string {
  const rotulos = ocorrencia.justificativas.join(", ");
  if (ocorrencia.marca === "FJ") {
    return rotulos ? `Justificativa: ${rotulos}` : "Justificativa não detalhada";
  }
  if (rotulos) return `Justificativa em parte das aulas: ${rotulos}`;
  return "Sem justificativa";
}

function situacaoDaMarca(marca: OcorrenciaGrade["marca"]): string {
  if (marca === "FJ") return "Falta justificada";
  if (marca === "S") return "Presença parcial";
  return "Falta";
}

function alunoComIndicacao(aluno: AlunoRelatorioGrade): string {
  return aluno.desistente ? `${aluno.nome} (desistente)` : aluno.nome;
}

function desenharCabecalho(
  doc: jsPDF,
  relatorio: RelatorioGrade,
  retrato: RetratoGrade["retrato"],
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COR_SECUNDARIA);
  doc.text("FrequenciApp", MARGEM_LATERAL, 14);

  doc.setFontSize(16);
  doc.setTextColor(...COR_TEXTO);
  doc.text("Relatório de frequência", MARGEM_LATERAL, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COR_SECUNDARIA);
  const linhas = [
    `Turma de origem: ${relatorio.turmaOriginal}`,
    `Período: ${rotuloPeriodo(relatorio.de, relatorio.ate)}`,
    `Alunos: ${relatorio.totais.alunos}`,
    `Retrato: ${retrato.emTexto}`,
    `Código: ${retrato.hash.slice(0, 12)}`,
  ];
  const largura = 92;
  let y = 14;
  for (const linha of linhas) {
    const partes = doc.splitTextToSize(linha, largura) as string[];
    for (const parte of partes) {
      doc.text(parte, LARGURA_A4 - MARGEM_LATERAL, y, { align: "right" });
      y += 4;
    }
  }

  doc.setDrawColor(...COR_LINHA);
  doc.setLineWidth(0.3);
  doc.line(MARGEM_LATERAL, 38, LARGURA_A4 - MARGEM_LATERAL, 38);
}

function desenharCabecalhoERodape(
  doc: jsPDF,
  relatorio: RelatorioGrade,
  retrato: RetratoGrade["retrato"],
): void {
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    desenharCabecalho(doc, relatorio, retrato);
    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.3);
    doc.line(MARGEM_LATERAL, 282, LARGURA_A4 - MARGEM_LATERAL, 282);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COR_SECUNDARIA);
    doc.text(`Página ${pagina} de ${total}`, MARGEM_LATERAL, 288);
    doc.setFontSize(6.5);
    doc.text(`FrequenciApp · ${retrato.hash}`, LARGURA_A4 - MARGEM_LATERAL, 288, {
      align: "right",
    });
  }
}

function desenharResumo(doc: jsPDF, opcoes: OpcoesDesenho): number {
  const { relatorio, autoTable } = opcoes;
  if (relatorio.alunos.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COR_TEXTO);
    doc.text("Sem alunos ativos nesta turma de origem.", MARGEM_LATERAL, MARGEM_CONTEUDO_TOPO);
    return MARGEM_CONTEUDO_TOPO + 10;
  }
  const totalHistorico = relatorio.alunos.reduce((soma, aluno) => soma + aluno.totalHistorico, 0);
  autoTable(doc, {
    startY: MARGEM_CONTEUDO_TOPO,
    margin: {
      top: MARGEM_CONTEUDO_TOPO,
      bottom: MARGEM_CONTEUDO_RODAPE,
      left: MARGEM_LATERAL,
      right: MARGEM_LATERAL,
    },
    tableWidth: LARGURA_CONTEUDO,
    theme: "grid",
    head: [["Aluno", "Turma atual", "F", "FJ", "S", "Dias", "Histórico"]],
    body: relatorio.alunos.map((aluno) => [
      alunoComIndicacao(aluno),
      aluno.turmaAtual,
      String(aluno.faltas),
      String(aluno.justificadas),
      String(aluno.parciais),
      String(aluno.diasComRegistro),
      String(aluno.totalHistorico),
    ]),
    foot: [
      [
        "Total da turma",
        `${relatorio.totais.alunos} alunos`,
        String(relatorio.totais.faltas),
        String(relatorio.totais.justificadas),
        String(relatorio.totais.parciais),
        "",
        String(totalHistorico),
      ],
    ],
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: COR_TEXTO,
      lineColor: COR_LINHA,
      lineWidth: 0.2,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: COR_CABECALHO,
      textColor: COR_TEXTO,
      fontStyle: "bold",
      halign: "center",
    },
    footStyles: {
      fillColor: COR_CABECALHO,
      textColor: COR_TEXTO,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles: {
      0: { cellWidth: 72, halign: "left" },
      1: { cellWidth: 36, halign: "left" },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: 24, halign: "center" },
    },
  });
  return ultimaPosicao(doc) + 6;
}

function desenharDetalhe(doc: jsPDF, opcoes: OpcoesDesenho, inicio: number): number {
  const { relatorio, autoTable } = opcoes;
  let y = inicio;
  if (y + 16 > ALTURA_A4 - MARGEM_CONTEUDO_RODAPE) {
    doc.addPage();
    y = MARGEM_CONTEUDO_TOPO;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COR_TEXTO);
  doc.text("Detalhamento das faltas", MARGEM_LATERAL, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COR_SECUNDARIA);
  doc.text("Somente dias com falta ou presença parcial.", MARGEM_LATERAL, y);
  y += 8;

  let encontrou = false;
  for (const aluno of relatorio.alunos) {
    if (aluno.ocorrencias.length === 0) continue;
    encontrou = true;
    if (y + 30 > ALTURA_A4 - MARGEM_CONTEUDO_RODAPE) {
      doc.addPage();
      y = MARGEM_CONTEUDO_TOPO;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...COR_TEXTO);
    doc.text(alunoComIndicacao(aluno), MARGEM_LATERAL, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COR_SECUNDARIA);
    doc.text(`Turma atual: ${aluno.turmaAtual}`, MARGEM_LATERAL, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: {
        top: MARGEM_CONTEUDO_TOPO,
        bottom: MARGEM_CONTEUDO_RODAPE,
        left: MARGEM_LATERAL,
        right: MARGEM_LATERAL,
      },
      tableWidth: LARGURA_CONTEUDO,
      theme: "grid",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      head: [["Dia", "Situação", "Aulas", "Justificativa"]],
      body: aluno.ocorrencias.map((ocorrencia) => [
        rotuloData(ocorrencia.dia),
        situacaoDaMarca(ocorrencia.marca),
        textoAulas(ocorrencia),
        textoJustificativa(ocorrencia),
      ]),
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 1.5,
        textColor: COR_TEXTO,
        lineColor: COR_LINHA,
        lineWidth: 0.2,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: {
        fillColor: COR_CABECALHO,
        textColor: COR_TEXTO,
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: { fillColor: [250, 251, 252] },
      columnStyles: {
        0: { cellWidth: 22, halign: "left" },
        1: { cellWidth: 32, halign: "left" },
        2: { cellWidth: 76, halign: "left" },
        3: { cellWidth: 52, halign: "left" },
      },
      didParseCell: (dados: CellHookData) => {
        if (dados.section !== "body" || dados.column.index !== 1) return;
        const texto = dados.cell.text.join(" ");
        if (texto === "Falta") dados.cell.styles.textColor = COR_FALTA;
        if (texto === "Falta justificada") dados.cell.styles.textColor = COR_JUSTIFICADA;
        if (texto === "Presença parcial") dados.cell.styles.textColor = COR_PARCIAL;
      },
    });
    y = ultimaPosicao(doc) + 7;
  }
  if (!encontrou) {
    if (y + 10 > ALTURA_A4 - MARGEM_CONTEUDO_RODAPE) {
      doc.addPage();
      y = MARGEM_CONTEUDO_TOPO;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COR_TEXTO);
    doc.text("Nenhuma falta no período.", MARGEM_LATERAL, y);
    y += 8;
  }
  return y;
}

/** Gera o PDF a partir do modelo imutável do servidor. */
export async function gerarRelatorioGradePdf(
  relatorio: RelatorioGrade,
  retrato: RetratoGrade["retrato"],
): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setProperties({
    title: "Relatório de frequência",
    subject: `Retrato ${retrato.hash}`,
    creator: "FrequenciApp",
  });
  const opcoes: OpcoesDesenho = {
    relatorio,
    retrato,
    autoTable: (documento, opcoesTabela) => autoTable(documento, opcoesTabela),
  };
  const depoisResumo = desenharResumo(doc, opcoes);
  desenharDetalhe(doc, opcoes, depoisResumo);
  desenharCabecalhoERodape(doc, relatorio, retrato);
  return doc.output("blob");
}
