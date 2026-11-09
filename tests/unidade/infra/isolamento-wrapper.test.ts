// O wrapper antigo não pode usar rede, IPC ou diretórios pessoais do host.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("não encaminha o Playwright ao namespace do host", () => {
  const pasta = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "isolamento-wrapper-"));
  const log = path.join(pasta, "chamadas");
  writeFileSync(path.join(pasta, "docker"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$LOG_TESTE"\n');
  chmodSync(path.join(pasta, "docker"), 0o700);
  // Um node falso evita iniciar o executor quando o wrapper já tiver sido corrigido.
  writeFileSync(path.join(pasta, "node"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$LOG_TESTE"\n');
  chmodSync(path.join(pasta, "node"), 0o700);
  execFileSync("bash", ["tests/playwright-container.sh", "--project=chromium"], {
    env: { NODE_ENV: "test", PATH: `${pasta}:${process.env.PATH}`, LOG_TESTE: log },
  });
  const args = readFileSync(log, "utf8");
  expect(args).not.toMatch(/--network\nhost|--ipc=host|\/work:\/work/);
  expect(args).toContain("tests/isolamento/executar.mjs");
  expect(args).toContain("--project=chromium");
});

it("recusa opções PostgreSQL herdadas antes de chamar Docker", () => {
  const pasta = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "isolamento-env-"));
  const log = path.join(pasta, "chamadas");
  writeFileSync(log, "");
  writeFileSync(path.join(pasta, "docker"), `#!/bin/sh\nprintf "%s\\n" "$@" >> '${log}'\n`);
  chmodSync(path.join(pasta, "docker"), 0o700);
  const resultado = spawnSync(
    process.execPath,
    ["tests/isolamento/executar.mjs", "--", "node", "-e", "process.exit(0)"],
    {
      env: {
        NODE_ENV: "test",
        PATH: `${pasta}:${process.env.PATH}`,
        LOG_TESTE: log,
        TMPDIR: pasta,
        PGOPTIONS: "-c search_path=externo",
      },
      encoding: "utf8",
    },
  );
  expect(resultado.status).toBe(1);
  expect(readFileSync(log, "utf8")).toBe("");
  expect(resultado.stderr).toMatch(/ambiente externo recusado/i);
});
