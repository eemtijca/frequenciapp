// Importar helpers administrativos ou recusar um ensaio não pode limpar pilhas.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it.each(["", "; compose_teste ps"])("não chama Docker sem prova ao carregar lib%s", (acao) => {
  const pasta = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "isolamento-servidor-"));
  try {
    const log = path.join(pasta, "docker.log");
    writeFileSync(path.join(pasta, "docker"), '#!/bin/sh\nprintf "%s\\n" "$@" >> "$LOG_TESTE"\n');
    chmodSync(path.join(pasta, "docker"), 0o700);
    const resultado = spawnSync("bash", ["-c", `. tests/servidor/lib.sh${acao}`], {
      env: {
        NODE_ENV: "test",
        PATH: `${pasta}:${process.env.PATH}`,
        LOG_TESTE: log,
        TMPDIR: pasta,
      },
      encoding: "utf8",
    });
    expect(existsSync(log)).toBe(false);
    if (acao) expect(resultado.status).not.toBe(0);
    else expect(resultado.status).toBe(0);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
