// Criptografia real das exportações: senha, integridade e conteúdo
// original, sem nomes pessoais no diretório visível do ZIP.
import { describe, expect, it } from "vitest";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js/lib/zip-core-native.js";
import { erroSenhaZip } from "@/domain/downloads";
import { protegerArquivo, type ArquivoDownload } from "@/lib/downloads";

const SENHA = "Frase exclusiva para cópia 2026!";
const CONTEUDO = "\uFEFFnome;turma\r\nQA Estudante;QA Turma\r\n";
const ARQUIVO: ArquivoDownload = {
  blob: new Blob([CONTEUDO], { type: "text/csv;charset=utf-8" }),
  nome: "grade-qa-turma.csv",
  nomeNoZip: "grade.csv",
  nomeZip: "frequenciapp-grade.zip",
};

describe("senha de exportação", () => {
  it.each(["", "curta", "x".repeat(11), " ".repeat(12), "x".repeat(129)])(
    "rejeita senha fora da política: %j",
    (senha) => expect(erroSenhaZip(senha)).not.toBe(""),
  );
  it.each(["x".repeat(12), "x".repeat(128), SENHA, "🔐".repeat(12)])(
    "aceita os limites e senha Unicode: %j",
    (senha) => expect(erroSenhaZip(senha)).toBe(""),
  );
  it("compara a confirmação sem aparar nem normalizar a senha", () => {
    expect(erroSenhaZip(SENHA, `${SENHA} `)).toContain("confirmação");
    expect(erroSenhaZip(`${SENHA} `, `${SENHA} `)).toBe("");
  });
});

describe("ZIP protegido", () => {
  it("usa AES-256 e recupera todos os bytes, incluindo BOM", async () => {
    const blob = await protegerArquivo(ARQUIVO, SENHA);
    expect(blob.type).toBe("application/zip");
    const leitor = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
    try {
      const entradas = await leitor.getEntries();
      expect(entradas).toHaveLength(1);
      const entrada = entradas[0];
      if (!entrada || entrada.directory) throw new Error("Entrada de arquivo ausente.");
      expect(entrada.filename).toBe("grade.csv");
      expect(entrada.encrypted).toBe(true);
      expect(entrada.zipCrypto).toBe(false);
      expect(entrada.extraFieldAES?.strength).toBe(3);
      expect(entrada.extraFieldAES?.vendorVersion).toBe(2);
      // arrayBuffer compara bytes; TextWriter elimina o BOM por padrão.
      expect(
        new Uint8Array(await entrada.arrayBuffer({ password: SENHA, checkSignature: true })),
      ).toEqual(new Uint8Array(await ARQUIVO.blob.arrayBuffer()));
      const bytes = Buffer.from(await blob.arrayBuffer());
      expect(bytes.includes(Buffer.from("QA Estudante"))).toBe(false);
      expect(bytes.includes(Buffer.from("qa-turma"))).toBe(false);
      expect(bytes.includes(Buffer.from(SENHA))).toBe(false);
    } finally {
      await leitor.close();
    }
  });

  it.each([undefined, "Senha incorreta 2026"])("impede extração com senha %j", async (senha) => {
    const leitor = new ZipReader(new BlobReader(await protegerArquivo(ARQUIVO, SENHA)), {
      useWebWorkers: false,
    });
    try {
      const [entrada] = await leitor.getEntries();
      if (!entrada || entrada.directory) throw new Error("Entrada de arquivo ausente.");
      await expect(
        entrada.getData(new TextWriter(), { password: senha, checkSignature: true }),
      ).rejects.toThrow();
    } finally {
      await leitor.close();
    }
  });

  it("produz cifras diferentes para o mesmo conteúdo e senha", async () => {
    const primeiro = await protegerArquivo(ARQUIVO, SENHA);
    const segundo = await protegerArquivo(ARQUIVO, SENHA);
    expect(
      Buffer.from(await primeiro.arrayBuffer()).equals(Buffer.from(await segundo.arrayBuffer())),
    ).toBe(false);
  });

  it("rejeita senha inválida antes de criar o ZIP", async () => {
    await expect(protegerArquivo(ARQUIVO, "curta")).rejects.toThrow("Senha do ZIP fora do padrão.");
  });

  it("detecta alteração do conteúdo criptografado", async () => {
    const bytes = new Uint8Array(await (await protegerArquivo(ARQUIVO, SENHA)).arrayBuffer());
    const cabecalho = new DataView(bytes.buffer);
    const inicio = 30 + cabecalho.getUint16(26, true) + cabecalho.getUint16(28, true);
    // AES-256: sal de 16 bytes e verificador de 2 bytes precedem a cifra.
    const posicao = inicio + 18;
    bytes[posicao] = (bytes[posicao] ?? 0) ^ 1;
    const leitor = new ZipReader(new BlobReader(new Blob([bytes])), { useWebWorkers: false });
    try {
      const [entrada] = await leitor.getEntries();
      if (!entrada || entrada.directory) throw new Error("Entrada de arquivo ausente.");
      await expect(
        entrada.getData(new TextWriter(), { password: SENHA, checkSignature: true }),
      ).rejects.toThrow();
    } finally {
      await leitor.close();
    }
  });
});
