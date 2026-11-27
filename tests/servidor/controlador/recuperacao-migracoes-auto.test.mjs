// Exercita a prova privada e o pin real do controlador só com backup sintético.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const fontes = path.resolve(import.meta.dirname, "../../../scripts/servidor");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const em = (ms) => new Date(ms).toISOString();
const operacao = "10000000-0000-4000-8000-000000000001";
const chavesAge = "# Lista de destinatários sintética; não cifra um backup.\n";
const observado = { cluster: "7654321098765432100", banco: "escola", schema: "public" };
const bancoPreMigracao = {
  ...observado,
  container: "a".repeat(64),
  bancoOid: "16384",
  schemaOid: "2200",
};

function fixture(t, criptografia = "age", prazo = 30) {
  assert.equal(process.getuid(), 0, "Executar com root interno de ambiente isolado.");
  assert.equal(fs.existsSync("/run/docker.sock"), false);
  const raiz = fs.mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/prova-recuperacao-`);
  let encerrar = () => {};
  t.after(() => {
    try {
      encerrar();
    } finally {
      fs.rmSync(raiz, { recursive: true });
    }
  });
  const diretorio = (nome) => fs.mkdirSync(nome, { recursive: true, mode: 0o700 });
  const gravar = (nome, bytes) => {
    fs.writeFileSync(nome, bytes, { mode: 0o600 });
    return sha(bytes);
  };
  const json = (nome, valor) => gravar(nome, JSON.stringify(valor) + "\n");
  const p = {
    versao: 1,
    tipo: "compose-host",
    operador: "nobody",
    alvo: "alvo-sintetico",
    path: "/usr/bin:/bin",
  };
  for (const nome of [
    "prefixo",
    "snapshot",
    "dados",
    "estado",
    "config",
    "locks",
    "logs",
    "backups",
    "app",
  ]) {
    p[nome] = `${raiz}/${nome}`;
    diretorio(p[nome]);
  }
  p.estadoLegado = `${raiz}/legado`;
  const bin = `${raiz}/bin`;
  const remoto = `${raiz}/remoto-sintetico`;
  diretorio(bin);
  diretorio(remoto);
  p.path = `${bin}:${p.path}`;
  const rcloneConfig = `${p.config}/rclone.conf`;
  const configSintetica = "# Configuração sintética, sem credenciais reais.\n";
  gravar(rcloneConfig, configSintetica);
  const chamadasRemotas = `${raiz}/chamadas-remotas`;
  fs.writeFileSync(
    `${bin}/rclone`,
    `#!${process.execPath}
const fs = require("node:fs");
const [acao, ...args] = process.argv.slice(2);
const alvo = args.at(-1);
if (!alvo?.startsWith("teste:exclusivo/") || !["lsjson", "cat"].includes(acao)) process.exit(90);
const nome = alvo.slice("teste:exclusivo/".length);
if (!/^frequenciapp-[a-zA-Z0-9.-]+$/.test(nome) || process.env.RCLONE_CONFIG === ${JSON.stringify(rcloneConfig)} ||
  !fs.readFileSync(process.env.RCLONE_CONFIG, "utf8").startsWith(${JSON.stringify(configSintetica)}) ||
  process.env.RCLONE_CONFIG_PASS !== "senha-sintetica" || process.env.RCLONE_TESTE_HERDADO) process.exit(91);
fs.appendFileSync(process.env.RCLONE_CONFIG, "# Renovação sintética\\n");
fs.appendFileSync(${JSON.stringify(chamadasRemotas)}, acao + " " + nome + "\\n");
const caminho = ${JSON.stringify(remoto)} + "/" + nome;
const falhar = (sufixo) => fs.existsSync(caminho + sufixo);
if (falhar(".indisponivel")) {
  console.error("detalhe privado sintético");
  process.exit(92);
}
if (acao === "lsjson") {
  if (!args.includes("--stat")) process.exit(93);
  const stat = fs.statSync(caminho);
  process.stdout.write(JSON.stringify({ Name: nome, Size: stat.size, IsDir: !stat.isFile() }));
} else if (falhar(".travado")) {
  setInterval(() => {}, 1000);
} else if (!falhar(".vazio")) {
  const bytes = fs.readFileSync(caminho);
  if (Number(args[args.indexOf("--count") + 1]) !== bytes.length + 1) process.exit(94);
  process.stdout.write(falhar(".cresceu") ? Buffer.concat([bytes, Buffer.from("!")]) : bytes);
  if (falhar(".incompleto")) process.exitCode = 95;
}
`,
    { mode: 0o700 },
  );
  const env = { HOME: raiz, PATH: p.path, SERVIDOR_ALVO_CHAVE: p.alvo };
  const git = spawnSync("/usr/bin/git", ["init", "-q", p.app], { env });
  assert.equal(git.status, 0, git.stderr?.toString());
  p.identidade = `${p.config}/identidade.json`;
  p.identidadeSha256 = json(p.identidade, { fase: "adotada", trava: p.alvo });
  p.appEnv = `${p.config}/app.env`;
  p.appEnvSha256 = gravar(p.appEnv, "POSTGRES_DB=escola\nDATABASE_SCHEMA=public\n");
  p.opsEnv = `${p.config}/ops.env`;
  let destinatario, autoridade;
  if (criptografia === "age") {
    const lista = `${p.config}/destinatarios.age`;
    destinatario = gravar(lista, chavesAge);
    autoridade = `BACKUP_AGE_DESTINATARIOS=${lista}\nBACKUP_AGE_DESTINATARIOS_SHA256=${destinatario}\n`;
  } else {
    // A chave privada sintética vive na estação descartável, não no perfil.
    const estacao = `${raiz}/estacao`;
    diretorio(estacao);
    const gpg = (...args) =>
      aceito(
        spawnSync(
          "/usr/bin/gpg",
          [
            "--homedir",
            estacao,
            "--batch",
            "--pinentry-mode",
            "loopback",
            "--passphrase",
            "",
            ...args,
          ],
          {
            env,
            encoding: "utf8",
            timeout: 8000,
          },
        ),
      );
    encerrar = () =>
      spawnSync("/usr/bin/gpgconf", ["--homedir", estacao, "--kill", "gpg-agent"], {
        env,
        timeout: 5000,
      });
    gpg("--quick-generate-key", "Ensaio QA <ensaio@example.invalid>", "ed25519", "cert", "1d");
    const fingerprints = () =>
      [
        ...gpg("--with-colons", "--list-keys").matchAll(/^fpr:(?:[^:\n]*:){8}([A-F0-9]{40}):/gm),
      ].map((m) => m[1]);
    const [primaria] = fingerprints();
    gpg("--quick-add-key", primaria, "cv25519", "encr", "1d");
    [, destinatario] = fingerprints();
    assert.match(destinatario, /^[A-F0-9]{40}$/);
    assert.notEqual(primaria, destinatario);
    const publica = `${p.config}/chave-publica.asc`;
    gravar(publica, `${gpg("--armor", "--export", primaria)}\n`);
    autoridade = `BACKUP_GPG_CHAVE_PUBLICA=${publica}\nBACKUP_GPG_FINGERPRINT=${primaria}\nBACKUP_GPG_DESTINATARIO=${primaria}\n`;
  }
  p.opsEnvSha256 = gravar(
    p.opsEnv,
    `BACKUP_MODO=compose\nBACKUP_CRIPTOGRAFIA=${criptografia}\n${autoridade}BACKUP_REMOTO=teste:exclusivo\nBACKUP_RCLONE_CONFIG=${rcloneConfig}\nRCLONE_CONFIG_PASS=senha-sintetica\nBACKUP_TIMEOUT_DUMP_SEGUNDOS=${prazo}\n`,
  );
  const manifesto = {};
  for (const nome of [
    "controlador/contrato.mjs",
    "controlador/cli.mjs",
    "recuperacao-migracoes-auto.mjs",
    "ambiente-seguro.mjs",
    "recibos.mjs",
    "destinatario.mjs",
    "dropbox-estado.mjs",
  ]) {
    const membro = `scripts/servidor/${nome}`;
    const arquivo = `${p.snapshot}/${membro}`;
    diretorio(path.dirname(arquivo));
    manifesto[membro] = gravar(arquivo, fs.readFileSync(`${fontes}/${nome}`));
  }
  p.manifestoSha256 = json(`${p.snapshot}/manifesto.json`, manifesto);
  const perfil = `${p.prefixo}/perfil.json`;
  json(perfil, p);
  const journal = `${p.dados}/journal/${operacao}`;
  const pin = `${p.dados}/pins/${operacao}`;
  const banco = `${p.backups}/banco`;
  for (const nome of [banco, `${p.estado}/recibos`, `${p.dados}/pins`, `${p.dados}/journal`])
    diretorio(nome);
  const trava = `${p.locks}/operacoes-${p.alvo}.lock`;
  gravar(trava, "");
  const executar = (script, args, intencao, comTrava = true) =>
    spawnSync(
      "/usr/bin/flock",
      [
        "-x",
        trava,
        "/bin/bash",
        "--noprofile",
        "--norc",
        "-c",
        comTrava ? 'exec 9<"$1"; shift; exec "$@"' : 'shift; exec "$@"',
        "execucao",
        trava,
        process.execPath,
        `${p.snapshot}/scripts/servidor/${script}`,
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          ...env,
          RCLONE_TESTE_HERDADO: "não passar ao transporte",
          ...(intencao
            ? { SERVIDOR_CONTROLADOR_OPERACAO: operacao, SERVIDOR_CONTROLADOR_ACAO: "atualizar" }
            : { SERVIDOR_CONTROLADOR_PREPARACAO: operacao }),
        },
        timeout: 8000,
      },
    );
  aceito(executar("controlador/contrato.mjs", ["autorizar", perfil, "atualizar"], false));
  const agora = Date.now();
  const catalogar = (base, quando, conteudo, ajustes = {}) => {
    const arquivo = `${base}.dump.${criptografia}`;
    const recibo = `${base}.confirmado.json`;
    const dumpSha = gravar(`${banco}/${arquivo}`, conteudo);
    const sidecar = gravar(`${banco}/${arquivo}.sha256`, `${dumpSha}  ${arquivo}\n`);
    const ambiente = `${base}-ambiente.env.${criptografia}`;
    const ambienteSha256 = gravar(`${banco}/${ambiente}`, "cifra de ambiente sintético\n");
    const ambienteSidecar = gravar(
      `${banco}/${ambiente}.sha256`,
      `${ambienteSha256}  ${ambiente}\n`,
    );
    const r = {
      versao: 1,
      base,
      em: em(quando),
      escopo: { tipo: "schema", alvo: p.alvo, banco: observado.banco, schema: observado.schema },
      remoto: "teste:exclusivo",
      criptografia,
      destinatario,
      etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
      artefatos: [
        { nome: arquivo, sha256: dumpSha },
        { nome: `${arquivo}.sha256`, sha256: sidecar },
        { nome: ambiente, sha256: ambienteSha256 },
        { nome: `${ambiente}.sha256`, sha256: ambienteSidecar },
      ],
      ...ajustes,
    };
    const reciboSha256 = json(`${banco}/${recibo}`, r);
    json(`${p.estado}/recibos/${recibo}`, r);
    for (const nome of [recibo, ...r.artefatos.map((a) => a.nome)])
      gravar(`${remoto}/${nome}`, fs.readFileSync(`${banco}/${nome}`));
    return { reciboSha256, recibo, arquivo, sha256: dumpSha, ambiente, ambienteSha256, r };
  };
  const anterior = catalogar(
    "frequenciapp-20260101T000000Z-1234abcd",
    agora - 172800000,
    "cifra anterior sintética",
  );
  const registro = `${p.config}/recuperacao-migracoes-auto.json`;
  const dados = {
    versao: 1,
    resultado: "restaurado-e-conferido",
    ensaiadoEm: em(agora - 86400000),
    ...observado,
    alvo: p.alvo,
    remoto: anterior.r.remoto,
    criptografia,
    destinatario,
    recibo: anterior.recibo,
    reciboSha256: anterior.reciboSha256,
    arquivo: anterior.arquivo,
    sha256: anterior.sha256,
  };
  const verificar = (obs = observado, comTrava = true) =>
    executar(
      "recuperacao-migracoes-auto.mjs",
      ["verificar", perfil, JSON.stringify(obs)],
      false,
      comTrava,
    );
  const confirmar = (digest, obs = bancoPreMigracao) =>
    executar(
      "recuperacao-migracoes-auto.mjs",
      ["confirmar", perfil, JSON.stringify(obs), operacao, digest],
      true,
    );
  const autorizar = (novo) => {
    diretorio(journal);
    json(`${journal}/intencao.json`, {
      versao: 1,
      acao: "atualizar",
      migracoesAuto: true,
      alvo: p.alvo,
      operacao,
      snapshot: p.manifestoSha256,
      em: em(agora),
    });
    return apontar(novo);
  };
  const apontar = (novo) =>
    json(`${p.estado}/ultimo-backup.json`, {
      em: novo.r.em,
      modo: "compose",
      criptografia: novo.r.criptografia,
      arquivo: novo.arquivo,
      sha256: novo.sha256,
      schema: novo.r.escopo.schema,
      remoto: novo.r.remoto,
      ambiente: novo.ambiente,
      ambienteSha256: novo.ambienteSha256,
      verificadoRemoto: novo.r.etapas.remotoVerificado,
      recibo: novo.recibo,
    });
  const fixar = () => executar("controlador/cli.mjs", ["fixar", perfil], true);
  const registrar = (evidencia) =>
    executar(
      "controlador/cli.mjs",
      ["registrar-migracoes-auto", perfil, JSON.stringify(evidencia)],
      true,
    );
  const novo = (ajustes, ms = agora) =>
    catalogar("frequenciapp-20260102T000000Z-1234abcd", ms, "cifra nova sintética", {
      origem: { ...bancoPreMigracao, operacao },
      ...ajustes,
    });
  return {
    dados,
    p,
    anterior,
    banco,
    pin,
    registro,
    agora,
    json,
    verificar,
    confirmar,
    autorizar,
    apontar,
    fixar,
    registrar,
    novo,
    remoto,
    configuracaoPreservada: () => {
      assert.equal(fs.readFileSync(rcloneConfig, "utf8"), configSintetica);
      assert.equal(
        fs.readdirSync(p.dados).some((n) => n.startsWith("conferir-remoto-")),
        false,
      );
    },
    leiturasRemotas: () =>
      fs.existsSync(chamadasRemotas)
        ? fs.readFileSync(chamadasRemotas, "utf8").trim().split("\n")
        : [],
  };
}

function aceito(r) {
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function recusado(r, motivo) {
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 78, r.stderr);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, motivo);
}

test("backup íntegro sem ensaio independente não libera; registro válido retorna somente seu hash", (t) => {
  const f = fixture(t);
  recusado(f.verificar(), /Registro privado/);
  const digest = f.json(f.registro, f.dados);
  assert.equal(aceito(f.verificar()), digest);
  assert.equal(fs.existsSync(`${f.p.estado}/ultimo-backup.json`), false);
  assert.deepEqual(fs.readdirSync(`${f.p.dados}/journal`), []);
  assert.equal(
    JSON.parse(fs.readFileSync(`${f.banco}/${f.anterior.recibo}`)).etapas.recuperacaoExercitada,
    false,
  );
});

test("verificador recusa sem trava, arquivo público e links", (t) => {
  const f = fixture(t);
  f.json(f.registro, f.dados);
  recusado(f.verificar(observado, false), /Controlador/);
  fs.chmodSync(f.registro, 0o644);
  recusado(f.verificar(), /Registro privado/);
  fs.chmodSync(f.registro, 0o600);
  fs.linkSync(f.registro, `${f.registro}.copia`);
  recusado(f.verificar(), /Registro privado/);
  fs.unlinkSync(f.registro);
  fs.symlinkSync(`${f.registro}.copia`, f.registro);
  recusado(f.verificar(), /Registro privado/);
});

test("verificador recusa registro de outro dono", (t) => {
  const f = fixture(t);
  f.json(f.registro, f.dados);
  fs.chownSync(f.registro, 65534, 65534);
  recusado(f.verificar(), /Registro privado/);
});

test("GPG resolve a subchave de cifra pela chave pública pinada", (t) => {
  const f = fixture(t, "gpg");
  const digest = f.json(f.registro, f.dados);
  assert.equal(aceito(f.verificar()), digest);
  f.autorizar(f.novo());
  aceito(f.fixar());
  aceito(f.confirmar(digest));
});

test("verificador recusa escopo divergente, datas inválidas e bytes alterados", (t) => {
  const f = fixture(t);
  for (const ajustes of [
    { ensaiadoEm: em(f.agora - 31 * 86400000) },
    { ensaiadoEm: em(f.agora + 60000) },
    { ensaiadoEm: em(f.agora - 3 * 86400000) },
    { resultado: "integridade" },
    { alvo: "outro-alvo" },
    { banco: "outra-escola" },
    { schema: "alternativo" },
    { cluster: "9654321098765432100" },
    { remoto: "teste:outra-pasta" },
    { criptografia: "gpg" },
    { destinatario: "b".repeat(64) },
    { reciboSha256: "c".repeat(64) },
    { sha256: "d".repeat(64) },
    { arquivo: "../../outro" },
    { credencial: "sintética" },
  ]) {
    f.json(f.registro, { ...f.dados, ...ajustes });
    recusado(f.verificar(), /Registro privado|Conjunto ensaiado/);
  }
  f.json(f.registro, f.dados);
  recusado(f.verificar({ ...observado, cluster: "outro" }), /Autoridade/);
  fs.appendFileSync(`${f.banco}/${f.anterior.arquivo}`, "alterado");
  recusado(f.verificar(), /Conjunto ensaiado/);
});

test("confirma cópias novas sob a intenção e o pin real, sem mudar o registro de ensaio", (t) => {
  const f = fixture(t);
  const digest = f.json(f.registro, f.dados);
  assert.equal(aceito(f.verificar()), digest);
  const novo = f.novo();
  f.autorizar(novo);
  recusado(f.confirmar(digest), /Pin/);
  aceito(f.fixar());
  aceito(f.confirmar(digest));
  assert.deepEqual(
    f.leiturasRemotas(),
    [
      novo.arquivo,
      `${novo.arquivo}.sha256`,
      novo.ambiente,
      `${novo.ambiente}.sha256`,
      novo.recibo,
    ].flatMap((n) => [`lsjson ${n}`, `cat ${n}`]),
  );
  f.configuracaoPreservada();
  f.json(f.registro, { ...f.dados, ensaiadoEm: em(f.agora - 83000000) });
  recusado(f.confirmar(digest), /Registro privado/);
  f.json(f.registro, f.dados);
  f.apontar(f.anterior);
  recusado(f.confirmar(digest), /Pin/);
  f.apontar(novo);
  fs.appendFileSync(`${f.banco}/${novo.arquivo}`, "alterado na origem do pin");
  recusado(f.confirmar(digest), /Pin/);
  fs.truncateSync(`${f.banco}/${novo.arquivo}`, Buffer.byteLength("cifra nova sintética"));
  fs.appendFileSync(`${f.pin}/${novo.arquivo}`, "alterado");
  recusado(f.confirmar(digest), /Pin/);
});

for (const [caso, mudar] of [
  ["indisponível", (p) => fs.writeFileSync(`${p}.indisponivel`, "")],
  ["artefato ausente", (p) => fs.unlinkSync(p)],
  ["tipo incorreto", (p) => (fs.unlinkSync(p), fs.mkdirSync(p))],
  [
    "checksum divergente com o mesmo tamanho",
    (p) => fs.writeFileSync(p, fs.readFileSync(p).fill(0)),
  ],
  ["sucesso sem bytes", (p) => fs.writeFileSync(`${p}.vazio`, "")],
  ["cresceu depois do stat", (p) => fs.writeFileSync(`${p}.cresceu`, "")],
  ["bytes corretos com falha de transporte", (p) => fs.writeFileSync(`${p}.incompleto`, "")],
]) {
  test(`gate final recusa remoto ${caso} depois da confirmação registrada`, (t) => {
    const f = fixture(t);
    const digest = f.json(f.registro, f.dados);
    assert.equal(aceito(f.verificar()), digest);
    assert.deepEqual(f.leiturasRemotas(), []);
    const novo = f.novo();
    f.autorizar(novo);
    aceito(f.fixar());
    const membro =
      caso === "checksum divergente com o mesmo tamanho" ? `${novo.arquivo}.sha256` : novo.recibo;
    mudar(`${f.remoto}/${membro}`);
    const resposta = f.confirmar(digest);
    recusado(resposta, /cópia remota atual/i);
    assert.doesNotMatch(resposta.stderr, /detalhe privado sintético|teste:exclusivo|rclone\.conf/);
    assert.ok(f.leiturasRemotas().includes(`lsjson ${membro}`));
    f.configuracaoPreservada();
  });
}

test("gate final recusa leitura remota pendurada após o prazo", (t) => {
  const f = fixture(t, "age", 2);
  const digest = f.json(f.registro, f.dados);
  const novo = f.novo();
  f.autorizar(novo);
  aceito(f.fixar());
  fs.writeFileSync(`${f.remoto}/${novo.arquivo}.travado`, "");
  recusado(f.confirmar(digest), /cópia remota atual/i);
  assert.deepEqual(f.leiturasRemotas(), [`lsjson ${novo.arquivo}`, `cat ${novo.arquivo}`]);
  f.configuracaoPreservada();
});

test("ensaio independente legado não comprova a origem do backup novo", (t) => {
  const f = fixture(t);
  const digest = f.json(f.registro, f.dados);
  assert.equal(aceito(f.verificar()), digest);
  f.autorizar(f.novo({ origem: undefined }));
  aceito(f.fixar());
  recusado(f.confirmar(digest), /Pin|Backup novo/);
});

for (const ajuste of [
  { cluster: "9654321098765432100" },
  { container: "b".repeat(64) },
  { bancoOid: "16385" },
  { schemaOid: "2201" },
  { operacao: "10000000-0000-4000-8000-000000000002" },
]) {
  test(`confirmação recusa bytes íntegros de outro ${Object.keys(ajuste)[0]}`, (t) => {
    const f = fixture(t);
    const digest = f.json(f.registro, f.dados);
    f.autorizar(f.novo({ origem: { ...bancoPreMigracao, operacao, ...ajuste } }));
    aceito(f.fixar());
    recusado(f.confirmar(digest), /Pin|Backup novo/);
  });
}

test("registra a aprovação uma vez no journal e vincula o pin e a imagem", (t) => {
  const f = fixture(t);
  const recuperacao = f.json(f.registro, f.dados);
  const evidencia = {
    recuperacao,
    imagem: `sha256:${"c".repeat(64)}`,
    ensaio: { runId: 1234, tentativa: 1 },
    lote: {
      base: "a".repeat(40),
      alvo: "b".repeat(40),
      migracoes: [
        { caminho: "prisma/migrations/20260102000000_teste/migration.sql", sha256: "d".repeat(64) },
      ],
    },
  };
  f.autorizar(f.novo());
  recusado(f.registrar(evidencia), /pin\.json|Pin/i);
  aceito(f.fixar());
  aceito(f.confirmar(recuperacao));
  aceito(f.registrar(evidencia));
  const arquivo = `${f.p.dados}/journal/${operacao}/migracoes-auto.json`;
  const original = fs.readFileSync(arquivo);
  const recibo = JSON.parse(original);
  assert.deepEqual(recibo.lote, evidencia.lote);
  assert.equal(recibo.imagem, evidencia.imagem);
  assert.equal(recibo.pinSha256, sha(fs.readFileSync(`${f.pin}/pin.json`)));
  assert.equal(fs.statSync(arquivo).mode & 0o777, 0o600);
  recusado(f.registrar(evidencia), /EEXIST|existe|não está aguardando/i);
  assert.deepEqual(fs.readFileSync(arquivo), original);
});

for (const tipo of ["antigo", "sem-remoto", "destinatario-divergente", "propria-copia-ensaiada"]) {
  test(`confirmação recusa backup ${tipo}`, (t) => {
    const f = fixture(t);
    const digest = f.json(f.registro, f.dados);
    assert.equal(aceito(f.verificar()), digest);
    const novo =
      tipo === "propria-copia-ensaiada"
        ? f.anterior
        : f.novo(
            tipo === "sem-remoto"
              ? { etapas: { local: true, remotoVerificado: false, recuperacaoExercitada: false } }
              : tipo === "destinatario-divergente"
                ? { destinatario: "b".repeat(64) }
                : {},
            tipo === "antigo" ? f.agora - 1 : f.agora,
          );
    f.autorizar(novo);
    if (tipo === "sem-remoto") assert.notEqual(f.fixar().status, 0);
    else aceito(f.fixar());
    recusado(f.confirmar(digest), /Pin|Backup novo/);
  });
}
