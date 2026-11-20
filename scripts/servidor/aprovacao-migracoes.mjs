// Prepara e confere a autorização de uma atualização agendada com migrações.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const raiz = "prisma/migrations/";
const sha = /^[0-9a-f]{40}$/;
const caminho = /^prisma\/migrations\/[0-9]{14}_[a-z0-9_]+\/migration\.sql$/;
const arquivo = "aprovacao-migracoes.json";

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function git(repo, ...args) {
  const r = spawnSync("git", ["--no-replace-objects", "-C", repo, ...args], {
    timeout: 35000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  exigir(r.status === 0, "Não foi possível conferir as referências ou os objetos Git.");
  return r.stdout;
}

function migracoes(repo, base, alvo) {
  exigir(
    typeof base === "string" &&
      typeof alvo === "string" &&
      sha.test(base) &&
      sha.test(alvo) &&
      base !== alvo,
    "Informe os dois commits completos e distintos.",
  );
  git(repo, "merge-base", "--is-ancestor", base, alvo);
  const mudancas = git(repo, "diff", "--name-status", "-z", "--no-renames", base, alvo, "--", raiz)
    .toString("utf8")
    .split("\0");
  exigir(
    mudancas.pop() === "" && mudancas.length > 0 && mudancas.length % 2 === 0,
    "Nenhuma migração nova foi encontrada.",
  );
  const registros = [];
  for (let i = 0; i < mudancas.length; i += 2) {
    const nome = mudancas[i + 1];
    exigir(
      mudancas[i] === "A" && caminho.test(nome),
      "Somente novos arquivos migration.sql podem ser aprovados para o cron.",
    );
    const metadado = git(repo, "ls-tree", alvo, "--", nome).toString("utf8");
    exigir(
      /^100644 blob [0-9a-f]{40}\t/.test(metadado),
      "O arquivo de migração precisa ser regular e não executável.",
    );
    const conteudo = git(repo, "cat-file", "blob", `${alvo}:${nome}`);
    registros.push({ caminho: nome, sha256: createHash("sha256").update(conteudo).digest("hex") });
  }
  return registros.sort((a, b) => a.caminho.localeCompare(b.caminho, "en"));
}

function instante(valor) {
  exigir(
    typeof valor === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(valor),
    "Use data e hora UTC no formato AAAA-MM-DDTHH:MM:SSZ.",
  );
  const data = new Date(valor);
  exigir(
    Number.isFinite(+data) && data.toISOString() === valor.replace(/Z$/, ".000Z"),
    "Data inválida.",
  );
  return +data;
}

function manifesto(repo, base, alvo, inicio, fim) {
  const inicioMs = instante(inicio);
  const fimMs = instante(fim);
  exigir(
    inicioMs < fimMs && fimMs > Date.now() && fimMs - inicioMs <= 86400000,
    "A janela deve ter até 24 horas e não pode estar vencida.",
  );
  return { versao: 1, base, alvo, inicio, fim, migracoes: migracoes(repo, base, alvo) };
}

function verificarHistorico(repo, base) {
  exigir(sha.test(base), "Revisão instalada inválida.");
  const esperadas = new Map();
  for (const item of git(repo, "ls-tree", "-r", "--full-tree", "-z", base, "--", raiz)
    .toString()
    .split("\0")) {
    const [metadado, nome] = item.split("\t");
    if (!nome?.endsWith("/migration.sql")) continue;
    exigir(
      /^100644 blob [0-9a-f]{40}$/.test(metadado) && caminho.test(nome),
      "Arquivo do histórico Git inesperado.",
    );
    esperadas.set(
      nome.split("/")[2],
      createHash("sha256")
        .update(git(repo, "cat-file", "blob", `${base}:${nome}`))
        .digest("hex"),
    );
  }
  const registros = JSON.parse(readFileSync(0, "utf8"));
  exigir(
    Array.isArray(registros) && registros.length === esperadas.size,
    "O histórico do banco não corresponde à base instalada.",
  );
  for (const registro of registros) {
    const [nome, digest, completo] = registro;
    exigir(
      completo === true && esperadas.get(nome) === digest && esperadas.delete(nome),
      "O histórico do banco não corresponde à base instalada.",
    );
  }
}

function protegido(pasta) {
  const estado = lstatSync(pasta);
  const uid = process.getuid();
  exigir(
    estado.isDirectory() && estado.uid === uid && (estado.mode & 0o022) === 0,
    "Diretório de estado sem proteção ou com dono divergente.",
  );
  const fd = openSync(
    join(pasta, arquivo),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const st = fstatSync(fd);
    exigir(
      st.isFile() &&
        st.uid === uid &&
        (st.mode & 0o777) === 0o600 &&
        st.nlink === 1 &&
        st.size <= 65536,
      "Use um arquivo regular de aprovação com dono do processo e modo 600.",
    );
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally {
    closeSync(fd);
  }
}

function verificar(acao, repo, pasta, base, alvo, remoto) {
  const conf = protegido(pasta);
  exigir(
    conf && conf.versao === 1 && conf.base === base && conf.alvo === alvo,
    "A aprovação não corresponde à revisão implantada e à revisão candidata.",
  );
  const esperado = manifesto(repo, base, alvo, conf.inicio, conf.fim);
  exigir(
    Object.keys(conf).length === Object.keys(esperado).length &&
      Array.isArray(conf.migracoes) &&
      conf.migracoes.length === esperado.migracoes.length &&
      esperado.migracoes.every(({ caminho: nome, sha256 }, i) => {
        const item = conf.migracoes[i];
        return (
          item && Object.keys(item).length === 2 && item.caminho === nome && item.sha256 === sha256
        );
      }),
    "A lista ou o SHA-256 das migrações diverge da aprovação.",
  );
  exigir(
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(remoto),
    "O remoto precisa ser um nome Git configurado.",
  );
  const ponta =
    acao === "simular"
      ? git(repo, "rev-parse", `refs/remotes/${remoto}/main`).toString().trim()
      : git(repo, "ls-remote", "--exit-code", "--refs", remoto, "refs/heads/main")
          .toString()
          .trim()
          .split("\t")[0];
  exigir(ponta === alvo, "A main não corresponde ao commit aprovado.");
  const agora = Date.now();
  exigir(
    instante(conf.inicio) <= agora && agora < instante(conf.fim),
    "A aprovação não está na janela autorizada.",
  );
  const usado = join(pasta, `aprovacao-migracoes-${alvo}.usada.json`);
  let existe = true;
  try {
    lstatSync(usado);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    existe = false;
  }
  exigir(
    !existe,
    "A aprovação para este commit já foi usada; revise o estado antes de tentar de novo.",
  );
  if (acao === "consumir") {
    const fd = openSync(usado, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify({ ...esperado, uso: new Date().toISOString() })}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const d = openSync(pasta, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      fsyncSync(d);
    } finally {
      closeSync(d);
    }
  }
}

const [acao, ...args] = process.argv.slice(2);
try {
  if (acao === "historico") {
    exigir(args.length === 2, "Argumentos do histórico inválidos.");
    verificarHistorico(...args);
  } else if (acao === "preparar") {
    exigir(args.length === 5, "Argumentos de aprovação inválidos.");
    console.log(JSON.stringify(manifesto(...args), null, 2));
  } else {
    exigir(args.length === 5, "Argumentos de aprovação inválidos.");
    exigir(["simular", "verificar", "consumir"].includes(acao), "Ação de aprovação desconhecida.");
    verificar(acao, ...args);
  }
} catch (erro) {
  const mensagem =
    erro.code || erro instanceof SyntaxError
      ? "Arquivo de aprovação ausente, inacessível ou inválido."
      : erro.message;
  console.error(`[aprovação] ${mensagem}`);
  process.exitCode = 1;
}
