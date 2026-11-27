// Vincula o ensaio privado de recuperação ao backup novo fixado pelo controlador.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { autorizar, exigir, hash, lerAmbiente, protegido } from "./controlador/contrato.mjs";
import { destinatarioGpg } from "./destinatario.mjs";
import { camposBancoPreMigracao, validarBancoPreMigracao, validarRecibo } from "./recibos.mjs";

const LIMITE_METADADO = 64 * 1024;
const VALIDADE_ENSAIO = 30 * 86400000;
const SHA256 = /^[a-f0-9]{64}$/;
const OPERACAO = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const NOME_RECIBO = /^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$/;
const RESULTADO = "restaurado-e-conferido";

function formato(objeto, campos) {
  return (
    objeto &&
    typeof objeto === "object" &&
    !Array.isArray(objeto) &&
    Object.keys(objeto).length === campos.length &&
    campos.every((c) => Object.hasOwn(objeto, c))
  );
}

function instante(texto) {
  const ms = Date.parse(texto);
  return typeof texto === "string" && Number.isFinite(ms) && new Date(ms).toISOString() === texto
    ? ms
    : NaN;
}

function erroDeEtapa(mensagem, conferir) {
  try {
    return conferir();
  } catch {
    // Não propagar caminhos, JSON, valores de ambiente ou diagnósticos do GPG.
    throw new Error(mensagem);
  }
}

function lerProtegido(nome, conferir, privado = true) {
  const s = protegido(nome, "arquivo", privado);
  const fd = fs.openSync(
    nome,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const atual = fs.fstatSync(fd);
    exigir(
      atual.isFile() &&
        atual.uid === 0 &&
        atual.nlink === 1 &&
        atual.dev === s.dev &&
        atual.ino === s.ino &&
        (atual.mode & (privado ? 0o077 : 0o022)) === 0,
      "Descritor sem proteção.",
    );
    const resultado = conferir(fd, atual.size);
    const depois = fs.fstatSync(fd);
    exigir(
      depois.size === atual.size &&
        depois.mtimeMs === atual.mtimeMs &&
        depois.ctimeMs === atual.ctimeMs,
      "Arquivo alterado durante a leitura.",
    );
    return resultado;
  } finally {
    fs.closeSync(fd);
  }
}

function bytesProtegidos(nome, privado = true, mascaraProibida = 0) {
  return lerProtegido(
    nome,
    (fd, tamanho) => {
      exigir((fs.fstatSync(fd).mode & mascaraProibida) === 0, "Permissão insegura.");
      exigir(tamanho > 0 && tamanho <= LIMITE_METADADO, "Metadado inválido.");
      const buffer = Buffer.alloc(tamanho + 1);
      let lidos = 0;
      while (lidos < buffer.length) {
        const n = fs.readSync(fd, buffer, lidos, buffer.length - lidos, null);
        if (n === 0) break;
        lidos += n;
      }
      exigir(lidos === tamanho, "Tamanho alterado.");
      return buffer.subarray(0, lidos);
    },
    privado,
  );
}

function arquivoJson(nome) {
  const bytes = bytesProtegidos(nome);
  return { dados: JSON.parse(bytes.toString("utf8")), sha256: hash(bytes), tamanho: bytes.length };
}

function hashArtefato(nome) {
  return lerProtegido(nome, (fd, tamanho) => {
    exigir(tamanho > 0 && Number.isSafeInteger(tamanho + 1), "Tamanho do artefato inválido.");
    const sha = createHash("sha256"),
      buffer = Buffer.allocUnsafe(128 * 1024);
    let lidos = 0;
    for (let n; (n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0;) {
      lidos += n;
      exigir(lidos <= tamanho, "Artefato cresceu durante a leitura.");
      sha.update(buffer.subarray(0, n));
    }
    exigir(lidos === tamanho, "Artefato truncado.");
    return { sha256: sha.digest("hex"), tamanho };
  });
}

function autoridade(p, env, observado) {
  const banco = env.POSTGRES_DB || "frequencia",
    schema = env.DATABASE_SCHEMA || "public";
  const remoto = env.BACKUP_REMOTO;
  const criptografia = env.BACKUP_CRIPTOGRAFIA || "gpg";
  exigir(
    formato(observado, ["cluster", "banco", "schema"]) &&
      observado.banco === banco &&
      observado.schema === schema &&
      typeof observado.cluster === "string" &&
      /^[1-9][0-9]{0,19}$/.test(observado.cluster) &&
      BigInt(observado.cluster) <= 18446744073709551615n &&
      (env.BACKUP_MODO || "compose") === "compose" &&
      typeof remoto === "string" &&
      remoto.trim() &&
      !/[\r\n\0]/.test(remoto) &&
      (env.BACKUP_VERIFICAR_REMOTO || "true") === "true",
    "Autoridade sem Compose e cópia remota verificável.",
  );
  let destinatario;
  if (criptografia === "age") {
    destinatario = hash(bytesProtegidos(env.BACKUP_AGE_DESTINATARIOS, false));
    exigir(destinatario === env.BACKUP_AGE_DESTINATARIOS_SHA256, "Pin age divergente.");
  } else {
    exigir(criptografia === "gpg", "Cifra sem autoridade.");
    const r = spawnSync(
      "/usr/bin/gpg",
      [
        "--homedir",
        "/dev/null",
        "--batch",
        "--no-options",
        "--no-keyring",
        "--no-autostart",
        "--no-auto-check-trustdb",
        "--trust-model",
        "always",
        "--with-colons",
        "--with-fingerprint",
        "--with-subkey-fingerprint",
        "--show-keys",
      ],
      {
        env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
        input: bytesProtegidos(env.BACKUP_GPG_CHAVE_PUBLICA, false),
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: LIMITE_METADADO,
      },
    );
    exigir(!r.error && !r.signal && r.status === 0, "Chave pública não conferida.");
    destinatario = destinatarioGpg(
      r.stdout,
      env.BACKUP_GPG_FINGERPRINT,
      env.BACKUP_GPG_DESTINATARIO,
    );
  }
  return { ...observado, alvo: p.alvo, remoto, criptografia, destinatario };
}

function mesmoEscopo(recibo, esperado) {
  return (
    recibo.escopo.alvo === esperado.alvo &&
    recibo.escopo.banco === esperado.banco &&
    recibo.escopo.schema === esperado.schema &&
    recibo.remoto === esperado.remoto &&
    recibo.criptografia === esperado.criptografia &&
    recibo.destinatario === esperado.destinatario &&
    recibo.etapas.remotoVerificado === true
  );
}

function dumpDoRecibo(recibo) {
  return recibo.artefatos.find((a) => a.nome === `${recibo.base}.dump.${recibo.criptografia}`);
}

function conferirArtefatosProtegidos(diretorio, recibo) {
  return recibo.artefatos.map((a) => {
    const { sha256, tamanho } = hashArtefato(`${diretorio}/${a.nome}`);
    exigir(sha256 === a.sha256, "Artefato divergente.");
    if (!a.nome.endsWith(".sha256"))
      exigir(
        bytesProtegidos(`${diretorio}/${a.nome}.sha256`).toString("utf8") ===
          `${a.sha256}  ${a.nome}\n`,
        "Checksum divergente.",
      );
    return { nome: a.nome, sha256, tamanho };
  });
}

function verificarRegistro(p, escopo, digest, agora) {
  const registro = erroDeEtapa(
    "Registro privado de recuperação ausente, vencido ou divergente.",
    () => {
      protegido(p.config, "diretorio");
      const { dados: r, sha256 } = arquivoJson(`${p.config}/recuperacao-migracoes-auto.json`);
      const em = instante(r?.ensaiadoEm);
      exigir(
        formato(r, [
          "versao",
          "resultado",
          "ensaiadoEm",
          ...Object.keys(escopo),
          "recibo",
          "reciboSha256",
          "arquivo",
          "sha256",
        ]) &&
          r.versao === 1 &&
          r.resultado === RESULTADO &&
          em <= agora &&
          agora - em <= VALIDADE_ENSAIO &&
          Object.entries(escopo).every(([k, v]) => r[k] === v) &&
          typeof r.recibo === "string" &&
          NOME_RECIBO.test(r.recibo) &&
          typeof r.reciboSha256 === "string" &&
          SHA256.test(r.reciboSha256) &&
          typeof r.sha256 === "string" &&
          SHA256.test(r.sha256) &&
          (digest === undefined || digest === sha256),
        "Registro sem autoridade.",
      );
      return { r, sha256, em };
    },
  );
  erroDeEtapa("Conjunto ensaiado não corresponde ao catálogo ou aos bytes retidos.", () => {
    const { r, em } = registro;
    const catalogo = arquivoJson(`${p.estado}/recibos/${r.recibo}`);
    const recibo = validarRecibo(catalogo.dados),
      dump = dumpDoRecibo(recibo);
    const local = `${p.backups}/banco`;
    exigir(
      catalogo.sha256 === r.reciboSha256 &&
        hash(bytesProtegidos(`${local}/${r.recibo}`)) === r.reciboSha256 &&
        `${recibo.base}.confirmado.json` === r.recibo &&
        mesmoEscopo(recibo, escopo) &&
        instante(recibo.em) <= em &&
        dump?.nome === r.arquivo &&
        dump?.sha256 === r.sha256,
      "Conjunto ensaiado divergente.",
    );
    conferirArtefatosProtegidos(local, recibo);
  });
  return registro;
}

function confirmarBackup(p, escopo, bancoPreMigracao, registro, operacao, agora) {
  const pin = `${p.dados}/pins/${operacao}`;
  protegido(pin, "diretorio", true);
  const { dados: r } = arquivoJson(`${pin}/pin.json`);
  exigir(
    r.versao === 1 && r.operacao === operacao && r.alvo === p.alvo && Array.isArray(r.arquivos),
    "Pin inválido.",
  );
  // Vincula o manifesto do pin aos descritores que contêm o ponteiro e o recibo.
  const ponteiro = arquivoJson(`${pin}/ponteiro.json`);
  const estado = ponteiro.dados;
  exigir(
    typeof estado.recibo === "string" && NOME_RECIBO.test(estado.recibo),
    "Ponteiro inválido.",
  );
  const reciboPin = arquivoJson(`${pin}/${estado.recibo}`);
  const recibo = validarRecibo(reciboPin.dados);
  const membros = new Map([
    ["ponteiro.json", ponteiro.sha256],
    [estado.recibo, reciboPin.sha256],
    ...recibo.artefatos.map((a) => [a.nome, a.sha256]),
  ]);
  exigir(r.arquivos.length === membros.size, "Pin não cobre todos os membros.");
  for (const a of r.arquivos) {
    exigir(membros.has(a.nome) && membros.get(a.nome) === a.sha256, "Membro divergente no pin.");
    membros.delete(a.nome);
  }
  exigir(
    arquivoJson(`${p.estado}/ultimo-backup.json`).sha256 === ponteiro.sha256 &&
      arquivoJson(`${p.estado}/recibos/${estado.recibo}`).sha256 === reciboPin.sha256 &&
      arquivoJson(`${p.backups}/banco/${estado.recibo}`).sha256 === reciboPin.sha256,
    "Pin diverge do ponteiro ou catálogo atuais.",
  );
  const dump = dumpDoRecibo(recibo);
  const ambiente = recibo.artefatos.find(
    (a) => a.nome === `${recibo.base}-ambiente.env.${recibo.criptografia}`,
  );
  const { dados: intencao } = arquivoJson(`${p.dados}/journal/${operacao}/intencao.json`);
  const inicio = instante(intencao.em),
    em = instante(recibo.em);
  exigir(
    intencao.versao === 1 &&
      intencao.operacao === operacao &&
      intencao.acao === "atualizar" &&
      intencao.migracoesAuto === true &&
      intencao.alvo === p.alvo &&
      intencao.snapshot === p.manifestoSha256 &&
      inicio >= registro.em &&
      em >= inicio &&
      em <= agora &&
      mesmoEscopo(recibo, escopo) &&
      recibo.origem?.operacao === operacao &&
      camposBancoPreMigracao.every((k) => recibo.origem[k] === bancoPreMigracao[k]) &&
      estado.recibo === `${recibo.base}.confirmado.json` &&
      estado.recibo !== registro.r.recibo &&
      dump.sha256 !== registro.r.sha256 &&
      estado.modo === "compose" &&
      estado.em === recibo.em &&
      estado.verificadoRemoto === true &&
      estado.schema === escopo.schema &&
      estado.remoto === escopo.remoto &&
      estado.criptografia === escopo.criptografia &&
      estado.arquivo === dump.nome &&
      estado.sha256 === dump.sha256 &&
      estado.ambiente === (ambiente?.nome ?? "") &&
      estado.ambienteSha256 === (ambiente?.sha256 ?? ""),
    "Backup novo não corresponde ao ensaio e à intenção.",
  );
  const membrosPin = conferirArtefatosProtegidos(pin, recibo);
  conferirArtefatosProtegidos(`${p.backups}/banco`, recibo);
  return [
    ...membrosPin,
    { nome: estado.recibo, sha256: reciboPin.sha256, tamanho: reciboPin.tamanho },
  ];
}

async function conferirBytesRemotos(args, opcoes, membro) {
  const filho = spawn("rclone", args, {
    ...opcoes,
    stdio: ["ignore", "pipe", "ignore"],
  });
  let erro = false;
  filho.once("error", () => {
    erro = true;
  });
  const fim = new Promise((resolve) =>
    filho.once("close", (codigo, sinal) => resolve({ codigo, sinal })),
  );
  const sha = createHash("sha256");
  let lidos = 0;
  try {
    for await (const bytes of filho.stdout) {
      lidos += bytes.length;
      exigir(lidos <= membro.tamanho, "Objeto remoto maior que o pin.");
      sha.update(bytes);
    }
    const { codigo, sinal } = await fim;
    exigir(
      !erro &&
        !sinal &&
        codigo === 0 &&
        lidos === membro.tamanho &&
        sha.digest("hex") === membro.sha256,
      "Objeto remoto incompleto ou divergente.",
    );
  } finally {
    if (filho.exitCode === null && filho.signalCode === null) filho.kill("SIGKILL");
    await fim;
  }
}

async function confirmarRemoto(p, env, remoto, membros) {
  const config = bytesProtegidos(env.BACKUP_RCLONE_CONFIG, false, 0o037);
  const segundos = env.BACKUP_TIMEOUT_DUMP_SEGUNDOS || "3600";
  exigir(/^[1-9][0-9]{0,4}$/.test(segundos) && Number(segundos) <= 86400, "Prazo remoto inválido.");
  const limite = performance.now() + Number(segundos) * 1000;
  const privado = fs.mkdtempSync(`${p.dados}/conferir-remoto-`);
  try {
    // O rclone pode atualizar o token mesmo numa consulta. Não regravar a configuração adotada.
    const caminho = `${privado}/rclone.conf`;
    fs.writeFileSync(caminho, config, { mode: 0o600, flag: "wx" });
    const ambiente = {
      PATH: p.path,
      HOME: privado,
      TMPDIR: privado,
      RCLONE_CONFIG: caminho,
      ...(env.RCLONE_CONFIG_PASS ? { RCLONE_CONFIG_PASS: env.RCLONE_CONFIG_PASS } : {}),
    };
    const opcoes = () => {
      const timeout = Math.floor(limite - performance.now());
      exigir(timeout > 0, "Prazo total da leitura remota esgotado.");
      return { env: ambiente, timeout, killSignal: "SIGKILL" };
    };
    const flags = [
      "--retries",
      "1",
      "--low-level-retries",
      "1",
      "--contimeout",
      "10s",
      "--timeout",
      "30s",
    ];
    for (const membro of membros) {
      const alvo = `${remoto.replace(/\/$/, "")}/${membro.nome}`;
      const stat = spawnSync("rclone", ["lsjson", "--stat", ...flags, "--", alvo], {
        ...opcoes(),
        encoding: "utf8",
        maxBuffer: LIMITE_METADADO,
        stdio: ["ignore", "pipe", "ignore"],
      });
      exigir(!stat.error && !stat.signal && stat.status === 0, "Metadado remoto indisponível.");
      const item = JSON.parse(stat.stdout);
      exigir(
        item?.IsDir === false && item.Name === membro.nome && item.Size === membro.tamanho,
        "Tipo, nome ou tamanho remoto divergente.",
      );
      // Um byte além do esperado distingue o objeto exato de um prefixo igual.
      await conferirBytesRemotos(
        ["cat", "--count", String(membro.tamanho + 1), ...flags, "--", alvo],
        opcoes(),
        membro,
      );
    }
  } finally {
    fs.rmSync(privado, { recursive: true, force: true });
  }
}

async function principal(args) {
  const [acao, perfil, observadoJson, operacao, digest] = args;
  const confirmar = acao === "confirmar";
  exigir(
    (acao === "verificar" && args.length === 3) ||
      (confirmar && args.length === 5 && OPERACAO.test(operacao) && SHA256.test(digest)),
    "Argumentos da verificação de recuperabilidade inválidos.",
  );
  const [p, env] = erroDeEtapa("Controlador ativo e trava herdada obrigatórios.", () => {
    exigir(process.getuid() === 0, "Entrada administrativa obrigatória.");
    const p = autorizar(perfil, "atualizar");
    exigir(
      fileURLToPath(import.meta.url) ===
        `${p.snapshot}/scripts/servidor/recuperacao-migracoes-auto.mjs` &&
        (confirmar
          ? process.env.SERVIDOR_CONTROLADOR_OPERACAO === operacao &&
            process.env.SERVIDOR_CONTROLADOR_ACAO === "atualizar"
          : !process.env.SERVIDOR_CONTROLADOR_OPERACAO &&
            OPERACAO.test(process.env.SERVIDOR_CONTROLADOR_PREPARACAO ?? "")),
      "Contexto da atualização não comprovado.",
    );
    return [p, lerAmbiente(p)];
  });
  const [escopo, bancoPreMigracao] = erroDeEtapa(
    "Autoridade atual do backup não comprovada.",
    () => {
      const observado = JSON.parse(observadoJson);
      if (confirmar) validarBancoPreMigracao(observado);
      // O registro histórico continua separado da observação física do dump novo.
      const { cluster, banco, schema } = observado;
      return [autoridade(p, env, confirmar ? { cluster, banco, schema } : observado), observado];
    },
  );
  const agora = Date.now();
  const registro = verificarRegistro(p, escopo, digest, agora);
  if (confirmar) {
    const membros = erroDeEtapa(
      "Pin ou backup novo não corresponde ao catálogo, ao ensaio e à intenção.",
      () => confirmarBackup(p, escopo, bancoPreMigracao, registro, operacao, agora),
    );
    try {
      await confirmarRemoto(p, env, escopo.remoto, membros);
    } catch {
      throw new Error("Cópia remota atual do backup fixado indisponível ou divergente.");
    }
  } else process.stdout.write(`${registro.sha256}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await principal(process.argv.slice(2));
  } catch (e) {
    console.error(`[recuperação] ${e.message}`);
    process.exitCode = 78;
  }
}
