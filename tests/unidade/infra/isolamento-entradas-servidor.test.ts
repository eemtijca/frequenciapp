// Exercita entradas administrativas com clientes falsos, inclusive saída e sinais.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function comClientesFalsos(acao: (pasta: string, env: NodeJS.ProcessEnv) => void) {
  const pasta = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "entradas-servidor-"));
  try {
    for (const nome of ["docker", "pg_restore", "gpg"]) {
      const arquivo = path.join(pasta, nome);
      writeFileSync(
        arquivo,
        `#!/bin/sh\nprintf '%s %s\\n' '${nome}' "$*" >> "$LOG_CLIENTES"\nexit 91\n`,
      );
      chmodSync(arquivo, 0o700);
    }
    const pausa = path.join(pasta, "sleep");
    writeFileSync(pausa, "#!/bin/sh\nexit 0\n");
    chmodSync(pausa, 0o700);
    acao(pasta, {
      NODE_ENV: "test",
      PATH: `${pasta}:/usr/bin:/bin`,
      HOME: pasta,
      TMPDIR: pasta,
      LOG_CLIENTES: path.join(pasta, "clientes.log"),
      // Opt-ins e identidade escolhida pelo chamador não constituem prova.
      FREQUENCIAPP_ISOLAMENTO: "1",
      SERVIDOR_AMBIENTE_INJETADO: "true",
      COMPOSE_PROJECT_NAME: "frequenciapp-vizinho",
    });
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

function chamadas(pasta: string) {
  const log = path.join(pasta, "clientes.log");
  return existsSync(log) ? readFileSync(log, "utf8") : "";
}

const entradas = ["restauracao-url.sh", "atualizacao-integracao.sh", "executar.sh"] as const;
const statusPorSinal = { EXIT: 37, HUP: 129, INT: 130, TERM: 143 };
const sinais = ["EXIT", "HUP", "INT", "TERM"] as const;

describe("preflight das entradas administrativas", () => {
  it.each(entradas)("recusa %s antes de chamar clientes ou instalar cleanup", (entrada) => {
    comClientesFalsos((pasta, env) => {
      const resultado = spawnSync("bash", [`tests/servidor/${entrada}`], {
        cwd: raiz,
        env,
        encoding: "utf8",
        timeout: 10000,
      });
      expect(resultado.error).toBeUndefined();
      expect(chamadas(pasta)).toBe("");
      expect(resultado.status).toBe(78);
      expect(resultado.stderr).toContain("BLOQUEADO");
      expect(readdirSync(pasta).filter((nome) => nome.startsWith("frequenciapp-"))).toEqual([]);
    });
  });

  it.each(entradas.flatMap((entrada) => sinais.map((sinal) => [entrada, sinal] as const)))(
    "importar %s sem prova preserva a saída do chamador em %s",
    (entrada, sinal) => {
      comClientesFalsos((pasta, env) => {
        const resultado = spawnSync(
          "bash",
          [
            "-c",
            `trap 'printf "saida-original\\n"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
if . "$1"; then exit 92; fi
case "$2" in EXIT) exit 37 ;; *) kill -s "$2" "$$" ;; esac`,
            "ensaio",
            `tests/servidor/${entrada}`,
            sinal,
          ],
          { cwd: raiz, env, encoding: "utf8", timeout: 10000 },
        );
        expect(resultado.error).toBeUndefined();
        expect(chamadas(pasta)).toBe("");
        expect(resultado.stdout).toContain("saida-original");
        expect(resultado.status).toBe(statusPorSinal[sinal]);
      });
    },
  );

  it.each(["preparar_ambiente", "compose_teste ps"])(
    "não permite continuação depois de %s recusado em condicional",
    (acao) => {
      comClientesFalsos((pasta, env) => {
        const resultado = spawnSync(
          "bash",
          ["-c", `. tests/servidor/lib.sh; if ${acao}; then :; fi; docker continuacao-indevida`],
          { cwd: raiz, env, encoding: "utf8" },
        );
        expect(chamadas(pasta)).toBe("");
        expect(resultado.status).toBe(78);
      });
    },
  );

  it("recusa a suíte completa antes de disparar subprocessos", () => {
    comClientesFalsos((pasta, env) => {
      const filho = path.join(pasta, "bash");
      writeFileSync(filho, '#!/bin/sh\nprintf "subprocesso\\n" >> "$LOG_CLIENTES"\nexit 91\n');
      chmodSync(filho, 0o700);
      const resultado = spawnSync("/bin/bash", ["tests/servidor/executar.sh"], {
        cwd: raiz,
        env,
        encoding: "utf8",
      });
      expect(chamadas(pasta)).toBe("");
      expect(resultado.status).toBe(78);
    });
  });

  it.each(["", "; compose_teste ps"])("importar lib%s não chama Docker", (acao) => {
    comClientesFalsos((pasta, env) => {
      const resultado = spawnSync("bash", ["-c", `. tests/servidor/lib.sh${acao}`], {
        cwd: raiz,
        env,
        encoding: "utf8",
      });
      expect(chamadas(pasta)).toBe("");
      expect(resultado.status).toBe(acao ? 78 : 0);
    });
  });
});

describe("CI administrativo sem recursos não comprovados", () => {
  it.each([
    "isolamento-entradas.sh validar-servidor",
    "isolamento-entradas.sh validar-helm",
    "isolamento-entradas.sh validar-workflows",
    "backup-restauracao.sh",
    "restauracao-url.sh",
    "atualizacao-integracao.sh",
  ])("preserva status e evidência do bloqueio de %s com tee", (comando) => {
    comClientesFalsos((pasta, env) => {
      const evidencia = path.join(pasta, "evidencia.log");
      const resultado = spawnSync(
        "bash",
        ["-e", "-o", "pipefail", "-c", `bash tests/servidor/${comando} 2>&1 | tee "$EVIDENCIA"`],
        { cwd: raiz, env: { ...env, EVIDENCIA: evidencia }, encoding: "utf8", timeout: 10000 },
      );
      expect(resultado.error).toBeUndefined();
      expect(resultado.status).toBe(78);
      expect(chamadas(pasta)).toBe("");
      expect(readFileSync(evidencia, "utf8")).toContain("BLOQUEADO");
    });
  });

  it("não chama Docker nem mantém cleanup por busca", () => {
    const workflow = readFileSync(path.join(raiz, ".github/workflows/servidor.yml"), "utf8");
    expect(workflow).not.toMatch(/docker\s+(?:ps|run|compose|build|rm)|xargs|--filter/);
    expect(workflow).not.toContain("bash infra/servidor/validar.sh");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).toContain("isolamento-entradas-servidor.test.ts");
    expect(workflow).toContain("bash tests/servidor/atualizacao.sh");
    for (const entrada of ["backup-restauracao", "restauracao-url", "atualizacao-integracao"])
      expect(workflow).toContain(`bash tests/servidor/${entrada}.sh`);
    for (const entrada of ["validar-servidor", "validar-helm", "validar-workflows"])
      expect(workflow).toContain(`isolamento-entradas.sh ${entrada}`);
    expect(workflow).toContain("pipefail");
    expect(workflow).toContain("if: ${{ !cancelled() }}");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("uses: actions/upload-artifact@");
    expect(workflow).toContain("path: test-results/servidor");
  });
});
