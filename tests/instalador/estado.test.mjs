// Testa o estado durável: schema, modo 600, escrita atômica, corrupção e trava.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  caminhoEstado,
  estadoInicial,
  executarSobTrava,
  gravarArquivoComTrava,
  gravarEstado,
  lerEstado,
} from "../../scripts/instalador/estado.mjs";
import { ErroInstalador } from "../../scripts/instalador/json.mjs";

const DIRETORIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-estado-"));
  DIRETORIOS.push(diretorio);
  return diretorio;
}

function capturarErro(funcao) {
  try {
    funcao();
  } catch (erro) {
    return erro;
  }
  assert.fail("a operação deveria falhar");
}

after(() => {
  for (const diretorio of DIRETORIOS) {
    fs.rmSync(diretorio, { recursive: true, force: true });
  }
});

describe("estado inicial e leitura", () => {
  it("monta o schema e os campos do contrato", () => {
    const estado = estadoInicial({
      configuracao: { perfil: "simples", canal: "release", tag: "v1.0.0" },
      agora: "2026-11-11T12:00:00Z",
    });
    assert.equal(estado.schema, "frequenciapp.instalacao/1");
    assert.equal(estado.perfil, "simples");
    assert.equal(estado.canal, "release");
    assert.equal(estado.tag, "v1.0.0");
    assert.equal(estado.instaladoEm, "2026-11-11T12:00:00Z");
    assert.deepEqual(estado.controlador, {
      adotado: false,
      migradorSha256: null,
      readocaoPendente: false,
    });
    assert.deepEqual(estado.backup, { ultimoRecibo: null, verificadoEm: null });
    assert.equal(estado.origem.diretorioFonte, "/opt/frequenciapp");
  });

  it("devolve ausência sem criar arquivo", () => {
    const diretorio = temporario();
    const resultado = lerEstado({ caminho: path.join(diretorio, "instalacao.json") });
    assert.equal(resultado.presente, false);
    assert.equal(resultado.estado, null);
    assert.deepEqual(resultado.avisos, []);
  });

  it("resolve o caminho dentro da raiz de teste", () => {
    const diretorio = temporario();
    assert.equal(
      caminhoEstado(diretorio),
      path.join(diretorio, "var/lib/frequenciapp/instalacao.json"),
    );
  });
});

describe("escrita atômica", () => {
  it("grava modo 600 e lê de forma idempotente", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "var/lib/frequenciapp/instalacao.json");
    const estado = estadoInicial({
      configuracao: { perfil: "simples", canal: "release", tag: "v1.0.0" },
      agora: "2026-11-11T12:00:00Z",
    });
    gravarEstado(estado, { caminho });
    assert.equal(fs.statSync(caminho).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(caminho)).mode & 0o777, 0o700);
    const primeira = lerEstado({ caminho });
    const segunda = lerEstado({ caminho });
    assert.equal(primeira.presente, true);
    assert.deepEqual(primeira.estado, segunda.estado);
    assert.deepEqual(
      fs.readdirSync(path.dirname(caminho)),
      ["instalacao.json"],
      "não pode restar arquivo temporário",
    );
  });

  it("não deixa temporário quando a gravação falha", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "var/lib/frequenciapp/instalacao.json");
    const estado = estadoInicial({ agora: "2026-11-11T12:00:00Z" });
    const original = fs.renameSync;
    fs.renameSync = () => {
      throw new Error("falha simulada");
    };
    try {
      assert.throws(() => gravarEstado(estado, { caminho }));
    } finally {
      fs.renameSync = original;
    }
    assert.deepEqual(fs.readdirSync(path.dirname(caminho)), []);
  });

  it("avisa quando o estado tem permissão mais ampla que 600", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "instalacao.json");
    const estado = estadoInicial({ agora: "2026-11-11T12:00:00Z" });
    fs.writeFileSync(caminho, JSON.stringify(estado), { mode: 0o644 });
    fs.chmodSync(caminho, 0o644);
    const resultado = lerEstado({ caminho });
    assert.ok(resultado.avisos.some((item) => item.codigo === "A_ESTADO_PERMISSAO"));
  });
});

describe("estado corrompido e segredo", () => {
  it("recusa JSON inválido com E_VALIDACAO", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "instalacao.json");
    fs.writeFileSync(caminho, "{ invalido", "utf8");
    const erro = capturarErro(() => lerEstado({ caminho }));
    assert.ok(erro instanceof ErroInstalador);
    assert.equal(erro.codigo, "E_VALIDACAO");
  });

  it("recusa schema divergente com E_VALIDACAO", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "instalacao.json");
    fs.writeFileSync(
      caminho,
      JSON.stringify({ schema: "frequenciapp.instalacao/2", perfil: "simples" }),
      "utf8",
    );
    const erro = capturarErro(() => lerEstado({ caminho }));
    assert.equal(erro.codigo, "E_VALIDACAO");
  });

  it("recusa chave desconhecida no estado", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "instalacao.json");
    const estado = estadoInicial({ agora: "2026-11-11T12:00:00Z" });
    fs.writeFileSync(caminho, JSON.stringify({ ...estado, segredo: "valor" }), "utf8");
    const erro = capturarErro(() => lerEstado({ caminho }));
    assert.equal(erro.codigo, "E_VALIDACAO");
  });

  it("recusa tag fora do formato do contrato", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "instalacao.json");
    const estado = estadoInicial({ agora: "2026-11-11T12:00:00Z" });
    fs.writeFileSync(caminho, JSON.stringify({ ...estado, tag: "1.0.0" }), "utf8");
    const erro = capturarErro(() => lerEstado({ caminho }));
    assert.equal(erro.codigo, "E_VALIDACAO");
  });

  it("recusa segredo no estado", () => {
    const diretorio = temporario();
    const caminho = path.join(diretorio, "instalacao.json");
    const estado = estadoInicial({ agora: "2026-11-11T12:00:00Z" });
    estado.origem.repositorio = "postgresql://aluno:segredo@db:5432/frequencia";
    const erro = capturarErro(() => gravarEstado(estado, { caminho }));
    assert.equal(erro.codigo, "E_VALIDACAO");
    assert.equal(fs.existsSync(caminho), false);
  });
});

describe("trava local", () => {
  it("executa o comando sob flock com espera de 30 segundos", () => {
    const diretorio = temporario();
    const trava = path.join(diretorio, "trava/instalador.lock");
    const chamadas = [];
    const resultado = executarSobTrava(trava, "comando", ["--teste"], {
      executar: (comando, argumentos, opcoes) => {
        chamadas.push({ comando, argumentos, opcoes });
        return { status: 0, stdout: "", stderr: "", erro: null };
      },
    });
    assert.equal(resultado.status, 0);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].comando, "flock");
    assert.deepEqual(chamadas[0].argumentos.slice(0, 5), ["-w", "30", "-x", trava, "comando"]);
    assert.equal(fs.statSync(path.dirname(trava)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(trava).mode & 0o777, 0o600);
  });

  it("grava arquivo pela trava sem colocar o conteúdo em argv", () => {
    const diretorio = temporario();
    const trava = path.join(diretorio, "trava/instalador.lock");
    const destino = path.join(diretorio, "config.json");
    const chamadas = [];
    gravarArquivoComTrava(trava, destino, '{"perfil":"simples"}\n', {
      sobrescrever: false,
      executar: (comando, argumentos, opcoes) => {
        chamadas.push({ comando, argumentos, opcoes });
        return { status: 0, stdout: "", stderr: "", erro: null };
      },
    });
    assert.equal(chamadas[0].comando, "flock");
    assert.equal(chamadas[0].opcoes.input, '{"perfil":"simples"}\n');
    assert.equal(
      chamadas[0].argumentos.some((argumento) => argumento.includes("perfil")),
      false,
    );
  });

  it("informa o PID detentor quando o arquivo da trava o contém", () => {
    const diretorio = temporario();
    const trava = path.join(diretorio, "trava/instalador.lock");
    fs.mkdirSync(path.dirname(trava), { recursive: true });
    fs.writeFileSync(trava, "4321\n", { mode: 0o600 });
    const erro = capturarErro(() =>
      executarSobTrava(trava, "comando", [], {
        executar: () => ({ status: 1, stdout: "", stderr: "", erro: null }),
      }),
    );
    assert.equal(erro.codigo, "E_VALIDACAO");
    assert.match(erro.message, /4321/);
  });

  it("não falha quando o PID detentor não pode ser lido", () => {
    const diretorio = temporario();
    const trava = path.join(diretorio, "trava/instalador.lock");
    fs.mkdirSync(path.dirname(trava), { recursive: true });
    fs.writeFileSync(trava, "", { mode: 0o600 });
    const erro = capturarErro(() =>
      executarSobTrava(trava, "comando", [], {
        executar: () => ({ status: 1, stdout: "", stderr: "", erro: null }),
        lerPid: () => {
          throw new Error("falha simulada");
        },
      }),
    );
    assert.equal(erro.codigo, "E_VALIDACAO");
    assert.doesNotMatch(erro.message, /Processo detentor/);
  });
});
