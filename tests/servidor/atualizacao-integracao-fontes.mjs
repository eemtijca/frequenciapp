// Constrói fontes Git sintéticas e confere inventário, modos e relocação finita.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { exigir, hash, iguais, fixar } from "./atualizacao-integracao-receitas.mjs";

export const PUBLICOS = Object.freeze([
  "scripts/servidor/instalar-controlador.sh",
  "scripts/servidor/atualizar.sh",
  "scripts/servidor/backup-banco.sh",
  "scripts/servidor/comum.sh",
  "scripts/servidor/identidade.sh",
  "scripts/servidor/identidade.mjs",
  "scripts/servidor/recibos.mjs",
  "scripts/servidor/backup-recibos.mjs",
  "scripts/servidor/dropbox-retencao.mjs",
  "scripts/servidor/dropbox-api.mjs",
  "scripts/servidor/dropbox-estado.mjs",
  "scripts/servidor/controlador/cli.mjs",
  "scripts/servidor/controlador/contrato.mjs",
  "scripts/servidor/controlador/cron.mjs",
  "scripts/servidor/controlador/trancar.sh",
  "docker/app/migrar.mjs",
]);
export const AMBIENTE = Object.freeze({
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: "/scratch",
  TMPDIR: "/scratch",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_ALLOW_PROTOCOL: "file",
});
export function gravar(n, b, modo = 0o600) {
  fs.mkdirSync(path.dirname(n), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(
    n,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    modo,
  );
  try {
    fs.writeFileSync(fd, b);
    fs.fchmodSync(fd, modo);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const d = fs.openSync(path.dirname(n), fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(d);
  } finally {
    fs.closeSync(d);
  }
}
export function git(raiz, args) {
  const r = spawnSync("/usr/bin/git", ["-C", raiz, ...args], {
    env: AMBIENTE,
    maxBuffer: 4 * 1024 * 1024,
  });
  exigir(!r.error && !r.signal && r.status === 0, "GIT");
  return r.stdout.toString().trim();
}
export function inventario(raiz) {
  const r = {};
  function visitar(rel) {
    const n = path.join(raiz, rel),
      s = fs.lstatSync(n);
    exigir(!s.isSymbolicLink() && s.uid === 0 && (s.mode & 0o022) === 0, "FONTE");
    if (s.isDirectory())
      for (const filho of fs.readdirSync(n).sort()) {
        if (filho !== ".git") visitar(path.join(rel, filho));
      }
    // O Git fixa 100644/100755; a umask administrativa pode retirar apenas leitura.
    else {
      exigir(
        s.isFile() && s.nlink === 1 && [0o600, 0o644, 0o700, 0o755].includes(s.mode & 0o777),
        "FONTE",
      );
      r[rel] = {
        tipo: "arquivo",
        modo: s.mode & 0o111 ? 0o755 : 0o644,
        sha256: hash(fs.readFileSync(n)),
      };
    }
  }
  visitar("");
  return r;
}
export function conferirFonte(raiz, esperado) {
  exigir(iguais(inventario(raiz), esperado), "CONTEXTO");
}
export function prepararFontes(raiz, origem = "/repo") {
  fs.mkdirSync(raiz, { mode: 0o700 });
  const fonte = `${raiz}/fonte`,
    app = `${raiz}/app`,
    host = `${raiz}/host-simulado`;
  for (const n of PUBLICOS)
    gravar(`${fonte}/${n}`, fs.readFileSync(`${origem}/${n}`), n.endsWith(".sh") ? 0o700 : 0o600);
  fs.mkdirSync(app, { mode: 0o700 });
  const compose =
    "# Snapshot operacional sintético, sem bind de dados.\nservices:\n  app:\n    image: ${APP_IMAGEM}\n  db:\n    image: postgres:17-bookworm\n    volumes: [dados:/var/lib/postgresql/data]\n  caddy:\n    image: sintese/proxy:fixo\nvolumes:\n  dados: {}\n";
  gravar(`${app}/compose.yml`, compose);
  gravar(
    `${app}/Dockerfile`,
    "# Contexto público sintético.\nARG BASE\nFROM ${BASE}\nARG COMMIT_SHA\nLABEL org.opencontainers.image.revision=$COMMIT_SHA\nCOPY docker/app/migrar.mjs /app/docker/app/migrar.mjs\n",
  );
  gravar(`${app}/docker/app/migrar.mjs`, fs.readFileSync(`${fonte}/docker/app/migrar.mjs`));
  gravar(
    `${app}/prisma/migrations/0001/migration.sql`,
    "-- Migração sintética idêntica entre A e B.\nSELECT 1;\n",
  );
  gravar(`${app}/versao.txt`, "A\n");
  for (const n of Object.keys(inventario(app))) fs.chmodSync(`${app}/${n}`, 0o644);
  git(app, ["init", "-q", "-b", "main"]);
  git(app, ["config", "user.name", "Ensaio"]);
  git(app, ["config", "user.email", "ensaio@example.invalid"]);
  git(app, ["add", "."]);
  git(app, ["commit", "-qm", "fonte A"]);
  const A = git(app, ["rev-parse", "HEAD"]),
    invA = inventario(app);
  fs.writeFileSync(`${app}/versao.txt`, "B\n");
  // Um Compose do alvo diferente prova que não é escolhido como -f operacional.
  fs.writeFileSync(
    `${app}/compose.yml`,
    "# Não pode ser adotado automaticamente do B.\nservices: {}\n",
  );
  git(app, ["add", "."]);
  git(app, ["commit", "-qm", "fonte B"]);
  const B = git(app, ["rev-parse", "HEAD"]),
    invB = inventario(app);
  git(app, ["clone", "--quiet", "--bare", app, `${raiz}/remoto.git`]);
  git(app, ["remote", "add", "origin", `${raiz}/remoto.git`]);
  git(app, ["update-ref", "refs/remotes/origin/main", B]);
  fs.mkdirSync(host, { mode: 0o700 });
  for (const [letra, commit, inv] of [
    ["A", A, invA],
    ["B", B, invB],
  ]) {
    const dest = `${host}/${letra}`;
    fs.mkdirSync(dest, { mode: 0o700 });
    for (const [n, met] of Object.entries(inv)) {
      const r = spawnSync("/usr/bin/git", ["-C", app, "show", `${commit}:${n}`], { env: AMBIENTE });
      exigir(r.status === 0 && !r.error && !r.signal, "GIT");
      gravar(`${dest}/${n}`, r.stdout, met.modo);
    }
    conferirFonte(dest, inv);
  }
  git(app, ["checkout", "-q", "--detach", A]);
  conferirFonte(app, invA);
  const publico = Object.fromEntries(
    PUBLICOS.map((n) => [n, hash(fs.readFileSync(`${fonte}/${n}`))]),
  );
  const operacionalSha256 = hash(JSON.stringify(publico) + hash(compose));
  const revisoes = Object.fromEntries(
    [
      ["A", A, invA],
      ["B", B, invB],
    ].map(([letra, commit, inv]) => [
      letra,
      {
        commit,
        contextoSha256: hash(JSON.stringify(inv)),
        imagem: `ensaio/app:main-${commit.slice(0, 12)}`,
      },
    ]),
  );
  return fixar({
    versao: 1,
    rodada: path.basename(raiz),
    projeto: "adaptador-coeso",
    revisoes,
    operacionalSha256,
    migradorSha256: publico["docker/app/migrar.mjs"],
    banco: "frequencia",
    usuario: "frequencia",
    schema: "public",
    vertical: {
      raiz,
      fonte,
      app,
      host,
      config: `${raiz}/config`,
      prefixo: `${raiz}/controlador`,
      bin: `${raiz}/bin`,
      socket: `${raiz}/canal/supervisor.sock`,
      inventarios: { A: invA, B: invB },
      publico,
      composeSha256: hash(compose),
      baseTag: "frequenciapp-tools:adaptador-age-ed7ae32440d34d11",
      baseId: "sha256:88068f1a909d71470fc113e4afb62cb2e64e1b6f7a117c4791f7d9e484fb5564",
    },
  });
}
export function raizCompose(m, n, revisao) {
  const v = m.vertical;
  exigir(
    n === v.app ||
      new RegExp(`^${v.prefixo}/dados/frequenciapp-atualizacao\\.[A-Za-z0-9]{6}/worktree$`).test(n),
    "RELOCACAO",
  );
  exigir(
    fs.realpathSync(n) === n && git(n, ["rev-parse", "HEAD"]) === m.revisoes[revisao].commit,
    "COMMIT",
  );
  conferirFonte(n, v.inventarios[revisao]);
  return `${v.host}/${revisao}`;
}
