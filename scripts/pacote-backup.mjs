// Pacote portátil de arquivos: ZIP AES-256, nomes externos genéricos e manifesto com integridade.
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} from "@zip.js/zip.js/lib/zip-core-native.js";

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ARQUIVOS = 1000;
const MAX_MANIFESTO = 2 * 1024 * 1024;
const esquema = z.strictObject({
  formato: z.literal("frequenciapp.arquivos"),
  versao: z.literal(1),
  exportadoEm: z.iso.datetime(),
  arquivos: z
    .array(
      z.strictObject({
        arquivo: z.string().regex(/^arquivo-\d{4}\.[a-z0-9]{1,10}$/),
        caminho: z.string().min(1).max(1000),
        bytes: z.number().int().min(0).max(MAX_BYTES),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(MAX_ARQUIVOS),
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 32 || senha.length > 256) {
    throw new Error("A chave de recuperação deve ter de 32 a 256 caracteres.");
  }
}

/** Limita também os bytes expandidos, sem confiar apenas nos tamanhos declarados no ZIP. */
async function lerEntrada(entrada, senha, limite) {
  const blocos = [];
  let total = 0;
  await entrada.getData(
    new WritableStream({
      write(bytes) {
        total += bytes.byteLength;
        if (total > limite) throw new Error("A entrada da cópia excede o tamanho permitido.");
        blocos.push(bytes);
      },
    }),
    { password: senha },
  );
  return Buffer.concat(blocos, total);
}

/** Lê somente arquivos regulares de uma pasta privada, com limites de memória e quantidade. */
export async function criarPacote(pasta, senha, agora = new Date()) {
  validarSenha(senha);
  if (!(await lstat(pasta)).isDirectory()) throw new Error("Confira a pasta da cópia.");
  const fontes = [];
  let total = 0;
  async function visitar(diretorio, relativo = "", profundidade = 0) {
    if (profundidade > 20) throw new Error("A pasta da cópia tem níveis em excesso.");
    const entradas = await readdir(diretorio, { withFileTypes: true });
    entradas.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    for (const entrada of entradas) {
      const caminho = relativo ? `${relativo}/${entrada.name}` : entrada.name;
      const absoluto = path.join(diretorio, entrada.name);
      if (caminho.length > 1000) throw new Error("Há um caminho muito longo na cópia.");
      if (entrada.isDirectory()) {
        await visitar(absoluto, caminho, profundidade + 1);
        continue;
      }
      if (!entrada.isFile()) throw new Error("A cópia aceita somente arquivos regulares.");
      const tamanho = (await lstat(absoluto)).size;
      if (fontes.length >= MAX_ARQUIVOS || total + tamanho > MAX_BYTES) {
        throw new Error("A cópia excede 64 MiB ou mil arquivos.");
      }
      const bytes = await readFile(absoluto);
      total += bytes.byteLength;
      if (total > MAX_BYTES) throw new Error("A cópia excede 64 MiB.");
      const extensao = path.extname(entrada.name).slice(1).toLowerCase();
      fontes.push({
        arquivo: `arquivo-${String(fontes.length + 1).padStart(4, "0")}.${/^[a-z0-9]{1,10}$/.test(extensao) ? extensao : "bin"}`,
        caminho,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        conteudo: bytes,
      });
    }
  }
  await visitar(pasta);
  if (!fontes.length) throw new Error("A origem está vazia. Nenhuma cópia foi enviada.");
  const manifesto = esquema.parse({
    formato: "frequenciapp.arquivos",
    versao: 1,
    exportadoEm: agora.toISOString(),
    arquivos: fontes.map(({ conteudo: _conteudo, ...arquivo }) => arquivo),
  });
  const escritor = new ZipWriter(new Uint8ArrayWriter(), {
    password: senha,
    encryptionStrength: 3,
    zipCrypto: false,
    level: 0,
    useWebWorkers: false,
  });
  try {
    for (const fonte of fontes) {
      await escritor.add(fonte.arquivo, new Uint8ArrayReader(fonte.conteudo));
    }
    await escritor.add(
      "manifesto.json",
      new Uint8ArrayReader(Buffer.from(JSON.stringify(manifesto))),
    );
    return { bytes: await escritor.close(), arquivos: fontes.length };
  } catch (erro) {
    await escritor.close().catch(() => undefined);
    throw erro;
  }
}

/** Confere senha, autenticação do ZIP e hash de cada arquivo sem restaurar sobre a origem. */
export async function conferirPacote(bytes, senha) {
  validarSenha(senha);
  if (bytes.byteLength > MAX_BYTES + MAX_MANIFESTO) throw new Error("A cópia é muito grande.");
  const leitor = new ZipReader(new Uint8ArrayReader(bytes), {
    useWebWorkers: false,
    checkAuthenticationCode: true,
    checkOverlappingEntry: true,
  });
  try {
    const entradas = await leitor.getEntries();
    if (
      entradas.length < 2 ||
      entradas.length > MAX_ARQUIVOS + 1 ||
      entradas.some(
        (entrada) =>
          entrada.directory ||
          entrada.symlink ||
          !entrada.encrypted ||
          entrada.zipCrypto ||
          entrada.extraFieldAES?.strength !== 3,
      ) ||
      new Set(entradas.map((entrada) => entrada.filename)).size !== entradas.length
    )
      throw new Error("O pacote não segue o formato da cópia protegida.");
    const indice = entradas.find((entrada) => entrada.filename === "manifesto.json");
    if (!indice || indice.uncompressedSize > MAX_MANIFESTO)
      throw new Error("Confira o manifesto da cópia.");
    const texto = await lerEntrada(indice, senha, MAX_MANIFESTO);
    const manifesto = esquema.parse(JSON.parse(Buffer.from(texto).toString("utf8")));
    if (
      manifesto.arquivos.length !== entradas.length - 1 ||
      new Set(manifesto.arquivos.map((arquivo) => arquivo.arquivo)).size !==
        manifesto.arquivos.length ||
      new Set(manifesto.arquivos.map((arquivo) => arquivo.caminho)).size !==
        manifesto.arquivos.length ||
      manifesto.arquivos.reduce((soma, arquivo) => soma + arquivo.bytes, 0) > MAX_BYTES
    )
      throw new Error("O manifesto não corresponde aos arquivos.");
    for (const arquivo of manifesto.arquivos) {
      const entrada = entradas.find((item) => item.filename === arquivo.arquivo);
      if (!entrada || entrada.uncompressedSize !== arquivo.bytes)
        throw new Error("Há arquivo incompleto na cópia.");
      const conteudo = await lerEntrada(entrada, senha, arquivo.bytes);
      if (conteudo.byteLength !== arquivo.bytes || sha256(conteudo) !== arquivo.sha256) {
        throw new Error("A integridade da cópia não pôde ser confirmada.");
      }
    }
    return manifesto;
  } finally {
    await leitor.close();
  }
}
