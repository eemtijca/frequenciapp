// Testa a readoção do controlador após a troca de canal, com rotação do prefixo e do cron.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { executar } from "../../scripts/instalador/passos/controlador.mjs";

const TEMPORARIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-transicao-"));
  TEMPORARIOS.push(diretorio);
  return diretorio;
}

after(() => {
  for (const diretorio of TEMPORARIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

function prepararContexto({ readocao }) {
  const raiz = temporario();
  const appDir = path.join(raiz, "opt", "frequenciapp");
  const configDir = path.join(raiz, "etc", "frequenciapp");
  const controladorPrefixo = path.join(raiz, "opt", "frequenciapp-controlador");
  const controladorPerfil = path.join(controladorPrefixo, "perfil.json");
  const cronFrequenciapp = path.join(raiz, "etc", "cron.d", "frequenciapp");
  fs.mkdirSync(path.join(appDir, "docker", "app"), { recursive: true });
  fs.writeFileSync(path.join(appDir, "docker", "app", "migrar.mjs"), "// migrador\n");
  fs.mkdirSync(controladorPrefixo, { recursive: true });
  fs.writeFileSync(controladorPerfil, JSON.stringify({ versao: 1 }), { mode: 0o600 });
  fs.mkdirSync(path.dirname(cronFrequenciapp), { recursive: true });
  fs.writeFileSync(cronFrequenciapp, "# cron anterior\n", { mode: 0o600 });
  const chamadas = [];
  const ctx = {
    raiz,
    naoIniciar: false,
    configuracao: { operadorControlador: "operador" },
    caminhos: { appDir, configDir, controladorPrefixo, controladorPerfil, cronFrequenciapp },
    estado: {
      controlador: {
        adotado: true,
        migradorSha256: null,
        readocaoPendente: readocao,
      },
    },
    agora: () => "2026-11-12T12:00:00Z",
    registrarLog: () => {},
    executar: (comando, argumentos = []) => {
      chamadas.push({ comando, argumentos });
      const script = String(argumentos[0] ?? "");
      if (script.endsWith("instalar-controlador.sh") && argumentos.includes("--confirmar")) {
        const prefixo = argumentos[argumentos.indexOf("--prefixo") + 1];
        fs.mkdirSync(prefixo, { recursive: true });
        fs.writeFileSync(path.join(prefixo, "perfil.json"), JSON.stringify({ versao: 1 }), {
          mode: 0o600,
        });
      }
      return { status: 0, stdout: "", stderr: "", erro: null };
    },
  };
  return { ctx, chamadas, controladorPrefixo, controladorPerfil, cronFrequenciapp };
}

describe("readoção do controlador", () => {
  it("arquiva prefixo e cron antigos e confirma a nova adoção", () => {
    const { ctx, chamadas, controladorPrefixo, controladorPerfil, cronFrequenciapp } =
      prepararContexto({ readocao: true });
    const resultado = executar(ctx);
    assert.equal(resultado.estado, "concluida");
    assert.equal(resultado.detalhes.adotado, true);
    assert.equal(resultado.detalhes.rotinas, "cron");
    assert.ok(
      fs.existsSync(`${controladorPrefixo}.anterior-20261112120000`),
      "prefixo anterior arquivado",
    );
    assert.ok(
      fs.existsSync(`${cronFrequenciapp}.anterior-20261112120000`),
      "cron anterior arquivado",
    );
    assert.ok(fs.existsSync(controladorPerfil), "novo perfil criado");
    assert.ok(
      chamadas.some(
        (item) =>
          String(item.argumentos[0]).endsWith("instalar-controlador.sh") &&
          item.argumentos.includes("--confirmar"),
      ),
      "adoção confirmada",
    );
    assert.ok(
      chamadas.some(
        (item) =>
          String(item.argumentos[0]).endsWith("instalar-rotinas.sh") &&
          item.argumentos.includes("--confirmar"),
      ),
      "rotinas confirmadas",
    );
  });

  it("recusa prefixo existente quando a readoção não foi marcada", () => {
    const { ctx } = prepararContexto({ readocao: false });
    ctx.estado.controlador.adotado = false;
    assert.throws(
      () => executar(ctx),
      (erro) => erro.codigo === "E_CONTROLADOR" && /já existe/.test(erro.message),
    );
  });
});
