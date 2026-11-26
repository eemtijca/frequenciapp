// PDF de texto com Helvetica e WinAnsi, sem biblioteca externa.
// Serve ao relatório da Grade: várias páginas, acentos do português e extração nos testes.

const LINHAS_POR_PAGINA = 48;
const MARGEM = 48;
const TOPO = 800;
const PASSO = 14;

/** Monta um PDF 1.4 só com linhas de texto. */
export function documentoPdf(linhas: readonly string[]): Uint8Array {
  const paginas: string[][] = [];
  for (let indice = 0; indice < linhas.length; indice += LINHAS_POR_PAGINA) {
    paginas.push(linhas.slice(indice, indice + LINHAS_POR_PAGINA));
  }
  if (paginas.length === 0) paginas.push([]);
  const objetos: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${paginas.map((_, indice) => `${4 + indice * 2} 0 R`).join(" ")}] /Count ${paginas.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  for (const [indice, pagina] of paginas.entries()) {
    const conteudo = 5 + indice * 2;
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${conteudo} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    objetos.push(fluxo(pagina));
  }
  return montar(objetos);
}

/** Recupera as linhas gravadas pelo gerador, para os testes conferirem o conteúdo. */
export function textoDoPdf(pdf: Uint8Array): string {
  const bruto = Buffer.from(pdf).toString("latin1");
  const linhas: string[] = [];
  const expressao = /\((?:\\[0-7]{1,3}|\\.|[^\\)])*\) Tj/g;
  for (const encontrado of bruto.matchAll(expressao)) {
    const literal = encontrado[0].slice(1, encontrado[0].length - 4);
    linhas.push(decodificar(literal));
  }
  return linhas.join("\n");
}

function fluxo(linhas: readonly string[]): string {
  const comandos = ["BT", "/F1 10 Tf", `${MARGEM} ${TOPO} Td`];
  for (const [indice, linha] of linhas.entries()) {
    if (indice > 0) comandos.push(`0 -${PASSO} Td`);
    comandos.push(`(${escapar(linha)}) Tj`);
  }
  comandos.push("ET");
  const corpo = comandos.join("\n");
  return `<< /Length ${Buffer.byteLength(corpo, "latin1")} >>\nstream\n${corpo}\nendstream`;
}

function montar(objetos: readonly string[]): Uint8Array {
  let corpo = "%PDF-1.4\n";
  const offsets = [0];
  for (const [indice, objeto] of objetos.entries()) {
    offsets.push(Buffer.byteLength(corpo, "latin1"));
    corpo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  }
  const xref = Buffer.byteLength(corpo, "latin1");
  let tabela = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let indice = 1; indice < offsets.length; indice += 1) {
    const offset = offsets[indice] ?? 0;
    tabela += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  corpo += `${tabela}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(corpo, "latin1"));
}

/** Helvetica WinAnsi cobre o latim do português. O que ficar de fora vira interrogação. */
function escapar(texto: string): string {
  let saida = "";
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 0x3f;
    if (codigo === 0x5c || codigo === 0x28 || codigo === 0x29) {
      saida += `\\${caractere}`;
      continue;
    }
    if (codigo >= 0x20 && codigo <= 0x7e) {
      saida += caractere;
      continue;
    }
    const byte = codigo >= 0xa0 && codigo <= 0xff ? codigo : 0x3f;
    saida += `\\${byte.toString(8).padStart(3, "0")}`;
  }
  return saida;
}

function decodificar(escapado: string): string {
  let saida = "";
  for (let indice = 0; indice < escapado.length; indice += 1) {
    const caractere = escapado[indice];
    if (caractere !== "\\") {
      saida += caractere ?? "";
      continue;
    }
    const proximo = escapado[indice + 1] ?? "";
    if (proximo >= "0" && proximo <= "7") {
      let octal = "";
      while (octal.length < 3) {
        const digito = escapado[indice + 1];
        if (digito === undefined || digito < "0" || digito > "7") break;
        indice += 1;
        octal += digito;
      }
      saida += String.fromCharCode(Number.parseInt(octal, 8));
      continue;
    }
    indice += 1;
    saida += proximo;
  }
  return saida;
}
