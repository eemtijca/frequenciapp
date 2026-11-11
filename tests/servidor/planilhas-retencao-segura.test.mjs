// Só execute em sandbox sem rede, com dados e clientes sintéticos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import { executarBackup } from "../../scripts/backup/backup-externo.mjs";

const hash = (v) => createHash("sha256").update(v).digest("hex");
const nome = (i, instante = "2000-01-01T00:00:00.000Z") =>
  `frequenciapp-${instante.replace(/[:.]/g, "-")}-00000000-0000-4000-8000-${String(i).padStart(12, "0")}.zip`;
function recibo(arquivo, dados, instante = "2000-01-01T00:00:00.000Z") {
  return {
    versao: 1,
    arquivo,
    exportadoEm: instante,
    sha256: hash(dados),
    bytes: Buffer.byteLength(dados),
    arquivos: 1,
  };
}
function ambiente(id = 9999) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "planilhas-seguras-"));
  const bin = path.join(tmp, "bin"),
    pasta = path.join(tmp, "planilhas"),
    remoto = path.join(tmp, "remoto");
  for (const p of [bin, pasta, remoto]) fs.mkdirSync(p);
  fs.writeFileSync(path.join(tmp, "config"), "ficticio", { mode: 0o600 });
  const novo = nome(id),
    dados = "novo ficticio";
  fs.writeFileSync(path.join(remoto, novo), dados);
  fs.writeFileSync(
    path.join(remoto, `${novo}.confirmado.json`),
    JSON.stringify(recibo(novo, dados)),
  );
  fs.writeFileSync(
    path.join(bin, "node"),
    `#!/bin/sh\nif [ "$1" = scripts/backup/backup-externo.mjs ]; then printf '%s\\n' '${JSON.stringify(recibo(novo, dados))}'; else exec ${process.execPath} "$@"; fi\n`,
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(bin, "rclone"),
    `#!/bin/sh\n[ "$1" = copyto ] || exit 90\ncp '${remoto}/'"\${2##*/}" "$3"\n`,
    { mode: 0o700 },
  );
  return { tmp, bin, pasta, remoto, novo };
}
function adicionar(pasta, i, confirmar = true, instante = "2000-01-01T00:00:00.000Z") {
  const n = nome(i, instante),
    dados = `ficticio-${i}`,
    p = path.join(pasta, n);
  fs.writeFileSync(p, dados);
  fs.utimesSync(p, 946684800 + i, 946684800 + i);
  if (confirmar)
    fs.writeFileSync(`${p}.confirmado.json`, JSON.stringify(recibo(n, dados, instante)));
  return p;
}
function variaveis(a, minimo) {
  return {
    PATH: `${a.bin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: a.tmp,
    TMPDIR: a.tmp,
    BACKUP_RCLONE_CONFIG: path.join(a.tmp, "config"),
    BACKUP_DESTINO: "falso:copias",
    BACKUP_PLANILHAS_DIR: a.pasta,
    BACKUP_RETER_DIAS: "1",
    ...(minimo === undefined ? {} : { BACKUP_RETER_MINIMO: minimo }),
  };
}
function executar(a, minimo, sucesso = true) {
  const r = spawnSync("bash", ["scripts/servidor/backup-planilhas-interno.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15000,
    env: variaveis(a, minimo),
  });
  if (!sucesso) return r;
  assert.ifError(r.error);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, r.stderr);
}

test("recibo novo corrompido bloqueia retenção e não anuncia conclusão", () => {
  const a = ambiente();
  try {
    const anterior = adicionar(a.pasta, 1);
    fs.writeFileSync(path.join(a.remoto, `${a.novo}.confirmado.json`), "{");
    const r = executar(a, "0", false);
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.match(r.stdout, /"arquivo"/, r.stderr);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /par local recém-recebido não foi confirmado/);
    assert.doesNotMatch(r.stdout, /Cópia concluída/);
    assert.equal(fs.readFileSync(path.join(a.pasta, `${a.novo}.confirmado.json`), "utf8"), "{");
    assert.ok(fs.existsSync(anterior));
    assert.ok(fs.existsSync(`${anterior}.confirmado.json`));
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("ZIP novo divergente bloqueia retenção e preserva pares existentes", () => {
  const a = ambiente();
  try {
    const anterior = adicionar(a.pasta, 1);
    fs.writeFileSync(path.join(a.remoto, a.novo), "cópia adulterada");
    const r = executar(a, "0", false);
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.match(r.stdout, /"arquivo"/);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /cópia local não confere/i);
    assert.doesNotMatch(r.stdout, /Cópia concluída/);
    assert.ok(fs.existsSync(anterior));
    assert.ok(fs.existsSync(`${anterior}.confirmado.json`));
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("falha do lock bloqueia retenção e preserva pares existentes", () => {
  const a = ambiente();
  try {
    const anterior = adicionar(a.pasta, 1);
    fs.writeFileSync(path.join(a.bin, "flock"), "#!/bin/sh\nexit 77\n", { mode: 0o700 });
    const r = executar(a, "0", false);
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.equal(r.status, 77);
    assert.equal(fs.existsSync(path.join(a.pasta, `${a.novo}.confirmado.json`)), false);
    assert.doesNotMatch(r.stdout, /Cópia concluída/);
    assert.ok(fs.existsSync(anterior));
    assert.ok(fs.existsSync(`${anterior}.confirmado.json`));
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("ordena por captura validada mesmo com mtimes invertidos", () => {
  const a = ambiente();
  try {
    const criar = (instante, id, mtime) => {
      const n = `frequenciapp-${instante.replace(/[:.]/g, "-")}-00000000-0000-4000-8000-${String(id).padStart(12, "0")}.zip`;
      const p = path.join(a.pasta, n),
        dados = `conteudo-${id}`;
      fs.writeFileSync(p, dados);
      fs.writeFileSync(
        `${p}.confirmado.json`,
        JSON.stringify({ ...recibo(n, dados), exportadoEm: instante }),
      );
      fs.utimesSync(p, mtime, mtime);
      return p;
    };
    const maisAntigo = criar("2001-01-01T00:00:00.000Z", 1, 1104537600);
    const maisNovo = criar("2002-01-01T00:00:00.000Z", 2, 946684800);
    executar(a, "2");
    assert.equal(fs.existsSync(maisAntigo), false);
    assert.ok(fs.existsSync(maisNovo));
    assert.ok(fs.existsSync(`${maisNovo}.confirmado.json`));
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("outra execução não remove par em chegada com mínimo zero", { timeout: 20000 }, async () => {
  const a = ambiente(),
    b = ambiente(9998);
  const pronto = path.join(a.tmp, "par-chegou"),
    liberar = path.join(a.tmp, "liberar"),
    tentou = path.join(b.tmp, "tentou-lock");
  b.pasta = path.join(b.tmp, "alias");
  fs.symlinkSync(a.pasta, b.pasta);
  fs.writeFileSync(
    path.join(a.bin, "rclone"),
    `#!/bin/sh\ncp '${a.remoto}/'"\${2##*/}" "$3" || exit\ncase "$3" in *.confirmado.json) touch '${pronto}'; while [ ! -f '${liberar}' ]; do sleep 0.05; done ;; esac\n`,
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(b.bin, "flock"),
    `#!/bin/sh\ntouch '${tentou}'\nexec /usr/bin/flock "$@"\n`,
    { mode: 0o700 },
  );
  const filhos = [];
  const iniciar = (f) => {
    const filho = spawn("bash", ["scripts/servidor/backup-planilhas-interno.sh"], {
      cwd: process.cwd(),
      env: variaveis(f, "0"),
    });
    let stdout = "",
      stderr = "";
    filho.stdout.on("data", (d) => {
      stdout += d;
    });
    filho.stderr.on("data", (d) => {
      stderr += d;
    });
    const fim = new Promise((resolve, reject) => {
      filho.once("error", reject);
      filho.once("close", (codigo, sinal) => resolve({ codigo, sinal, stdout, stderr }));
    });
    filhos.push({ filho, fim });
  };
  const esperar = async (condicao) => {
    const limite = Date.now() + 7000;
    while (!condicao()) {
      if (Date.now() > limite) throw new Error("Tempo esgotado aguardando marco sintético.");
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  try {
    iniciar(a);
    await esperar(() => fs.existsSync(pronto) || filhos[0].filho.exitCode !== null);
    if (!fs.existsSync(pronto))
      throw new Error(
        `Primeira execução encerrou antes do par: ${JSON.stringify(await filhos[0].fim)}`,
      );
    assert.ok(fs.existsSync(path.join(a.pasta, a.novo)));
    assert.ok(fs.existsSync(path.join(a.pasta, `${a.novo}.confirmado.json`)));
    iniciar(b);
    await esperar(() => fs.existsSync(tentou));
    const resultadoAntecipado = await Promise.race([
      filhos[1].fim,
      new Promise((resolve) => setTimeout(() => resolve(null), 500)),
    ]);
    assert.equal(
      resultadoAntecipado,
      null,
      "a segunda execução não aguardou a chegada e validação do primeiro par",
    );
    assert.ok(fs.existsSync(path.join(a.pasta, a.novo)), "o par em chegada foi apagado");
    assert.ok(fs.existsSync(path.join(a.pasta, `${a.novo}.confirmado.json`)));
    fs.writeFileSync(liberar, "");
    const resultados = await Promise.all(filhos.map(({ fim }) => fim));
    for (const r of resultados) {
      assert.equal(r.sinal, null);
      assert.equal(r.codigo, 0, r.stderr);
    }
  } finally {
    fs.writeFileSync(liberar, "");
    for (const { filho } of filhos) if (filho.exitCode === null) filho.kill();
    await Promise.allSettled(filhos.map(({ fim }) => fim));
    fs.rmSync(a.tmp, { recursive: true, force: true });
    fs.rmSync(b.tmp, { recursive: true, force: true });
  }
});

test(
  "duas execuções diretas aguardam o mesmo lock antes de contar e apagar",
  { timeout: 20000 },
  async () => {
    const a = ambiente(),
      b = ambiente(9998),
      liberacao = path.join(a.tmp, "liberar"),
      pronto = path.join(a.tmp, "lock");
    b.pasta = path.join(b.tmp, "alias");
    fs.symlinkSync(a.pasta, b.pasta);
    const anteriores = Array.from({ length: 31 }, (_, i) => adicionar(a.pasta, i));
    const lock = spawn("bash", [
      "-c",
      'exec 9<"$1"; flock -x 9 || exit; touch "$2"; while [ ! -f "$3" ]; do sleep 0.05; done',
      "_",
      a.pasta,
      pronto,
      liberacao,
    ]);
    const filhos = [];
    const esperar = async (condicao) => {
      const limite = Date.now() + 7000;
      while (!condicao()) {
        if (Date.now() > limite) throw new Error("Tempo esgotado aguardando marco sintético.");
        await new Promise((r) => setTimeout(r, 25));
      }
    };
    try {
      await esperar(() => fs.existsSync(pronto));
      for (const fixture of [a, b]) {
        fs.writeFileSync(
          path.join(fixture.bin, "flock"),
          `#!/bin/sh\ntouch '${fixture.tmp}/tentou-lock'\nexec /usr/bin/flock "$@"\n`,
          { mode: 0o700 },
        );
        const filho = spawn("bash", ["scripts/servidor/backup-planilhas-interno.sh"], {
          cwd: process.cwd(),
          env: variaveis(fixture),
        });
        let stdout = "",
          stderr = "";
        filho.stdout.on("data", (d) => {
          stdout += d;
        });
        filho.stderr.on("data", (d) => {
          stderr += d;
        });
        const fim = new Promise((resolve, reject) => {
          filho.once("error", reject);
          filho.once("close", (codigo, sinal) => resolve({ codigo, sinal, stdout, stderr }));
        });
        filhos.push({ filho, fim });
      }
      await esperar(() => [a, b].every((f) => fs.existsSync(path.join(f.tmp, "tentou-lock"))));
      await new Promise((r) => setTimeout(r, 500));
      assert.ok(
        anteriores.every((p) => fs.existsSync(p)),
        "apagou antes de obter o lock compartilhado",
      );
      assert.ok(
        [a, b].every((f) => !fs.existsSync(path.join(a.pasta, f.novo))),
        "copiou antes de obter o lock compartilhado",
      );
      assert.ok(
        filhos.every(({ filho }) => filho.exitCode === null),
        "execução terminou sem obter o lock",
      );
      fs.writeFileSync(liberacao, "");
      const resultados = await Promise.all(filhos.map(({ fim }) => fim));
      for (const r of resultados) {
        assert.equal(r.sinal, null);
        assert.equal(r.codigo, 0, r.stderr);
      }
      assert.equal(anteriores.filter((p) => fs.existsSync(p)).length + 2, 30);
    } finally {
      fs.writeFileSync(liberacao, "");
      for (const { filho } of filhos) if (filho.exitCode === null) filho.kill();
      if (lock.exitCode === null) lock.kill();
      await Promise.allSettled(filhos.map(({ fim }) => fim));
      fs.rmSync(a.tmp, { recursive: true, force: true });
      fs.rmSync(b.tmp, { recursive: true, force: true });
    }
  },
);

test("modo sem cópia local não exige lock nem diretório local", () => {
  const a = ambiente();
  try {
    fs.writeFileSync(path.join(a.bin, "flock"), "#!/bin/sh\nexit 77\n", { mode: 0o700 });
    const pasta = path.join(a.tmp, "não-criar");
    const r = spawnSync("bash", ["scripts/servidor/backup-planilhas-interno.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15000,
      env: { ...variaveis(a, "0"), BACKUP_PLANILHAS_LOCAL: "false", BACKUP_PLANILHAS_DIR: pasta },
    });
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Cópia concluída/);
    assert.equal(fs.existsSync(pasta), false);
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("falha ao remover recibo interrompe retenção após ZIP já removido", () => {
  const a = ambiente();
  try {
    const primeiro = adicionar(a.pasta, 1),
      segundo = adicionar(a.pasta, 2);
    const preload = path.join(a.tmp, "falha.cjs");
    fs.writeFileSync(
      preload,
      `const fs = require('node:fs'); const original = fs.unlinkSync; fs.unlinkSync = function(p, ...args) { if (p === ${JSON.stringify(`${primeiro}.confirmado.json`)}) throw new Error('falha sintética no recibo'); return original.call(this, p, ...args); };`,
    );
    const r = spawnSync("bash", ["scripts/servidor/backup-planilhas-interno.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15000,
      env: { ...variaveis(a, "0"), NODE_OPTIONS: `--require=${preload}` },
    });
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /falha sintética no recibo/);
    assert.doesNotMatch(r.stdout, /Cópia concluída/);
    assert.equal(fs.existsSync(primeiro), false);
    assert.ok(fs.existsSync(`${primeiro}.confirmado.json`));
    assert.ok(fs.existsSync(segundo));
    assert.ok(fs.existsSync(`${segundo}.confirmado.json`));
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

for (const minimo of [undefined, "5", "0"]) {
  test(`remove somente pares confirmados antigos acima do mínimo ${minimo ?? "padrão 30"}`, () => {
    const a = ambiente();
    try {
      const validos = Array.from({ length: 32 }, (_, i) => adicionar(a.pasta, i));
      const naoConfirmado = adicionar(a.pasta, 40, false);
      executar(a, minimo);
      const protegidos = Number(minimo ?? 30) - 1;
      for (const [i, p] of validos.entries()) {
        const mantido = i >= validos.length - Math.max(0, protegidos);
        assert.equal(fs.existsSync(p), mantido, `ZIP ${i}`);
        assert.equal(fs.existsSync(`${p}.confirmado.json`), mantido, `recibo ${i}`);
      }
      assert.ok(fs.existsSync(naoConfirmado));
      assert.ok(fs.existsSync(path.join(a.pasta, a.novo)));
    } finally {
      fs.rmSync(a.tmp, { recursive: true, force: true });
    }
  });
}

test("preserva recibos inválidos, hash divergente, links e nomes desconhecidos", () => {
  const a = ambiente();
  try {
    const variantes = [
      (r) => ({ ...r, versao: 2 }),
      (r) => ({ ...r, arquivo: nome(123) }),
      (r) => ({ ...r, sha256: "0".repeat(64) }),
      (r) => ({ ...r, bytes: r.bytes + 1 }),
      (r) => ({ ...r, arquivos: -1 }),
      (r) => ({ ...r, exportadoEm: "2000-02-01T00:00:00.000Z" }),
      (r) => ({ ...r, extra: true }),
    ];
    const inseguros = variantes.map((mudar, i) => {
      const p = adicionar(a.pasta, i);
      fs.writeFileSync(
        `${p}.confirmado.json`,
        JSON.stringify(mudar(JSON.parse(fs.readFileSync(`${p}.confirmado.json`)))),
      );
      return p;
    });
    const alterado = adicionar(a.pasta, 9);
    fs.writeFileSync(alterado, "X".repeat(fs.statSync(alterado).size));
    inseguros.push(alterado);
    const quebrado = adicionar(a.pasta, 10);
    fs.writeFileSync(`${quebrado}.confirmado.json`, "{");
    inseguros.push(quebrado);
    const link = adicionar(a.pasta, 11);
    fs.unlinkSync(`${link}.confirmado.json`);
    fs.symlinkSync(`${quebrado}.confirmado.json`, `${link}.confirmado.json`);
    inseguros.push(link);
    const duro = adicionar(a.pasta, 12);
    fs.linkSync(duro, path.join(a.pasta, "outro-link"));
    inseguros.push(duro);
    const desconhecido = path.join(a.pasta, "frequenciapp-desconhecido.zip");
    fs.writeFileSync(desconhecido, "desconhecido");
    fs.writeFileSync(`${desconhecido}.confirmado.json`, "{}");
    inseguros.push(desconhecido);
    const valido = adicionar(a.pasta, 20);
    executar(a, "0");
    assert.equal(fs.existsSync(valido), false);
    assert.equal(fs.existsSync(`${valido}.confirmado.json`), false);
    for (const p of inseguros) {
      assert.ok(fs.existsSync(p), p);
      assert.ok(fs.lstatSync(`${p}.confirmado.json`));
    }
    assert.ok(fs.existsSync(path.join(a.pasta, "outro-link")));
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("respeita a janela de idade mesmo com mínimo zero", () => {
  const a = ambiente();
  try {
    const recente = adicionar(a.pasta, 50, true, new Date().toISOString());
    const antigo = adicionar(a.pasta, 51);
    fs.utimesSync(antigo, new Date(), new Date());
    executar(a, "0");
    assert.ok(fs.existsSync(recente));
    assert.ok(fs.existsSync(`${recente}.confirmado.json`));
    assert.equal(fs.existsSync(antigo), false);
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("aceita par produzido pela rotina real com transporte sintético", async () => {
  const a = ambiente();
  try {
    const objetos = new Map();
    const resultado = await executarBackup(
      {
        origem: "falso:origem",
        destino: "falso:destino",
        senha: "chave-ficticia-para-teste-de-32-caracteres",
        configRclone: path.join(a.tmp, "config"),
      },
      async ([comando, origem, destino], aoLer) => {
        if (comando === "copy") {
          fs.mkdirSync(destino, { recursive: true });
          fs.writeFileSync(path.join(destino, "origem.txt"), "dados fictícios");
        } else if (comando === "copyto") objetos.set(destino, fs.readFileSync(origem));
        else if (comando === "cat") aoLer(objetos.get(origem));
        else throw new Error("Operação não prevista no transporte sintético.");
      },
    );
    const p = path.join(a.pasta, resultado.arquivo);
    const remoto = `falso:destino/${resultado.arquivo}`;
    fs.writeFileSync(p, objetos.get(remoto));
    fs.writeFileSync(`${p}.confirmado.json`, objetos.get(`${remoto}.confirmado.json`));
    fs.utimesSync(p, 946684800, 946684800);
    const antigas = Array.from({ length: 29 }, (_, i) => adicionar(a.pasta, i));
    executar(a);
    assert.ok(fs.existsSync(p));
    assert.ok(fs.existsSync(`${p}.confirmado.json`));
    assert.equal(antigas.filter((item) => fs.existsSync(item)).length, 28);
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});

test("ZIPs não confirmados não reduzem os 30 pares confirmados protegidos", () => {
  const a = ambiente();
  try {
    const validos = Array.from({ length: 29 }, (_, i) => adicionar(a.pasta, i));
    // Um marcador antigo não é o recibo do produtor e não autoriza apagar o ZIP.
    fs.writeFileSync(validos[0].replace(/\.zip$/, ".confirmado.json"), "{}");
    for (let i = 30; i < 34; i++) adicionar(a.pasta, i, false);
    executar(a);
    for (const p of validos) {
      assert.ok(fs.existsSync(p), `ZIP confirmado removido: ${p}`);
      assert.ok(fs.existsSync(`${p}.confirmado.json`));
    }
    assert.ok(fs.existsSync(path.join(a.pasta, a.novo)));
  } finally {
    fs.rmSync(a.tmp, { recursive: true, force: true });
  }
});
