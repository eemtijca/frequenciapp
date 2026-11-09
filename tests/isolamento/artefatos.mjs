// Exporta apenas resultados autorizados, sem extrair links ou metadados do tar no host.
import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const capturasReadme = Object.freeze([
  "painel-desktop-claro.png",
  "painel-desktop-escuro.png",
  "chamada-mobile-claro.png",
  "chamada-mobile-escuro.png",
  "relatorios-resumo-desktop.png",
  "saidas-entradas-desktop.png",
  "gestao-turmas-desktop.png",
]);

export function criarDestinoArtefatos(destino, checkout) {
  if (!path.isAbsolute(destino)) throw new Error("Destino de artefatos deve ser absoluto.");
  const alvo = path.resolve(destino);
  const relativo = path.relative(path.resolve(checkout), alvo);
  if (!relativo.startsWith(`..${path.sep}`) && relativo !== "..")
    throw new Error("Artefatos não podem sobrescrever o checkout.");
  let atual = path.parse(alvo).root;
  const partes = alvo.slice(atual.length).split(path.sep);
  for (const parte of partes.slice(0, -1)) {
    atual = path.join(atual, parte);
    const info = lstatSync(atual);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Destino de artefatos contém link ou diretório inválido.");
  }
  // mkdir sem recursive recusa qualquer destino preexistente, inclusive links.
  mkdirSync(alvo, { mode: 0o700 });
  return alvo;
}

function caminhoSeguro(nome) {
  if (
    !nome ||
    nome.startsWith("/") ||
    nome.includes("\\") ||
    /[\x00-\x1f\x7f:]/.test(nome) ||
    nome.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("Caminho de artefato inválido.");
  if (
    /(^|\/)(\.env[^/]*|\.auth|sessions?|sessoes|manifesto(?:\.[^/]+)?|[^/]*(?:storage[-_]?state|session|sessao|sessoes)[^/]*\.(?:json|ya?ml))(\/|$)/i.test(
      nome,
    )
  )
    throw new Error("Manifestos e sessões não são artefatos exportáveis.");
  return nome;
}

/** Aceita somente tar ustar/PAX de arquivos regulares; nunca usa tar extract ou docker cp para destino. */
export function extrairArtefato(tar, destino, origem, relativo) {
  const base = path.posix.basename(origem);
  const arquivos = [];
  const vistos = new Set();
  let pax = {};
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const h = tar.subarray(offset, offset + 512);
    if (h.every((b) => b === 0)) break;
    const texto = (inicio, tamanho) =>
      h
        .subarray(inicio, inicio + tamanho)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const octal = (inicio, tamanho) => {
      const valor = texto(inicio, tamanho).trim();
      if (!/^[0-7]+$/.test(valor)) throw new Error("Tar de artefato inválido.");
      return Number.parseInt(valor, 8);
    };
    const checksum = h.reduce((s, b, i) => s + (i >= 148 && i < 156 ? 32 : b), 0);
    if (checksum !== octal(148, 8)) throw new Error("Checksum do tar de artefato inválido.");
    const tamanho = octal(124, 12);
    const inicio = offset + 512;
    if (!Number.isSafeInteger(tamanho) || inicio + tamanho > tar.length)
      throw new Error("Tar de artefato truncado.");
    const dados = tar.subarray(inicio, inicio + tamanho);
    offset = inicio + Math.ceil(tamanho / 512) * 512;
    const tipo = texto(156, 1);
    if (tipo === "x") {
      if (Object.keys(pax).length) throw new Error("PAX duplicado.");
      let posicao = 0;
      while (posicao < dados.length) {
        const espaco = dados.indexOf(32, posicao);
        const campo = dados.subarray(posicao, espaco).toString();
        if (espaco < posicao || !/^[1-9]\d*$/.test(campo)) throw new Error("PAX inválido.");
        const fim = posicao + Number(campo);
        if (fim <= espaco + 1 || fim > dados.length || dados[fim - 1] !== 10)
          throw new Error("PAX truncado.");
        const entrada = dados.subarray(espaco + 1, fim - 1).toString("utf8");
        const igual = entrada.indexOf("=");
        const chave = entrada.slice(0, igual);
        if (!["path", "mtime", "atime", "ctime"].includes(chave) || chave in pax)
          throw new Error("Metadado PAX não autorizado.");
        pax[chave] = entrada.slice(igual + 1);
        posicao = fim;
      }
      continue;
    }
    if (!["0", "", "5"].includes(tipo) || texto(157, 100))
      throw new Error("Links e arquivos especiais não são artefatos exportáveis.");
    const prefixo = texto(345, 155);
    const nome = caminhoSeguro(
      (pax.path ?? [prefixo, texto(0, 100)].filter(Boolean).join("/")).replace(/\/$/, ""),
    );
    pax = {};
    if (nome !== base && !nome.startsWith(`${base}/`))
      throw new Error("Tar fora da origem autorizada.");
    const sufixo = nome.slice(base.length);
    const alvo = caminhoSeguro(`${relativo}${sufixo}`);
    if (vistos.has(alvo)) throw new Error("Artefato duplicado.");
    vistos.add(alvo);
    if (tipo !== "5") arquivos.push({ nome: alvo, dados });
  }
  if (Object.keys(pax).length || offset + 512 > tar.length)
    throw new Error("Tar de artefato incompleto.");
  // Validar o arquivo inteiro antes de escrever; metadados de proprietário e modo são ignorados.
  for (const arquivo of arquivos) {
    let atual = destino;
    for (const parte of arquivo.nome.split("/").slice(0, -1)) {
      atual = path.join(atual, parte);
      try {
        mkdirSync(atual, { mode: 0o700 });
      } catch (erro) {
        if (erro.code !== "EEXIST") throw erro;
      }
      if (!lstatSync(atual).isDirectory() || lstatSync(atual).isSymbolicLink())
        throw new Error("Diretório de artefato inseguro.");
    }
    writeFileSync(path.join(destino, arquivo.nome), arquivo.dados, { flag: "wx", mode: 0o600 });
  }
  return arquivos.map((a) => a.nome);
}
