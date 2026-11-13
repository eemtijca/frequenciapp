// Publica seletores e cron sob a mesma trava, com geração revogada e replay durável restrito.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  exigir,
  protegido,
  perfil,
  json,
  hash,
  exclusivo,
  sincronizar,
  lerAmbiente,
  verificarJournal,
  verificarPin,
  retomadaRotinas,
  atualizarSeletores,
  configuracaoRotinas,
} from "./contrato.mjs";
import { gerarRotinas } from "./cron.mjs";

const aqui = import.meta.dirname;
const serializar = (valor) => Buffer.from(JSON.stringify(valor) + "\n");
const existe = (nome) => Boolean(fs.lstatSync(nome, { throwIfNoEntry: false }));
function ler(nome, privado = false) {
  protegido(nome, "arquivo", privado);
  return fs.readFileSync(nome);
}
function integridade(p, operacao = "") {
  verificarJournal(p, operacao);
  protegido(`${p.dados}/pins`, "diretorio", true);
  for (const n of fs.readdirSync(`${p.dados}/pins`)) verificarPin(p, n);
  exigir(
    !existe(`${p.estado}/atualizacao-em-andamento.json`),
    "Atualização em andamento bloqueia reconfiguração.",
  );
}
function conferirIdentidade(p) {
  const env = lerAmbiente(p);
  env.COMPOSE_ARQUIVOS = p.compose.join(":");
  const r = spawnSync(
    "/bin/bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      'set -Eeuo pipefail; . "$1"; montar_compose; conferir_identidade conferir; [ "$SERVIDOR_ALVO_CHAVE" = "$2" ]',
      "identidade",
      `${p.snapshot}/scripts/servidor/comum.sh`,
      p.alvo,
    ],
    { env, encoding: "utf8" },
  );
  exigir(
    !r.error && !r.signal && r.status === 0,
    "Identidade Compose efetiva não confere; reconfiguração recusada.",
  );
}
function reconhecer(p, destino, adotar) {
  protegido(destino, "diretorio");
  for (const n of ["cron.d", "logrotate.d"]) protegido(`${destino}/${n}`, "diretorio");
  const cron = ler(`${destino}/cron.d/frequenciapp`),
    logrotate = ler(`${destino}/logrotate.d/frequenciapp`);
  if (existe(`${p.dados}/rotinas.json`)) {
    const r = json(`${p.dados}/rotinas.json`);
    exigir(
      r.versao === 1 &&
        r.alvo === p.alvo &&
        r.destino === destino &&
        r.cronSha256 === hash(cron) &&
        r.logrotateSha256 === hash(logrotate),
      "Cron ou logrotate não correspondem ao recibo adotado.",
    );
  } else {
    const previsto = gerarRotinas(p);
    exigir(adotar === hash(cron), "Cron legado exige --adotar-cron-sha256 com o hash exato.");
    exigir(logrotate.equals(Buffer.from(previsto.logrotate)), "Logrotate legado não reconhecido.");
  }
  return { cron, logrotate };
}
function gerarSnapshot(p, operacao) {
  const base = `${p.prefixo}/geracoes`;
  if (!existe(base)) {
    fs.mkdirSync(base, { mode: 0o700 });
    sincronizar(p.prefixo);
  }
  protegido(base, "diretorio", true);
  const snapshot = `${base}/${operacao}`;
  fs.mkdirSync(snapshot, { mode: 0o700 });
  sincronizar(base);
  const membros = json(`${p.snapshot}/manifesto.json`),
    manifesto = {};
  for (const n of [
    "cli.mjs",
    "contrato.mjs",
    "cron.mjs",
    "trancar.sh",
    "retencao.sh",
    "reconfigurar.mjs",
  ])
    membros[`scripts/servidor/controlador/${n}`] = null;
  for (const nome of Object.keys(membros)) {
    const atualizado = nome.startsWith("scripts/servidor/controlador/");
    const origem = atualizado ? `${aqui}/${path.basename(nome)}` : `${p.snapshot}/${nome}`;
    const bytes = ler(origem);
    const dir = path.dirname(`${snapshot}/${nome}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    exclusivo(`${snapshot}/${nome}`, bytes);
    if (nome.endsWith(".sh")) {
      fs.chmodSync(`${snapshot}/${nome}`, 0o700);
      sincronizar(`${snapshot}/${nome}`);
    }
    manifesto[nome] = hash(bytes);
  }
  exclusivo(`${snapshot}/manifesto.json`, manifesto);
  // Sincroniza também os pais criados recursivamente antes de referenciar a geração.
  const sincronizarArvore = (dir) => {
    for (const n of fs.readdirSync(dir))
      if (fs.lstatSync(`${dir}/${n}`).isDirectory()) sincronizarArvore(`${dir}/${n}`);
    sincronizar(dir);
  };
  sincronizarArvore(snapshot);
  sincronizar(base);
  return { snapshot, manifestoSha256: hash(ler(`${snapshot}/manifesto.json`, true)) };
}
function entrada(p) {
  return Buffer.from(
    `#!/bin/sh\n# Entrada fixa: não carrega ambiente do chamador.\nexec /usr/bin/env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin ${p.node} ${p.snapshot}/scripts/servidor/controlador/cli.mjs executar ${p.prefixo}/perfil.json "$@"\n`,
  );
}
function registro(caminho, depois, modo) {
  const antes = existe(caminho) ? ler(caminho, modo === 0o600) : null;
  return {
    caminho,
    modo,
    antes: antes?.toString("base64") ?? null,
    antesSha256: antes ? hash(antes) : null,
    depois: depois.toString("base64"),
    depoisSha256: hash(depois),
  };
}
function publicar(a, operacao) {
  const bytes = Buffer.from(a.depois, "base64");
  if (existe(a.caminho) && ler(a.caminho, a.modo === 0o600).equals(bytes)) {
    sincronizar(a.caminho);
    sincronizar(path.dirname(a.caminho));
    return;
  }
  const temporario = `${a.caminho}.rotinas-${operacao}.tmp`;
  if (existe(temporario))
    exigir(
      ler(temporario, a.modo === 0o600).equals(bytes),
      "Temporário não corresponde à publicação comprovada.",
    );
  else exclusivo(temporario, bytes);
  fs.chmodSync(temporario, a.modo);
  sincronizar(temporario);
  fs.renameSync(temporario, a.caminho);
  sincronizar(path.dirname(a.caminho));
  exigir(ler(a.caminho, a.modo === 0o600).equals(bytes), "Publicação não conferida.");
}
function opcoes(args) {
  let plano = false,
    confirmar = false,
    adotar = null;
  const vistas = new Set();
  while (args.length) {
    const n = args.shift();
    exigir(!vistas.has(n), "Opção repetida.");
    vistas.add(n);
    if (n === "--plano") plano = true;
    else if (n === "--confirmar") confirmar = true;
    else if (n === "--adotar-cron-sha256") adotar = args.shift();
    else throw new Error("Opção de reconfiguração desconhecida.");
  }
  exigir(plano !== confirmar, "Escolher --plano ou --confirmar.");
  exigir(adotar === null || /^[a-f0-9]{64}$/.test(adotar), "Hash de adoção do cron inválido.");
  return { plano, adotar };
}
export function reconfigurarRotinas(arquivo, args) {
  exigir(process.getuid() === 0, "Reconfiguração exige entrada administrativa.");
  const { plano, adotar } = opcoes([...args]);
  const raw = fs.readFileSync(0);
  exigir(raw.length <= 65536, "Pedido de reconfiguração excede o limite.");
  const pedido = JSON.parse(raw);
  exigir(
    pedido && Object.keys(pedido).every((n) => ["seletores", "destino"].includes(n)),
    "Pedido de reconfiguração contém campos desconhecidos.",
  );
  atualizarSeletores(Buffer.alloc(0), pedido.seletores);
  const destino = pedido.destino ?? "/etc";
  let retomada = retomadaRotinas(arquivo);
  let p = retomada?.p ?? perfil(arquivo);
  integridade(p, retomada?.operacao);
  conferirIdentidade(p);
  if (retomada)
    exigir(
      retomada.i.destino === destino &&
        JSON.stringify(retomada.i.seletores) === JSON.stringify(pedido.seletores),
      "Retomada exige as mesmas escolhas da intenção durável.",
    );
  else reconhecer(p, destino, adotar);
  const lock = `${p.locks}/operacoes-${p.alvo}.lock`;
  if (existe(lock)) protegido(lock, "arquivo", true);
  const fd = fs.openSync(
    lock,
    fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW,
    0o600,
  );
  const stdio = ["ignore", "pipe", "pipe"];
  while (stdio.length <= fd) stdio.push("ignore");
  stdio[fd] = fd;
  try {
    const r = spawnSync("/usr/bin/flock", ["-n", String(fd)], { stdio });
    exigir(
      !r.error && !r.signal && r.status === 0,
      "Trava física ocupada; reconfiguração recusada.",
    );
    const s = fs.fstatSync(fd),
      atual = protegido(lock, "arquivo", true);
    exigir(s.dev === atual.dev && s.ino === atual.ino, "Trava física mudou.");
    // Nenhum dado pré-trava confere autoridade depois de adquiri-la.
    retomada = retomadaRotinas(arquivo);
    p = retomada?.p ?? perfil(arquivo);
    integridade(p, retomada?.operacao);
    conferirIdentidade(p);
    let rotinas;
    if (retomada)
      exigir(
        retomada.i.destino === destino &&
          JSON.stringify(retomada.i.seletores) === JSON.stringify(pedido.seletores),
        "Retomada exige as mesmas escolhas da intenção durável.",
      );
    else rotinas = reconhecer(p, destino, adotar);
    const app = atualizarSeletores(ler(p.appEnv, true), pedido.seletores),
      ops = atualizarSeletores(ler(p.opsEnv, true), pedido.seletores);
    const desejado = gerarRotinas(p, { ...lerAmbiente(p), ...pedido.seletores });
    const configCaminho = `${p.config}/instalador.json`;
    const configAntes = existe(configCaminho) ? ler(configCaminho, true) : null;
    const configDepois = configuracaoRotinas(configAntes, pedido.seletores);
    const semMudancas =
      !retomada &&
      p.versao === 2 &&
      app.equals(ler(p.appEnv, true)) &&
      ops.equals(ler(p.opsEnv, true)) &&
      configAntes?.equals(configDepois) &&
      rotinas.cron.equals(Buffer.from(desejado.cron)) &&
      rotinas.logrotate.equals(Buffer.from(desejado.logrotate));
    if (plano || semMudancas) {
      console.log(
        JSON.stringify({
          plano,
          semMudancas,
          retomada: Boolean(retomada),
          seletores: pedido.seletores,
          cronSha256: hash(Buffer.from(desejado.cron)),
        }),
      );
      return;
    }
    if (!retomada) {
      const operacao = randomUUID();
      const geracao = gerarSnapshot(p, operacao);
      const q = {
        ...p,
        versao: 2,
        snapshot: geracao.snapshot,
        compose: p.compose.map((n) => geracao.snapshot + n.slice(p.snapshot.length)),
        manifestoSha256: geracao.manifestoSha256,
        appEnvSha256: hash(app),
        opsEnvSha256: hash(ops),
        geracao: operacao,
      };
      const arquivos = [
        registro(p.appEnv, app, 0o600),
        registro(p.opsEnv, ops, 0o600),
        registro(arquivo, serializar(q), 0o600),
        registro(`${p.prefixo}/executar`, entrada(q), 0o700),
        registro(`${destino}/cron.d/frequenciapp`, Buffer.from(desejado.cron), 0o644),
        registro(`${destino}/logrotate.d/frequenciapp`, Buffer.from(desejado.logrotate), 0o644),
        registro(configCaminho, configDepois, 0o600),
        registro(
          `${p.dados}/rotinas.json`,
          serializar({
            versao: 1,
            alvo: p.alvo,
            destino,
            cronSha256: hash(Buffer.from(desejado.cron)),
            logrotateSha256: hash(Buffer.from(desejado.logrotate)),
          }),
          0o600,
        ),
      ];
      const pasta = `${p.dados}/journal/${operacao}`;
      fs.mkdirSync(pasta, { mode: 0o700 });
      sincronizar(`${p.dados}/journal`);
      exclusivo(`${pasta}/intencao.json`, {
        versao: 1,
        operacao,
        alvo: p.alvo,
        acao: "reconfigurar-rotinas",
        snapshot: p.manifestoSha256,
        em: new Date().toISOString(),
        destino,
        seletores: pedido.seletores,
        arquivos,
      });
      retomada = retomadaRotinas(arquivo);
    }
    for (const a of retomada.i.arquivos) {
      retomadaRotinas(arquivo);
      publicar(a, retomada.operacao);
    }
    const q = perfil(arquivo);
    integridade(q, retomada.operacao);
    conferirIdentidade(q);
    exclusivo(`${retomada.pasta}/concluida.json`, {
      versao: 1,
      operacao: retomada.operacao,
      alvo: q.alvo,
      intencaoSha256: hash(ler(`${retomada.pasta}/intencao.json`, true)),
      em: new Date().toISOString(),
      status: 0,
    });
    verificarJournal(q);
    console.log(
      JSON.stringify({
        reconfigurado: true,
        semMudancas: false,
        geracao: q.geracao,
        seletores: pedido.seletores,
      }),
    );
  } finally {
    fs.closeSync(fd);
  }
}
