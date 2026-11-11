// Ensaia o dump em banco criado pela própria rodada no endpoint PostgreSQL direto.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const falhar = (motivo, codigo = 1) => {
  const erro = new Error(motivo);
  erro.codigo = codigo;
  return erro;
};
const exigir = (condicao, motivo) => {
  if (!condicao) throw falhar(motivo);
};
const literal = (valor) => `'${valor.replaceAll("'", "''")}'`;
const identificador = (valor) => `"${valor.replaceAll('"', '""')}"`;

export function prepararPerfilUrl(ambiente) {
  exigir(ambiente.BACKUP_RESTAURACAO_PERFIL === "postgres-direto", "PERFIL_NAO_SUPORTADO: defina BACKUP_RESTAURACAO_PERFIL=postgres-direto apenas para conexão direta PostgreSQL 17.");
  exigir(!ambiente.BACKUP_RESTAURACAO_URL_VALIDACAO, "URL_EXTERNA_RECUSADA: remova BACKUP_RESTAURACAO_URL_VALIDACAO; nenhum banco externo será usado como ensaio.");
  let url;
  try { url = new URL(ambiente.BACKUP_DATABASE_URL || ambiente.DIRECT_URL); }
  catch { throw falhar("URL_DIRETA_INVALIDA"); }
  exigir(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname && url.username && !url.hash, "URL_DIRETA_INVALIDA");
  let banco;
  try { banco = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw falhar("BANCO_INVALIDO"); }
  exigir(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(banco), "BANCO_INVALIDO");
  const permitidos = new Set(["sslmode", "sslrootcert", "sslcert", "sslkey", "channel_binding", "connect_timeout", "application_name"]);
  const vistos = new Set();
  for (const [nome] of url.searchParams) {
    exigir(permitidos.has(nome) && !vistos.has(nome), "PARAMETRO_URL_NAO_SUPORTADO");
    vistos.add(nome);
  }
  const schema = ambiente.DATABASE_SCHEMA || "public";
  exigir(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(schema), "SCHEMA_INVALIDO");
  const env = {
    PATH: ambiente.PATH || process.env.PATH,
    HOME: ambiente.HOME || "/nonexistent",
    LC_ALL: "C", PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "frequenciapp-ensaio-url", PGDATABASE: url.href,
  };
  // Nunca herdar PGHOST, PGOPTIONS, PGSERVICE ou hooks de runtime do chamador.
  if (ambiente.PGPASSWORD) env.PGPASSWORD = ambiente.PGPASSWORD;
  if (ambiente.PGPASSFILE) env.PGPASSFILE = ambiente.PGPASSFILE;
  return { url, banco, schema, env };
}

export function executarCliente({ programa, args, input, env, fd, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(falhar("INTERROMPIDO", signal.reason || 143));
    let saida = "";
    let excessivo = false;
    let expirado = false;
    const filho = spawn(programa, args, { env, stdio: ["pipe", "pipe", "ignore", fd ?? "ignore"] });
    const interromper = () => filho.kill("SIGTERM");
    signal?.addEventListener("abort", interromper, { once: true });
    const limite = setTimeout(() => { expirado = true; filho.kill("SIGKILL"); }, 300000);
    filho.stdout.on("data", (dados) => {
      if (Buffer.byteLength(saida) + dados.length > 1048576) {
        excessivo = true;
        filho.kill("SIGKILL");
      } else saida += dados.toString();
    });
    // EPIPE pode acompanhar a recusa do servidor; o resultado vem de close.
    filho.stdin.on("error", () => {});
    filho.on("error", () => {});
    filho.on("close", (codigo, sinal) => {
      clearTimeout(limite);
      signal?.removeEventListener("abort", interromper);
      if (signal?.aborted) reject(falhar("INTERROMPIDO", signal.reason || 143));
      else if (expirado || excessivo) reject(falhar(expirado ? "CLIENTE_TIMEOUT" : "SAIDA_EXCESSIVA"));
      else resolve({ codigo, sinal, stdout: saida.trim() });
    });
    filho.stdin.end(input || "");
  });
}

function diretorioPrivado(dir) {
  // Cada componente existente precisa ser diretório real, não symlink.
  const absoluto = path.resolve(dir);
  let atual = path.parse(absoluto).root;
  for (const parte of absoluto.slice(atual.length).split(path.sep).filter(Boolean)) {
    atual = path.join(atual, parte);
    if (!fs.existsSync(atual)) fs.mkdirSync(atual, { mode: 0o700 });
    exigir(fs.lstatSync(atual).isDirectory() && !fs.lstatSync(atual).isSymbolicLink(), "DIRETORIO_AUDITORIA_INVALIDO");
  }
  const stat = fs.lstatSync(absoluto);
  exigir(stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700, "DIRETORIO_AUDITORIA_NAO_PRIVADO");
  return absoluto;
}

export async function ensaiarRestauracaoUrl({ ambiente = process.env, dump, executar = executarCliente, signal }) {
  const perfil = prepararPerfilUrl(ambiente);
  const raiz = diretorioPrivado(ambiente.ESTADO_DIR || "/var/lib/frequenciapp");
  const pasta = fs.mkdtempSync(path.join(diretorioPrivado(path.join(raiz, "ensaios-url")), "rodada-"));
  const journal = path.join(pasta, "journal.json");
  const nome = `freq_ensaio_${randomBytes(16).toString("hex")}`;
  const marcador = randomBytes(32).toString("hex");
  const temporaria = new URL(perfil.url);
  temporaria.pathname = `/${nome}`;
  const estado = {
    formato: 1, criadoEm: new Date().toISOString(), perfil: "postgres-direto",
    bancoTemporario: nome, marcador, etapa: "preparado", resultado: "pendente",
    endpointHash: createHash("sha256").update(perfil.url.host).digest("hex"),
    destino: null, temporario: null, clientes: [],
  };
  let fd;
  const salvar = () => {
    const arquivo = path.join(pasta, `estado-${randomBytes(8).toString("hex")}`);
    const descritor = fs.openSync(arquivo, "wx", 0o600);
    try {
      fs.writeFileSync(descritor, JSON.stringify(estado, null, 2) + "\n");
      fs.fsyncSync(descritor);
    } finally { fs.closeSync(descritor); }
    fs.renameSync(arquivo, journal);
    const dir = fs.openSync(pasta, "r");
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  };
  const conferirSinal = () => {
    if (signal?.aborted) throw falhar("INTERROMPIDO", signal.reason || 143);
  };
  const cliente = async (programa, args, input, url = perfil.url.href) => {
    conferirSinal();
    const resultado = await executar({ programa, args, input, env: { ...perfil.env, PGDATABASE: url }, fd, signal });
    conferirSinal();
    estado.clientes.push({ programa, codigo: resultado.codigo, sinal: resultado.sinal });
    salvar();
    exigir(resultado.sinal === null && Number.isInteger(resultado.codigo), "CLIENTE_SEM_TERMINO_CONFIRMADO");
    if (resultado.codigo !== 0) throw falhar(`CLIENTE_FALHOU: ${programa}, código ${resultado.codigo}.`, resultado.codigo);
    return resultado.stdout;
  };
  const sql = (tag, texto, url) => cliente("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", url || perfil.url.href], `/* url:${tag} */\n${texto}\n`, url);
  const json = async (tag, texto, url) => {
    const bruto = await sql(tag, texto, url);
    try { return JSON.parse(bruto); }
    catch { throw falhar("IDENTIDADE_INVALIDA"); }
  };
  const consultaIdentidade = (condicao) => `SELECT json_build_object(
    'banco', d.datname, 'oid', d.oid::bigint, 'usuario', current_user,
    'dono', pg_get_userbyid(d.datdba), 'marcador', shobj_description(d.oid, 'pg_database'),
    'versao', current_setting('server_version_num')::integer,
    'criadoPermitido', (SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname=current_user),
    'endereco', inet_server_addr()::text, 'porta', inet_server_port(),
    'inicio', pg_postmaster_start_time()::text) FROM pg_database d WHERE ${condicao};`;
  const conferirIdentidade = (observada, esperada, temporario = false) => {
    exigir(observada && observada.banco === esperada.banco && observada.oid === esperada.oid &&
      observada.usuario === esperada.usuario && observada.dono === esperada.dono &&
      observada.endereco === esperada.endereco && observada.porta === esperada.porta &&
      observada.inicio === esperada.inicio && observada.versao === esperada.versao,
    "IDENTIDADE_DIVERGENTE");
    if (temporario) exigir(observada.marcador === marcador && observada.oid !== estado.destino.oid, "PROPRIEDADE_DIVERGENTE");
  };
  const conferirPropriedade = async () => {
    conferirIdentidade(await json("destino", consultaIdentidade("d.datname=current_database()")), estado.destino);
    conferirIdentidade(await json("catalogo", consultaIdentidade(`d.datname=${literal(nome)}`)), estado.temporario, true);
    // A conexão deve obedecer ao nome aleatório; um pooler que ignore database falha aqui.
    conferirIdentidade(await json("conexao", consultaIdentidade("d.datname=current_database()"), temporaria.href), estado.temporario, true);
  };
  try {
    salvar();
    fd = fs.openSync(dump, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    exigir(fs.fstatSync(fd).isFile() && fs.fstatSync(fd).size > 0, "DUMP_INVALIDO");
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(65536);
    let posicao = 0;
    for (;;) {
      const lidos = fs.readSync(fd, buffer, 0, buffer.length, posicao);
      if (!lidos) break;
      hash.update(buffer.subarray(0, lidos)); posicao += lidos;
    }
    estado.dumpSha256 = hash.digest("hex");
    const destino = await json("destino", consultaIdentidade("d.datname=current_database()"));
    exigir(destino?.banco === perfil.banco && Number.isInteger(destino.oid) && destino.oid > 0, "DESTINO_DIVERGENTE");
    exigir(destino.versao >= 170000 && destino.versao < 180000, "VERSAO_NAO_SUPORTADA");
    exigir(destino.criadoPermitido === true, "SEM_PERMISSAO_CREATEDB");
    estado.destino = destino;
    estado.etapa = "criacao-iniciada"; salvar();
    await sql("criar", `CREATE DATABASE ${identificador(nome)} TEMPLATE template0;`);
    estado.etapa = "criado"; salvar();
    await sql("marcar", `COMMENT ON DATABASE ${identificador(nome)} IS ${literal(marcador)};`);
    const criado = await json("catalogo", consultaIdentidade(`d.datname=${literal(nome)}`));
    exigir(criado?.banco === nome && Number.isInteger(criado.oid) && criado.oid > 0 &&
      criado.oid !== destino.oid && criado.dono === destino.usuario && criado.usuario === destino.usuario &&
      criado.marcador === marcador && criado.endereco === destino.endereco && criado.porta === destino.porta &&
      criado.inicio === destino.inicio && criado.versao === destino.versao, "CRIACAO_NAO_COMPROVADA");
    estado.temporario = criado;
    await conferirPropriedade();
    estado.etapa = "restauracao-iniciada"; salvar();
    await cliente("pg_restore", ["--dbname", temporaria.href, "--no-owner", "--no-acl", "--single-transaction", "--exit-on-error", "/proc/self/fd/3"], undefined, temporaria.href);
    await conferirPropriedade();
    const validado = await json("validar", `SELECT json_build_object(
      'migracoes', (SELECT json_agg(migration_name ORDER BY migration_name) FROM ${identificador(perfil.schema)}._prisma_migrations WHERE rolled_back_at IS NULL),
      'tabelas', (SELECT count(*)::integer FROM information_schema.tables WHERE table_schema=${literal(perfil.schema)}));`, temporaria.href);
    exigir(Array.isArray(validado?.migracoes) && validado.migracoes.length > 0 &&
      validado.migracoes.every((m) => typeof m === "string") && validado.tabelas > 0, "BANCO_RESTAURADO_INVALIDO");
    const dir = path.join(ambiente.APP_DIR || ".", "prisma/migrations");
    const esperadas = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).sort() : [];
    if (esperadas.length && ambiente.RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES !== "true") {
      exigir(JSON.stringify(esperadas.slice(0, validado.migracoes.length)) === JSON.stringify(validado.migracoes), "MIGRACOES_DIVERGENTES");
    }
    estado.etapa = "validado"; salvar();
    await conferirPropriedade();
    estado.etapa = "descarte-iniciado"; salvar();
    // Sem FORCE e sem terminar sessões: dúvida ou concorrência preservam o recurso.
    await sql("descartar", `DROP DATABASE ${identificador(nome)};`);
    exigir(await sql("ausente", `SELECT count(*) FROM pg_database WHERE datname=${literal(nome)};`) === "0", "DESCARTE_NAO_CONFIRMADO");
    estado.etapa = "descartado"; estado.resultado = "sucesso"; salvar();
    conferirSinal();
    return { status: "sucesso", journal };
  } catch (erro) {
    estado.resultado = "falha";
    estado.recursoPreservado = estado.etapa !== "preparado" && estado.etapa !== "descartado";
    estado.motivo = erro?.codigo ? erro.message : "FALHA_INTERNA";
    try { salvar(); } catch { /* O journal anterior permanece; não limpar na incerteza. */ }
    throw falhar(`${estado.motivo} Ensaio não autoriza escrita no destino. Inspeção manual: ${journal}`, erro?.codigo || 1);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

let principal = false;
try { principal = Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); }
catch { console.error("[url] ENTRADA_INVALIDA"); process.exitCode = 1; }
if (principal) {
  const controle = new AbortController();
  const interromper = () => controle.abort(130);
  const terminar = () => controle.abort(143);
  process.on("SIGINT", interromper); process.on("SIGTERM", terminar);
  try {
    if (process.argv[2] === "perfil" && process.argv.length === 3) prepararPerfilUrl(process.env);
    else {
      exigir(process.argv[2] === "ensaio" && process.argv.length === 4, "USO: restauracao-url.mjs ensaio CAMINHO_DUMP");
      const resultado = await ensaiarRestauracaoUrl({ dump: process.argv[3], signal: controle.signal });
      console.log(`[url] Ensaio próprio validado e descartado. Auditoria: ${resultado.journal}`);
    }
  } catch (erro) {
    console.error(`[url] ${erro?.codigo ? erro.message : "FALHA_INTERNA"}`);
    process.exitCode = erro?.codigo || 1;
  } finally {
    process.removeListener("SIGINT", interromper); process.removeListener("SIGTERM", terminar);
  }
}
