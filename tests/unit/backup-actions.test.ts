// Exercita o preparo privado dos secrets e a limpeza do runner sem contas externas ou executável rclone.
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/backup-actions.sh", import.meta.url));
let pasta = "";
let ambiente: NodeJS.ProcessEnv;
let conteudo = "";
beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "qa-backup-actions-"));
  const executaveis = path.join(pasta, "bin");
  const temporarios = path.join(pasta, "runner");
  await mkdir(executaveis);
  await mkdir(temporarios);
  conteudo = `[origem]\r\ntype = local\r\n# 'aspas' e $(touch marcador-qa)\r\n`;
  ambiente = {
    ...process.env,
    PATH: `${executaveis}${path.delimiter}${process.env.PATH ?? ""}`,
    RUNNER_TEMP: temporarios,
    BACKUP_RCLONE_CONFIG_CONTEUDO: conteudo,
    BACKUP_ORIGEM: "origem:planilhas",
    BACKUP_DESTINO: "destino:copias",
    BACKUP_CHAVE: "QA-chave-ficticia-de-recuperacao-2026",
    QA_RESULTADO: path.join(pasta, "resultado.json"),
  };
  await writeFile(
    path.join(executaveis, "node"),
    `#!${process.execPath}
// Dublê do processo de backup: observa somente a preparação privada da execução.
const fs = require('node:fs');
const path = require('node:path');
const config = process.env.BACKUP_RCLONE_CONFIG;
fs.writeFileSync(process.env.QA_RESULTADO, JSON.stringify({
  conteudo: fs.readFileSync(config, 'utf8'),
  modo: fs.statSync(config).mode & 0o777,
  modoPasta: fs.statSync(path.dirname(config)).mode & 0o777,
  modoTemporarios: fs.statSync(process.env.TMPDIR).mode & 0o777,
  segredoAusente: process.env.BACKUP_RCLONE_CONFIG_CONTEUDO === undefined,
  argumentos: process.argv.slice(2),
}));
fs.writeFileSync(path.join(process.env.TMPDIR, 'QA temporario.csv'), 'QA');
process.exit(Number(process.env.QA_STATUS ?? 0));
`,
    { mode: 0o700 },
  );
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

function rodar(argumentos: string[] = [], env = ambiente) {
  return spawnSync("bash", [script, ...argumentos], { env, cwd: pasta, encoding: "utf8" });
}

it.each([0, 1])(
  "prepara os bytes sem interpretação, protege permissões e limpa após saída %s",
  async (codigo) => {
    const resultado = rodar([], { ...ambiente, QA_STATUS: String(codigo) });
    expect(resultado.status).toBe(codigo);
    const observado = JSON.parse(await readFile(path.join(pasta, "resultado.json"), "utf8"));
    expect(observado).toMatchObject({
      conteudo,
      modo: 0o600,
      modoPasta: 0o700,
      modoTemporarios: 0o700,
      segredoAusente: true,
    });
    expect(observado.argumentos).toEqual([
      fileURLToPath(new URL("../../scripts/backup-externo.mjs", import.meta.url)),
    ]);
    expect(await readdir(ambiente.RUNNER_TEMP ?? "")).toEqual([]);
    await expect(access(path.join(pasta, "marcador-qa"))).rejects.toThrow();
    expect(resultado.stdout).not.toContain(conteudo);
    expect(resultado.stderr).not.toContain(ambiente.BACKUP_CHAVE);
  },
);

it("informa apenas o nome do secret ausente antes de gravar a configuração", async () => {
  const resultado = rodar(["--validar"], { ...ambiente, BACKUP_RCLONE_CONFIG_CONTEUDO: "" });
  expect(resultado.status).toBe(1);
  expect(resultado.stderr).toContain("Configure o secret BACKUP_RCLONE_CONFIG");
  expect(resultado.stderr).not.toContain(ambiente.BACKUP_CHAVE);
  expect(await readdir(ambiente.RUNNER_TEMP ?? "")).toEqual([]);
});

it("exige a senha adicional quando o arquivo de configuração foi criptografado", () => {
  const env = {
    ...ambiente,
    BACKUP_RCLONE_CONFIG_CONTEUDO: "# QA\nRCLONE_ENCRYPT_V0:\nQA\n",
    RCLONE_CONFIG_PASS: "",
  };
  expect(rodar(["--validar"], env).status).toBe(1);
  expect(rodar(["--validar"], { ...env, RCLONE_CONFIG_PASS: "QA" }).status).toBe(0);
});

it("a limpeza final dispensa secrets e não segue um link para fora da pasta da rotina", async () => {
  const externo = path.join(pasta, "preservar");
  await mkdir(externo);
  await writeFile(path.join(externo, "QA.json"), "{}");
  await symlink(externo, path.join(ambiente.RUNNER_TEMP ?? "", "frequenciapp-backup-actions"));
  const resultado = rodar(["--limpar"], {
    PATH: process.env.PATH,
    RUNNER_TEMP: ambiente.RUNNER_TEMP,
    NODE_ENV: "test",
  });
  expect(resultado.status).toBe(0);
  expect(await readFile(path.join(externo, "QA.json"), "utf8")).toBe("{}");
  expect(await readdir(ambiente.RUNNER_TEMP ?? "")).toEqual([]);
});

it("recusa uma raiz inválida para os temporários", () => {
  expect(rodar(["--limpar"], { ...ambiente, RUNNER_TEMP: "/" }).status).toBe(1);
  expect(rodar(["--limpar"], { ...ambiente, RUNNER_TEMP: "" }).status).toBe(1);
});
