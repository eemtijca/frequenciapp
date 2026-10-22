// Exercita a porta de transporte com arquivos sintéticos, sem rede nem dependência do executável rclone.
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  configuracaoBackup,
  executarBackup,
  type ConfiguracaoBackup,
  type TransporteBackup,
} from "../../scripts/backup-externo.mjs";
import { conferirPacote } from "../../scripts/pacote-backup.mjs";

let pasta = "";
let configuracao: ConfiguracaoBackup;
const senha = "QA-chave-ficticia-de-recuperacao-2026";
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "qa-transporte-"));
  const configRclone = path.join(pasta, "rclone.conf");
  await writeFile(configRclone, "[qa]\ntype = local\n", { mode: 0o600 });
  configuracao = {
    origem: "origem:QA planilhas",
    destino: "destino:QA copias",
    senha,
    configRclone,
  };
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

function transporteFalso(ajuste?: { corromper?: boolean; falhar?: string }) {
  const remotos = new Map<string, Buffer>();
  const chamadas: string[][] = [];
  const executar: TransporteBackup = async (argumentos, aoLer) => {
    chamadas.push(argumentos);
    const [comando, origem = "", destino = ""] = argumentos;
    if (comando === ajuste?.falhar) throw new Error("QA falha de transporte");
    if (comando === "copy") {
      await mkdir(destino, { recursive: true, mode: 0o700 });
      await writeFile(path.join(destino, "QA alunos.json"), '{"QA":true}');
    } else if (comando === "copyto") {
      remotos.set(destino, await readFile(origem));
    } else if (comando === "cat") {
      const bytes = remotos.get(origem);
      if (!bytes) throw new Error("QA cópia ausente");
      aoLer?.(ajuste?.corromper ? Buffer.from("QA corrupção") : bytes);
    } else throw new Error("QA operação inesperada");
  };
  return { executar, remotos, chamadas };
}

it("confirma apenas depois de conferir bytes e hash e limpa a pasta temporária", async () => {
  const transporte = transporteFalso();
  const resultado = await executarBackup(configuracao, transporte.executar);
  expect(transporte.chamadas.map((chamada) => chamada[0])).toEqual([
    "copy",
    "copyto",
    "cat",
    "copyto",
  ]);
  expect(
    transporte.chamadas
      .filter((chamada) => chamada[0] === "copyto")
      .every((chamada) => chamada.includes("--immutable")),
  ).toBe(true);
  expect(transporte.chamadas.flat()).not.toContain(senha);
  const remoto = `${configuracao.destino}/${resultado.arquivo}`;
  const bytes = transporte.remotos.get(remoto);
  expect(bytes).toBeDefined();
  expect(await conferirPacote(bytes ?? Buffer.alloc(0), senha)).toMatchObject({
    arquivos: [{ caminho: "QA alunos.json" }],
  });
  expect(
    JSON.parse((transporte.remotos.get(`${remoto}.confirmado.json`) ?? Buffer.alloc(0)).toString()),
  ).toEqual(resultado);
  await expect(lstat(transporte.chamadas[0]?.[2] ?? "")).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserva versões anteriores em novas execuções", async () => {
  const transporte = transporteFalso();
  const primeira = await executarBackup(configuracao, transporte.executar);
  const segunda = await executarBackup(configuracao, transporte.executar);
  expect(primeira.arquivo).not.toBe(segunda.arquivo);
  expect(transporte.remotos.size).toBe(4);
  expect(
    transporte.chamadas.some((chamada) => ["sync", "delete", "purge"].includes(chamada[0] ?? "")),
  ).toBe(false);
});

it("não confirma bytes corrompidos e conserva os arquivos já existentes", async () => {
  const transporte = transporteFalso({ corromper: true });
  transporte.remotos.set("QA anterior", Buffer.from("QA"));
  await expect(executarBackup(configuracao, transporte.executar)).rejects.toThrow(/integridade/);
  expect(transporte.remotos.get("QA anterior")?.toString()).toBe("QA");
  expect([...transporte.remotos.keys()].some((nome) => nome.endsWith(".confirmado.json"))).toBe(
    false,
  );
  await expect(lstat(transporte.chamadas[0]?.[2] ?? "")).rejects.toMatchObject({ code: "ENOENT" });
});

it("interrompe sem enviar um pacote parcial quando a leitura falha", async () => {
  const transporte = transporteFalso({ falhar: "copy" });
  await expect(executarBackup(configuracao, transporte.executar)).rejects.toThrow();
  expect(transporte.remotos.size).toBe(0);
  expect(transporte.chamadas).toHaveLength(1);
});

it("recusa configuração de transporte legível por outras contas", async () => {
  await chmod(configuracao.configRclone, 0o644);
  const transporte = transporteFalso();
  await expect(executarBackup(configuracao, transporte.executar)).rejects.toThrow(/600/);
  expect(transporte.chamadas).toHaveLength(0);
});

it("valida perfis nomeados e separação da origem, sem aceitar parâmetros de linha de comando", () => {
  const base = {
    BACKUP_ORIGEM: "origem:planilhas",
    BACKUP_DESTINO: "destino:copias",
    BACKUP_CHAVE: senha,
    BACKUP_RCLONE_CONFIG: configuracao.configRclone,
  };
  expect(configuracaoBackup(base).destino).toBe("destino:copias");
  for (const origem of [
    "--dump=headers",
    ":http,url=QA:",
    "origem:planilhas\nQA",
    "origem:planilhas/../copias",
  ]) {
    expect(() => configuracaoBackup({ ...base, BACKUP_ORIGEM: origem })).toThrow();
  }
  for (const destino of [
    "origem:planilhas",
    "origem:planilhas/copias",
    "origem:/planilhas//copias/",
    "origem:",
  ]) {
    expect(() => configuracaoBackup({ ...base, BACKUP_DESTINO: destino })).toThrow(/separadas/);
  }
  expect(() =>
    configuracaoBackup({ ...base, BACKUP_ORIGEM: "origem:", BACKUP_DESTINO: "origem:copias" }),
  ).toThrow(/separadas/);
});

it("a CLI falha sem mostrar a chave nem os dados do arquivo", async () => {
  const script = fileURLToPath(new URL("../../scripts/backup-externo.mjs", import.meta.url));
  const arquivo = path.join(pasta, "QA-invalido.zip");
  await writeFile(arquivo, "QA conteúdo privado");
  const resultado = spawnSync(process.execPath, [script, "--conferir", arquivo], {
    env: { ...process.env, BACKUP_CHAVE: senha },
    encoding: "utf8",
  });
  expect(resultado.status).toBe(1);
  expect(resultado.stdout).toBe("");
  expect(resultado.stderr).toContain("Backup não confirmado.");
  expect(resultado.stderr).not.toContain(senha);
  expect(resultado.stderr).not.toContain("QA conteúdo privado");
});
