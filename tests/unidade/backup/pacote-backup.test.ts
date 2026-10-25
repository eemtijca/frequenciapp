// Confere recuperação, nomes protegidos e limites do pacote portátil com massa sintética local.
import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} from "@zip.js/zip.js/lib/zip-core-native.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conferirPacote, criarPacote, sha256 } from "../../../scripts/backup/pacote-backup.mjs";

const senha = "QA-chave-ficticia-de-recuperacao-2026";
let pasta = "";
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "qa-pacote-"));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

describe("pacote portátil", () => {
  it("recupera arquivos e confere hashes, guardando nomes originais apenas no conteúdo criptografado", async () => {
    await mkdir(path.join(pasta, "QA Turmas"));
    await writeFile(path.join(pasta, "QA Turmas", "QA alunos.csv"), "QA dados\n");
    await writeFile(path.join(pasta, "QA copia.json"), "{}");
    const pacote = await criarPacote(pasta, senha, new Date("2026-10-22T12:00:00Z"));
    expect(pacote.arquivos).toBe(2);
    expect(Buffer.from(pacote.bytes).includes(Buffer.from("QA alunos"))).toBe(false);
    const leitor = new ZipReader(new Uint8ArrayReader(pacote.bytes));
    try {
      const entradas = await leitor.getEntries();
      expect(
        entradas.every(
          (entrada) =>
            entrada.encrypted && !entrada.zipCrypto && entrada.extraFieldAES?.strength === 3,
        ),
      ).toBe(true);
      expect(entradas.map((entrada) => entrada.filename)).toEqual([
        "arquivo-0001.json",
        "arquivo-0002.csv",
        "manifesto.json",
      ]);
    } finally {
      await leitor.close();
    }
    const manifesto = await conferirPacote(pacote.bytes, senha);
    expect(manifesto).toMatchObject({
      formato: "frequenciapp.arquivos",
      versao: 1,
      exportadoEm: "2026-10-22T12:00:00.000Z",
    });
    expect(manifesto.arquivos).toEqual([
      {
        arquivo: "arquivo-0001.json",
        caminho: "QA copia.json",
        bytes: 2,
        sha256: sha256(Buffer.from("{}")),
      },
      {
        arquivo: "arquivo-0002.csv",
        caminho: "QA Turmas/QA alunos.csv",
        bytes: 9,
        sha256: sha256(Buffer.from("QA dados\n")),
      },
    ]);
  });

  it("recusa chave errada e pacote truncado", async () => {
    await writeFile(path.join(pasta, "QA.json"), "{}");
    const pacote = await criarPacote(pasta, senha);
    await expect(conferirPacote(pacote.bytes, `${senha}-errada`)).rejects.toThrow();
    await expect(conferirPacote(pacote.bytes.slice(0, -20), senha)).rejects.toThrow();
  });

  it.each([true, false])(
    "recusa criptografia fora de AES-256, ZipCrypto: %s",
    async (zipCrypto) => {
      const escritor = new ZipWriter(new Uint8ArrayWriter(), {
        password: senha,
        zipCrypto,
        encryptionStrength: 1,
        level: 0,
        useWebWorkers: false,
      });
      await escritor.add("arquivo-0001.json", new Uint8ArrayReader(Buffer.from("{}")));
      await escritor.add("manifesto.json", new Uint8ArrayReader(Buffer.from("{}")));
      const bytes = await escritor.close();
      await expect(conferirPacote(bytes, senha)).rejects.toThrow(/formato/);
    },
  );

  it("não empacota origem vazia", async () => {
    await expect(criarPacote(pasta, senha)).rejects.toThrow(/vazia/);
  });

  it("recusa chave curta antes de ler a origem", async () => {
    await expect(criarPacote("/qa-inexistente", "curta")).rejects.toThrow(/32 a 256/);
  });

  it("recusa links simbólicos em vez de copiar arquivos externos", async () => {
    await writeFile(path.join(pasta, "QA.json"), "{}");
    await symlink(path.join(pasta, "QA.json"), path.join(pasta, "atalho"));
    await expect(criarPacote(pasta, senha)).rejects.toThrow(/regulares/);
  });

  it("barra arquivo acima de 64 MiB antes de carregá-lo", async () => {
    const arquivo = path.join(pasta, "QA-grande.json");
    await writeFile(arquivo, "");
    await truncate(arquivo, 64 * 1024 * 1024 + 1);
    await expect(criarPacote(pasta, senha)).rejects.toThrow(/64 MiB/);
  });
});
