// Confere a recusa da readoção ampla sem mover prefixo, cron ou trava ativa.
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
  it("recusa readoção ampla preservando prefixo, cron, estado e inode da trava", () => {
    const { ctx, chamadas, controladorPrefixo, controladorPerfil, cronFrequenciapp } =
      prepararContexto({ readocao: true });
    const lock = path.join(controladorPrefixo, "trava.lock");
    fs.writeFileSync(lock, "", { mode: 0o600 });
    const inode = fs.statSync(lock).ino;
    const arquivos = [controladorPerfil, cronFrequenciapp];
    const antes = arquivos.map((nome) => fs.readFileSync(nome));
    const estado = JSON.stringify(ctx.estado);
    assert.throws(
      () => executar(ctx),
      (erro) => erro.codigo === "E_CONTROLADOR" && /revisão administrativa/.test(erro.message),
    );
    assert.deepEqual(
      arquivos.map((nome) => fs.readFileSync(nome)),
      antes,
    );
    assert.equal(fs.statSync(lock).ino, inode);
    assert.equal(JSON.stringify(ctx.estado), estado);
    assert.equal(fs.existsSync(`${controladorPrefixo}.anterior-20261112120000`), false);
    assert.equal(fs.existsSync(`${cronFrequenciapp}.anterior-20261112120000`), false);
    assert.deepEqual(chamadas, []);
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
