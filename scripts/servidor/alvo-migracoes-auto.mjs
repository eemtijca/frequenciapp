// Confere a configuração Compose, os bytes da imagem e a base PostgreSQL da migração automática.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readSync, realpathSync } from "node:fs";
import { isIPv4 } from "node:net";
import { pathToFileURL } from "node:url";
import {
  identidadeDaConexao,
  resolverSchema,
  sqlHistoricoCompativel,
} from "../../src/infra/schema-postgres.mjs";
import { inventariarLoteAutomatico } from "./politica-migracoes-auto.mjs";

const pasta = "prisma/migrations";
const caminhoSql = /^prisma\/migrations\/[0-9]{14}_[a-z0-9_]{1,120}\/migration\.sql$/;
const lock = `${pasta}/migration_lock.toml`;
const scripts = [
  "docker/app/entrypoint.sh",
  "docker/app/migrar.mjs",
  "src/infra/schema-postgres.mjs",
];
const limiteEntrada = 1024 * 1024;
const maxMigracoes = 2048;
const idCompose = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const idBanco = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const idSchema = /^[a-z_][a-z0-9_]{0,62}$/;

function exigir(condicao) {
  if (!condicao) throw new Error();
}

function objeto(valor) {
  return valor && typeof valor === "object" && !Array.isArray(valor);
}

function identificador(padrao, valor) {
  return typeof valor === "string" && padrao.test(valor);
}

function schemaValido(schema) {
  return (
    identificador(idSchema, schema) && !schema.startsWith("pg_") && schema !== "information_schema"
  );
}

function semOpcoes(servico, chaves) {
  return chaves.every((chave) => {
    const v = servico[chave];
    return (
      v == null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (objeto(v) && Object.keys(v).length === 0)
    );
  });
}

function conferirUrl(url, db, banco, schema, usuario, schemaExplicito) {
  exigir(typeof url === "string" && url.length <= 4096 && !/[\s\p{Cc}\\]/u.test(url));
  const endereco = new URL(url);
  const identidade = identidadeDaConexao(url);
  const senha = decodeURIComponent(endereco.password);
  // host, options, service e outros parâmetros têm semânticas distintas nos clientes.
  exigir(
    !url.includes("#") && [...endereco.searchParams.keys()].every((chave) => chave === "schema"),
  );
  exigir(
    identidade.host === db &&
      identidade.port === "5432" &&
      identidade.database === banco &&
      decodeURIComponent(endereco.username) === usuario &&
      senha &&
      !/\p{Cc}/u.test(senha) &&
      identidade.schema === schema &&
      resolverSchema({ url, schemaExplicito }) === schema,
  );
}

function digestConfig(valor) {
  const ordenado = (v) => {
    if (Array.isArray(v)) return v.map(ordenado);
    if (!objeto(v)) return v;
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, ordenado(v[k])]),
    );
  };
  return createHash("sha256")
    .update(JSON.stringify(ordenado(valor)))
    .digest("hex");
}

function conferirCompose(
  config,
  app,
  db,
  banco,
  schema,
  imagem,
  envelope,
  diretorio,
  manual = false,
  ipManual,
) {
  exigir(identificador(idCompose, app) && identificador(idCompose, db) && app !== db);
  exigir(identificador(idBanco, banco) && schemaValido(schema));
  exigir(
    identificador(idCompose, config?.name) && objeto(config.services) && objeto(config.networks),
  );
  const aplicacao = config.services[app];
  const postgres = config.services[db];
  const amb = aplicacao?.environment;
  exigir(objeto(amb) && objeto(postgres?.environment));
  const usuario = postgres.environment.POSTGRES_USER;
  exigir(postgres.environment.POSTGRES_DB === banco && identificador(idBanco, usuario));
  exigir(amb.MIGRAR_NA_PARTIDA === "true");
  const modoAuto = !manual && imagem !== undefined;
  const partidaManual = manual && imagem !== undefined;
  exigir(
    [undefined, "", "false", ...(partidaManual ? ["true"] : [])].includes(
      amb.MIGRACAO_MANUAL_PROTEGIDA,
    ),
  );
  if (manual) {
    exigir([undefined, "", "false"].includes(amb.MIGRACAO_AUTOMATICA));
    if (partidaManual) {
      exigir(identificador(/^sha256:[0-9a-f]{64}$/, imagem) && aplicacao.image === imagem);
      exigir(amb.MIGRACAO_MANUAL_PROTEGIDA === "true" && amb.MIGRACAO_LOTE_APROVADO === envelope);
      exigir(identificador(/^[a-zA-Z0-9_-]{1,65536}$/, envelope) && diretorio?.startsWith("/"));
      // O entrypoint não pode criar contas na partida protegida.
      exigir(amb.ADMIN_EMAIL === "" && amb.ADMIN_SENHA === "");
    } else exigir([undefined, ""].includes(amb.MIGRACAO_LOTE_APROVADO));
  }
  exigir(
    (!modoAuto && aplicacao.restart === (manual && imagem ? "no" : "unless-stopped")) ||
      (modoAuto &&
        amb.MIGRACAO_AUTOMATICA === "true" &&
        aplicacao.restart === "no" &&
        identificador(/^sha256:[0-9a-f]{64}$/, imagem) &&
        aplicacao.image === imagem &&
        identificador(/^[a-zA-Z0-9_-]{1,65536}$/, envelope) &&
        amb.MIGRACAO_LOTE_APROVADO === envelope &&
        typeof diretorio === "string" &&
        diretorio.startsWith("/")),
  );
  exigir(
    amb.MIGRACAO_AUTOMATICA === undefined ||
      ["", "false", "true"].includes(amb.MIGRACAO_AUTOMATICA),
  );
  const alternativo = /^(?:PG|LD_|NODE_|BASH_ENV$|ENV$|PATH$|HOME$|IFS$)/;
  exigir(!Object.keys(amb).some((chave) => alternativo.test(chave)));
  exigir(!Object.keys(postgres.environment).some((chave) => alternativo.test(chave)));
  conferirUrl(amb.DATABASE_URL, db, banco, schema, usuario, amb.DATABASE_SCHEMA);
  conferirUrl(amb.DIRECT_URL, db, banco, schema, usuario, amb.DATABASE_SCHEMA);

  for (const servico of [aplicacao, postgres]) {
    exigir(servico.privileged !== true && objeto(servico.networks));
    exigir(
      semOpcoes(servico, [
        "network_mode",
        "links",
        "external_links",
        "dns",
        "dns_search",
        "dns_opt",
        "hostname",
        "domainname",
        "entrypoint",
        "working_dir",
        "container_name",
        "volumes_from",
        "configs",
        "secrets",
        "tmpfs",
        "env_file",
        "ports",
        "runtime",
        "cap_add",
        "devices",
      ]),
    );
  }
  exigir(semOpcoes(aplicacao, ["post_start", "pre_stop"]));
  if (modoAuto || partidaManual) {
    exigir(Array.isArray(aplicacao.volumes) && aplicacao.volumes.length === 1);
    const [mount] = aplicacao.volumes;
    exigir(
      mount?.type === "bind" &&
        mount.source === diretorio &&
        mount.target === "/run/frequenciapp-migracao" &&
        mount.read_only === true &&
        mount.bind?.create_host_path === false &&
        Object.keys(mount.bind).length === 1,
    );
  } else exigir(semOpcoes(aplicacao, ["volumes"]));
  exigir(semOpcoes(postgres, ["command", "post_start", "pre_stop"]));
  exigir(
    Array.isArray(aplicacao.command) &&
      aplicacao.command.length === 1 &&
      aplicacao.command[0] === "./docker/app/entrypoint.sh",
  );
  const redes = Object.keys(postgres.networks);
  exigir(redes.length === 1 && Object.hasOwn(aplicacao.networks, redes[0]));
  const rede = config.networks[redes[0]];
  exigir(rede?.internal === true);
  const nomes = new Set();
  const redesExternas = [];
  for (const chave of Object.keys(aplicacao.networks)) {
    const declarada = config.networks[chave];
    exigir(
      objeto(declarada) &&
        (declarada.driver === undefined || declarada.driver === "bridge") &&
        identificador(idCompose, declarada.name) &&
        !nomes.has(declarada.name),
    );
    if (declarada.external) {
      // Só a partida manual pode preservar uma rede de borda preexistente.
      // A rede interna que identifica o banco nunca pode ser externa.
      exigir(
        manual &&
          chave !== redes[0] &&
          declarada.external === true &&
          Object.keys(declarada).every((campo) => ["name", "external", "ipam"].includes(campo)) &&
          (declarada.ipam === undefined ||
            (objeto(declarada.ipam) && Object.keys(declarada.ipam).length === 0)),
      );
      redesExternas.push(declarada.name);
    }
    nomes.add(declarada.name);
  }
  exigir(semOpcoes(postgres, ["extra_hosts"]));
  if (partidaManual && redesExternas.length > 0) {
    // A mesma resolução local protege as conexões do migrador e do app.
    exigir(typeof ipManual === "string" && isIPv4(ipManual));
    exigir(
      (Array.isArray(aplicacao.extra_hosts) &&
        aplicacao.extra_hosts.length === 1 &&
        aplicacao.extra_hosts[0] === `${db}=${ipManual}`) ||
        (objeto(aplicacao.extra_hosts) &&
          Object.keys(aplicacao.extra_hosts).length === 1 &&
          aplicacao.extra_hosts[db] === ipManual),
    );
  } else exigir(ipManual === undefined && semOpcoes(aplicacao, ["extra_hosts"]));
  // Um alias em qualquer rede da aplicação poderia ganhar a resolução de db.
  for (const [nome, servico] of Object.entries(config.services)) {
    for (const [chave, ligacao] of Object.entries(servico.networks ?? {})) {
      if (!Object.hasOwn(aplicacao.networks, chave)) continue;
      exigir(ligacao == null || objeto(ligacao));
      const aliases = ligacao?.aliases ?? [];
      exigir(Array.isArray(aliases) && aliases.every((alias) => typeof alias === "string"));
      const podeResolver = (valor) =>
        typeof valor === "string" && valor.toLowerCase().replace(/\.$/, "") === db;
      exigir(nome === db || ![nome, servico.container_name, ...aliases].some(podeResolver));
    }
  }
  let topologia;
  if (manual) {
    const servico = { ...aplicacao, environment: { ...amb } };
    for (const chave of ["image", "build", "restart", "volumes"]) delete servico[chave];
    if (redesExternas.length > 0) delete servico.extra_hosts;
    for (const chave of [
      "COMMIT_SHA",
      "MIGRACAO_AUTOMATICA",
      "MIGRACAO_MANUAL_PROTEGIDA",
      "MIGRACAO_LOTE_APROVADO",
      "ADMIN_EMAIL",
      "ADMIN_SENHA",
    ])
      delete servico.environment[chave];
    topologia = digestConfig({
      app: servico,
      db: postgres,
      redes: config.networks,
      volumes: config.volumes,
    });
  }
  return {
    projeto: config.name,
    rede: rede.name,
    banco,
    schema,
    usuario,
    ...(manual ? { topologia } : {}),
    ...(redesExternas.length ? { redesApp: [...nomes].sort() } : {}),
  };
}

function git(repo, limite, ...args) {
  const r = spawnSync(
    "/usr/bin/git",
    ["--no-replace-objects", "--literal-pathspecs", "-C", repo, ...args],
    {
      timeout: 10000,
      maxBuffer: limite,
      env: {
        PATH: "/usr/bin:/bin",
        LC_ALL: "C",
        GIT_ALLOW_PROTOCOL: "",
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
    },
  );
  exigir(!r.error && r.status === 0);
  return r.stdout;
}

function arquivosGit(repo, revisao, incluirScripts) {
  exigir(identificador(/^[0-9a-f]{40}$/, revisao));
  exigir(git(repo, 64, "cat-file", "-t", revisao).toString() === "commit\n");
  const caminhos = incluirScripts ? [pasta, ...scripts] : [pasta];
  const arvore = git(
    repo,
    limiteEntrada,
    "ls-tree",
    "-rtz",
    "--full-tree",
    revisao,
    "--",
    ...caminhos,
  );
  const linhas = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    .decode(arvore)
    .split("\0");
  exigir(linhas.pop() === "");
  const arquivos = new Map();
  const pastas = new Set();
  for (const linha of linhas) {
    const m = /^(040000 tree|100644 blob|100755 blob) ([0-9a-f]{40})\t([a-zA-Z0-9_.\-/]+)$/.exec(
      linha,
    );
    exigir(m && m[0] === linha);
    const [, modo, oid, nome] = m;
    if (modo === "040000 tree") {
      if (caminhos.some((p) => p.startsWith(`${nome}/`)) || nome === pasta) continue;
      exigir(caminhoSql.test(`${nome}/migration.sql`));
      pastas.add(nome);
    } else {
      exigir(
        scripts.includes(nome) ||
          (modo === "100644 blob" && (nome === lock || caminhoSql.test(nome))),
      );
      arquivos.set(nome, oid);
    }
  }
  exigir(pastas.size > 0 && pastas.size <= maxMigracoes);
  for (const nome of pastas) exigir(arquivos.has(`${nome}/migration.sql`));
  if (incluirScripts) for (const nome of scripts) exigir(arquivos.has(nome));
  return new Map([...arquivos.entries()].sort(([a], [b]) => (a < b ? -1 : a === b ? 0 : 1)));
}

function hashesGit(repo, revisao, incluirScripts) {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  return new Map(
    [...arquivosGit(repo, revisao, incluirScripts)].map(([nome, oid]) => {
      const bytes = git(repo, limiteEntrada, "cat-file", "blob", oid);
      // O migrador lê UTF-8: não aceitar uma conversão que alteraria os bytes.
      if (caminhoSql.test(nome)) decoder.decode(bytes);
      return [nome, createHash("sha256").update(bytes).digest("hex")];
    }),
  );
}

// Serializada no modo sondar-imagem: deve usar apenas os imports locais abaixo.
async function sondarImagem(raiz) {
  const { constants } = await import("node:fs");
  const { lstat, open, readdir } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { join } = await import("node:path");
  const pasta = "prisma/migrations";
  const limite = 1024 * 1024;
  const saida = Object.create(null);
  async function diretorio(nome) {
    if (!(await lstat(join(raiz, nome))).isDirectory()) throw new Error();
  }
  async function arquivo(nome) {
    // NOFOLLOW e NONBLOCK impedem seguir links finais ou bloquear em FIFOs.
    const fp = await open(
      join(raiz, nome),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const st = await fp.stat();
      if (!st.isFile() || st.nlink !== 1 || st.size > limite) throw new Error();
      const bytes = Buffer.alloc(st.size + 1);
      let total = 0;
      while (total < bytes.length) {
        const { bytesRead } = await fp.read(bytes, total, bytes.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total !== st.size) throw new Error();
      saida[nome] = createHash("sha256").update(bytes.subarray(0, total)).digest("hex");
    } finally {
      await fp.close();
    }
  }
  for (const p of ["", "prisma", pasta, "docker", "docker/app", "src", "src/infra"])
    await diretorio(p);
  const entradas = await readdir(join(raiz, pasta));
  if (entradas.length === 0 || entradas.length > 2049) throw new Error();
  for (const nome of entradas) {
    const p = `${pasta}/${nome}`;
    if (nome === "migration_lock.toml") {
      await arquivo(p);
    } else {
      if (!/^[0-9]{14}_[a-z0-9_]{1,120}$/.test(nome)) throw new Error();
      await diretorio(p);
      const conteudo = await readdir(join(raiz, p));
      if (conteudo.length !== 1 || conteudo[0] !== "migration.sql") throw new Error();
      await arquivo(`${p}/migration.sql`);
    }
  }
  for (const p of [
    "docker/app/entrypoint.sh",
    "docker/app/migrar.mjs",
    "src/infra/schema-postgres.mjs",
  ])
    await arquivo(p);
  return { ...saida };
}

function conferirImagem(prova, repo, revisao, manual = false) {
  exigir(objeto(prova));
  const esperados = hashesGit(repo, revisao, true);
  exigir(Object.keys(prova).length === esperados.size);
  for (const [nome, hash] of esperados) exigir(Object.hasOwn(prova, nome) && prova[nome] === hash);
  if (manual) {
    // O alvo precisa executar o protocolo reconhecido pelo executor, não só
    // provar que sua imagem corresponde a fontes possivelmente legadas.
    for (const nome of scripts) {
      const local = readFileSync(new URL(`../../${nome}`, import.meta.url));
      exigir(createHash("sha256").update(local).digest("hex") === esperados.get(nome));
    }
  }
}

function sqlHistorico(schema, manual = false) {
  exigir(schemaValido(schema));
  // off induz erro em vez de aplicar uma política. Não desabilita RLS na tabela.
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
SET LOCAL row_security = off;
WITH estrutura AS MATERIALIZED (
  SELECT nspname, oid, ${sqlHistoricoCompativel} AS compativel
  FROM pg_catalog.pg_namespace n WHERE nspname = '${schema}'
), historico AS (
  SELECT migration_name, checksum, started_at,
    (rolled_back_at IS NULL AND finished_at IS NOT NULL AND finished_at >= started_at
      AND pg_catalog.isfinite(started_at) AND pg_catalog.isfinite(finished_at) AND applied_steps_count > 0
      AND count(*) OVER (PARTITION BY started_at) = 1) AS completa
  FROM ONLY "${schema}"._prisma_migrations
  ${manual ? "WHERE rolled_back_at IS NULL" : ""}
  LIMIT ${maxMigracoes + 1}
)
SELECT pg_catalog.json_build_object(
  'cluster', (SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
  'banco', current_database(),
  'bancoOid', (SELECT oid::text FROM pg_catalog.pg_database WHERE datname = current_database()),
  'schema', nspname,
  'schemaOid', oid::text,
  'usuario', current_user,
  'primario', NOT pg_catalog.pg_is_in_recovery(),
  ${manual ? "'inicio', EXTRACT(epoch FROM pg_catalog.pg_postmaster_start_time())::text," : ""}
  'gatilhos', EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger WHERE evtenabled <> 'D'),
  'historicoCompativel', compativel,
  'registros', CASE WHEN compativel THEN (
    SELECT coalesce(json_agg(json_build_array(migration_name, checksum, completa)
      ORDER BY started_at), '[]'::json) FROM historico
  ) ELSE '[]'::json END
)
FROM estrutura;
ROLLBACK;
`;
}

class EstruturaHistoricoIncompativel extends Error {}

function conferirHistorico(prova, repo, revisao, banco, schema, manual = false) {
  exigir(objeto(prova) && identificador(idBanco, banco) && schemaValido(schema));
  const { cluster, bancoOid, schemaOid, usuario, primario, gatilhos, registros } = prova;
  exigir(identificador(/^[1-9][0-9]{0,19}$/, cluster));
  exigir([bancoOid, schemaOid].every((oid) => identificador(/^[1-9][0-9]{0,9}$/, oid)));
  exigir(prova.banco === banco && prova.schema === schema && identificador(idBanco, usuario));
  if (prova.historicoCompativel !== true) throw new EstruturaHistoricoIncompativel();
  exigir(primario === true && gatilhos === false && Array.isArray(registros));
  const esperados = [...hashesGit(repo, revisao, false)].filter(([nome]) => caminhoSql.test(nome));
  exigir(registros.length === esperados.length);
  const observados = manual ? new Map(registros.map((r) => [r[0], r])) : null;
  if (manual)
    exigir(
      observados.size === esperados.length && identificador(/^[0-9]+\.[0-9]{6}$/, prova.inicio),
    );
  for (const [i, [caminho, hash]] of esperados.entries()) {
    const registro = manual ? observados.get(caminho.split("/")[2]) : registros[i];
    exigir(
      Array.isArray(registro) &&
        registro.length === 3 &&
        registro[0] === caminho.split("/")[2] &&
        registro[1] === hash &&
        registro[2] === true,
    );
  }
  return {
    cluster,
    banco,
    bancoOid,
    schema,
    schemaOid,
    usuario,
    primario,
    gatilhos,
    ...(manual ? { inicio: prova.inicio } : {}),
  };
}

function prepararEnvelope(prova, repo, base, alvo, manual = false) {
  const anteriores = manual ? hashesGit(repo, base, false) : null;
  const lote = manual ? null : inventariarLoteAutomatico(repo, base, alvo);
  const { cluster, banco, bancoOid, schema, schemaOid, usuario, primario, gatilhos, ip } = prova;
  exigir(primario === true && gatilhos === false && schemaValido(schema));
  exigir(typeof ip === "string" && isIPv4(ip));
  exigir([banco, usuario].every((nome) => identificador(idBanco, nome)));
  exigir(identificador(/^[1-9][0-9]{0,19}$/, cluster));
  exigir([bancoOid, schemaOid].every((oid) => identificador(/^[1-9][0-9]{0,9}$/, oid)));
  const nome = (caminho) => caminho.split("/")[2];
  const aplicadas = [...(anteriores ?? hashesGit(repo, base, false))]
    .filter(([caminho]) => caminhoSql.test(caminho))
    .map(([caminho, sha256]) => ({ nome: nome(caminho), sha256 }));
  let pendentes;
  if (manual) {
    const novos = hashesGit(repo, alvo, false);
    for (const [caminho, sha256] of anteriores) exigir(novos.get(caminho) === sha256);
    exigir(identificador(/^[0-9]+\.[0-9]{6}$/, prova.inicio));
    pendentes = [...novos]
      .filter(([caminho]) => caminhoSql.test(caminho) && !anteriores.has(caminho))
      .map(([caminho, sha256]) => ({ nome: nome(caminho), sha256 }));
  } else pendentes = lote.migracoes.map(({ caminho, sha256 }) => ({ nome: nome(caminho), sha256 }));
  const envelope = Buffer.from(
    JSON.stringify({
      cluster,
      banco,
      bancoOid,
      schema,
      schemaOid,
      usuario,
      ip,
      ...(manual ? { inicio: prova.inicio } : {}),
      base,
      alvo,
      aplicadas,
      pendentes,
    }),
  ).toString("base64url");
  exigir(envelope.length <= 65536);
  return envelope;
}

function lerEntrada() {
  const bytes = Buffer.alloc(limiteEntrada + 1);
  let total = 0;
  while (total < bytes.length) {
    const n = readSync(0, bytes, total, bytes.length - total);
    if (n === 0) break;
    total += n;
  }
  exigir(total <= limiteEntrada);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)));
}

function cli(acao, args) {
  if (acao === "compose" && [4, 7].includes(args.length)) {
    console.log(JSON.stringify(conferirCompose(lerEntrada(), ...args)));
  } else if (acao === "compose-manual" && [4, 7, 8].includes(args.length)) {
    console.log(
      JSON.stringify(
        conferirCompose(
          lerEntrada(),
          ...Array.from({ length: 7 }, (_, i) => args[i]),
          true,
          args[7],
        ),
      ),
    );
  } else if (acao === "transicao-manual" && args.length === 3) {
    const [repo, base, alvo] = args;
    const anteriores = arquivosGit(repo, base, false);
    const novos = arquivosGit(repo, alvo, false);
    for (const [nome, oid] of anteriores) exigir(novos.get(nome) === oid);
  } else if (acao === "imagem" && args.length === 2) {
    conferirImagem(lerEntrada(), ...args);
  } else if (acao === "imagem-manual" && args.length === 2) {
    conferirImagem(lerEntrada(), ...args, true);
  } else if (acao === "sondar-imagem" && args.length === 0) {
    process.stdout.write(
      `(${sondarImagem.toString()})("/app").then(\n` +
        `  (dados) => console.log(JSON.stringify(dados)),\n` +
        `  () => { console.error("Imagem: inventário indisponível."); process.exitCode = 1; },\n` +
        `);\n`,
    );
  } else if (acao === "sql-historico" && args.length === 1) {
    process.stdout.write(sqlHistorico(...args));
  } else if (acao === "sql-historico-manual" && args.length === 1) {
    process.stdout.write(sqlHistorico(args[0], true));
  } else if (acao === "historico" && args.length === 4) {
    console.log(JSON.stringify(conferirHistorico(lerEntrada(), ...args)));
  } else if (acao === "historico-manual" && args.length === 4) {
    console.log(JSON.stringify(conferirHistorico(lerEntrada(), ...args, true)));
  } else if (acao === "envelope" && args.length === 3) {
    console.log(prepararEnvelope(lerEntrada(), ...args));
  } else if (acao === "envelope-manual" && args.length === 3) {
    console.log(prepararEnvelope(lerEntrada(), ...args, true));
  } else {
    throw new Error();
  }
}

const entrada =
  process.argv[1] &&
  process.argv[1] !== "-" &&
  realpathSync(process.argv[1], { throwIfNoEntry: false });
if (
  entrada &&
  pathToFileURL(entrada).href === pathToFileURL(realpathSync(new URL(import.meta.url))).href
) {
  const [acao, ...args] = process.argv.slice(2);
  try {
    cli(acao, args);
  } catch (erro) {
    const mensagens = new Map([
      ["compose", "Compose: configuração ou destino da migração não conferido."],
      ["imagem", "Imagem: inventário ou bytes não correspondem ao commit alvo."],
      [
        "imagem-manual",
        "Imagem: o alvo não contém o protocolo manual compatível e os bytes conferidos.",
      ],
      ["sql-historico", "PostgreSQL: schema não suportado pela guarda automática."],
      ["historico", "PostgreSQL: identidade ou histórico não corresponde à revisão esperada."],
      [
        "historico-manual",
        "PostgreSQL: identidade ou histórico não corresponde à revisão esperada.",
      ],
      ["envelope", "Não foi possível vincular o lote à identidade do banco e às revisões."],
    ]);
    console.error(
      erro instanceof EstruturaHistoricoIncompativel
        ? "PostgreSQL: estrutura da tabela de histórico incompatível com a migração protegida."
        : (mensagens.get(acao) ?? "Guarda de migrações: ação ou argumentos inválidos."),
    );
    process.exitCode = 1;
  }
}
