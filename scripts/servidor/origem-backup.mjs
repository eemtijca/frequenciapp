// Autentica a origem do dump em endpoint direto TLS explicitamente adotado.
import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { validarRecibo, conferirArtefatos } from "./recibos.mjs";

const hash = (b) => createHash("sha256").update(b).digest("hex");
const igual = (a, b) => canonico(a) === canonico(b);
export function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object")
    return `{${Object.keys(valor)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`)
      .join(",")}}`;
  return JSON.stringify(valor);
}
function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}
function lerLimitado(arquivo, limite = 1024 * 1024) {
  const fd = fs.openSync(
    arquivo,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const st = fs.fstatSync(fd);
    exigir(st.isFile() && st.size <= limite, "Metadado ou chave excede limite ou não é regular.");
    const dados = Buffer.alloc(limite + 1);
    let total = 0;
    for (;;) {
      const n = fs.readSync(fd, dados, total, dados.length - total, null);
      if (!n) break;
      total += n;
      exigir(total <= limite, "Metadado excede limite.");
    }
    return dados.subarray(0, total);
  } finally {
    fs.closeSync(fd);
  }
}
const json = (arquivo) => JSON.parse(lerLimitado(arquivo).toString("utf8"));
function protegido(arquivo, env) {
  exigir(
    typeof arquivo === "string" && path.isAbsolute(arquivo),
    "Adoção ausente: configure policy e chave fora do PVC.",
  );
  const real = fs.realpathSync(arquivo);
  for (const dir of [env.BACKUP_BANCO_DIR, env.ESTADO_DIR, env.BACKUP_DIR]) {
    if (!dir) continue;
    const raiz = fs.realpathSync(dir);
    exigir(
      real !== raiz && !real.startsWith(raiz + path.sep),
      "Autoridade e segredo não podem ficar no PVC de backup.",
    );
  }
  // Secrets projetados usam symlinks; a leitura fixa a revisão resolvida pelo kubelet.
  return lerLimitado(real);
}
export function carregarPolitica(env = process.env) {
  const p = JSON.parse(protegido(env.BACKUP_ORIGEM_POLICY, env));
  exigir(
    p.versao === 1 &&
      p.adocao === "operador-confiavel-v1" &&
      p.perfil === "postgres-direto-tls-snapshot-v1",
    "Adoção ausente ou perfil de origem incompatível.",
  );
  exigir(
    /^[a-zA-Z0-9_.-]{1,80}$/.test(p.produtor ?? "") &&
      /^[a-zA-Z0-9_.-]{1,80}$/.test(p.chaveId ?? ""),
    "Produtor ou chaveId inválido.",
  );
  exigir(
    isIP(p.endpoint?.host ?? "") === 4 &&
      Number.isInteger(p.endpoint.port) &&
      p.endpoint.port > 0 &&
      p.endpoint.port <= 65535,
    "Endpoint deve ser IPv4 direto fixado; DNS e pooler não são suportados neste perfil.",
  );
  for (const v of [p.endpoint.database, p.endpoint.user, p.schema])
    exigir(
      typeof v === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(v),
      "Banco, usuário ou schema incompatível com perfil direto.",
    );
  exigir(
    p.identidade &&
      Object.keys(p.identidade).sort().join(",") === "databaseOid,schemaOid,systemIdentifier" &&
      Object.values(p.identidade).every((v) => typeof v === "string" && /^[1-9][0-9]*$/.test(v)),
    "Identidade operacional independente inválida.",
  );
  exigir(
    typeof p.remoto === "string" &&
      ["age", "gpg"].includes(p.criptografia) &&
      typeof p.destinatario === "string" &&
      p.destinatario.length > 0,
    "Escopo de artefatos independente inválido.",
  );
  exigir(
    Number.isSafeInteger(p.idadeMaximaHoras) &&
      p.idadeMaximaHoras > 0 &&
      p.idadeMaximaHoras <= 8760 &&
      Number.isSafeInteger(p.duracaoMaximaSegundos) &&
      p.duracaoMaximaSegundos > 0 &&
      p.duracaoMaximaSegundos <= 86400,
    "Limites temporais da policy inválidos.",
  );
  exigir(
    /^[a-f0-9]{64}$/.test(p.tls?.caSha256 ?? "") &&
      hash(protegido(p.tls.rootCert, env)) === p.tls.caSha256,
    "CA TLS diverge da policy independente.",
  );
  return p;
}
function chave(env) {
  const b = protegido(env.BACKUP_ORIGEM_CHAVE, env);
  exigir(b.length >= 32 && b.length <= 128, "Chave HMAC deve conter entre 32 e 128 bytes brutos.");
  return b;
}
export function conferirConfiguracao(env = process.env, p = carregarPolitica(env)) {
  const urls = [env.DATABASE_URL, env.DIRECT_URL, env.BACKUP_DATABASE_URL];
  exigir(
    urls.every((u) => typeof u === "string" && u.length > 0) && urls.every((u) => u === urls[0]),
    "Runtime, migrador e produtor exigem a mesma URL direta efetiva, sem overrides.",
  );
  const u = new URL(urls[0]);
  exigir(
    u.protocol === "postgresql:" &&
      !u.hash &&
      u.hostname === p.endpoint.host &&
      Number(u.port || 5432) === p.endpoint.port &&
      decodeURIComponent(u.pathname) === `/${p.endpoint.database}` &&
      decodeURIComponent(u.username) === p.endpoint.user &&
      !!u.password,
    "Endpoint efetivo diverge da policy independente.",
  );
  const parametros = [...u.searchParams.keys()];
  exigir(
    parametros.length === 3 &&
      new Set(parametros).size === 3 &&
      parametros.every((k) => ["schema", "sslmode", "sslrootcert"].includes(k)) &&
      u.searchParams.get("sslmode") === "verify-full" &&
      u.searchParams.get("sslrootcert") === p.tls.rootCert &&
      u.searchParams.get("schema") === p.schema &&
      env.DATABASE_SCHEMA === p.schema,
    "Schema ou TLS efetivo diverge da policy; parâmetros extras não são suportados.",
  );
  for (const k of Object.keys(env))
    exigir(
      !k.startsWith("PG") && !["NODE_TLS_REJECT_UNAUTHORIZED", "NODE_OPTIONS"].includes(k),
      "Override de conexão ou TLS não suportado.",
    );
  u.searchParams.delete("schema");
  return { policy: p, urlDump: u.toString(), alvo: `url-autenticado:${hash(canonico(p))}` };
}
function conferirReciboPolicy(r, p) {
  validarRecibo(r);
  exigir(
    r.escopo.tipo === "schema" &&
      r.escopo.schema === p.schema &&
      r.escopo.banco === p.endpoint.database &&
      r.escopo.alvo === `url-autenticado:${hash(canonico(p))}` &&
      r.remoto === p.remoto &&
      r.criptografia === p.criptografia &&
      r.destinatario === p.destinatario,
    "Escopo do recibo diverge da policy independente.",
  );
}
function conferirEvidencia(o, p, agora = Date.now()) {
  exigir(
    o && igual(o.identidade, p.identidade),
    "Identidade operacional diverge da policy independente.",
  );
  exigir(
    typeof o.snapshot === "string" &&
      /^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(o.snapshot) &&
      /^[a-f0-9]{64}$/.test(o.dumpSha256) &&
      Number.isSafeInteger(o.dumpBytes) &&
      o.dumpBytes > 0,
    "Atestação do snapshot e do dump bruto inválida.",
  );
  const inicio = Date.parse(o.inicio),
    fim = Date.parse(o.fim);
  exigir(
    Number.isFinite(inicio) &&
      Number.isFinite(fim) &&
      inicio <= fim &&
      fim - inicio <= p.duracaoMaximaSegundos * 1000 &&
      fim <= agora + 300000 &&
      inicio <= agora + 300000 &&
      agora - inicio <= p.idadeMaximaHoras * 3600000,
    "Timestamps de origem expirados, futuros ou incompatíveis.",
  );
}
export async function assinarRecibo(recibo, evidencia, env = process.env) {
  const { policy: p, alvo } = conferirConfiguracao(env);
  const r = structuredClone(recibo);
  r.escopo = { ...r.escopo, alvo, banco: p.endpoint.database };
  conferirReciboPolicy(r, p);
  conferirEvidencia(evidencia, p);
  exigir(
    Date.parse(r.em) >= Date.parse(evidencia.fim) &&
      Date.parse(r.em) - Date.parse(evidencia.inicio) <= p.duracaoMaximaSegundos * 1000,
    "Confirmação fora do intervalo de produção.",
  );
  r.origem = {
    ...evidencia,
    versao: 1,
    algoritmo: "hmac-sha256",
    produtor: p.produtor,
    chaveId: p.chaveId,
    policySha256: hash(canonico(p)),
  };
  r.origem.assinatura = createHmac("sha256", chave(env)).update(canonico(r)).digest("hex");
  return r;
}
export async function verificarReciboAutenticado(recibo, diretorio, env = process.env) {
  const p = carregarPolitica(env);
  const r = structuredClone(recibo),
    o = r.origem;
  exigir(
    o?.versao === 1 &&
      o.algoritmo === "hmac-sha256" &&
      o.produtor === p.produtor &&
      o.chaveId === p.chaveId &&
      o.policySha256 === hash(canonico(p)) &&
      /^[a-f0-9]{64}$/.test(o.assinatura ?? ""),
    "Origem autenticada ausente, legada ou policy divergente.",
  );
  const assinatura = Buffer.from(o.assinatura, "hex");
  delete o.assinatura;
  const esperado = createHmac("sha256", chave(env)).update(canonico(r)).digest();
  exigir(timingSafeEqual(assinatura, esperado), "Assinatura HMAC do recibo inválida.");
  conferirReciboPolicy(r, p);
  conferirEvidencia(o, p);
  exigir(
    Date.parse(r.em) >= Date.parse(o.fim) &&
      Date.parse(r.em) <= Date.now() + 300000 &&
      Date.parse(r.em) - Date.parse(o.inicio) <= p.duracaoMaximaSegundos * 1000,
    "Timestamp do recibo incompatível com a produção.",
  );
  conferirArtefatos(diretorio, r); // Leitor de descritor regular e hashes em blocos, sem carregar o dump.
  return recibo;
}
export async function verificarEstado(env = process.env) {
  const diretorio = env.BACKUP_BANCO_DIR || "/backups/banco";
  const p = json(path.join(env.ESTADO_DIR || "/backups/estado", "ultimo-backup.json"));
  exigir(
    /^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$/.test(p.recibo ?? ""),
    "Ponteiro sem recibo individual válido.",
  );
  const r = await verificarReciboAutenticado(json(path.join(diretorio, p.recibo)), diretorio, env);
  const dump = r.artefatos.find((a) => a.nome === `${r.base}.dump.${r.criptografia}`);
  const ambiente = r.artefatos.find((a) => a.nome === `${r.base}-ambiente.env.${r.criptografia}`);
  exigir(
    p.recibo === `${r.base}.confirmado.json` &&
      p.modo === "url" &&
      p.em === r.em &&
      p.arquivo === dump.nome &&
      p.sha256 === dump.sha256 &&
      p.schema === r.escopo.schema &&
      p.criptografia === r.criptografia &&
      p.remoto === r.remoto &&
      p.verificadoRemoto === r.etapas.remotoVerificado &&
      p.ambiente === (ambiente?.nome ?? "") &&
      p.ambienteSha256 === (ambiente?.sha256 ?? ""),
    "Ponteiro diverge do recibo autenticado.",
  );
  const limite =
    env.BACKUP_GATE_IDADE_MAXIMA_HORAS ?? String(carregarPolitica(env).idadeMaximaHoras);
  exigir(
    /^[1-9][0-9]*$/.test(limite) &&
      Date.now() - Date.parse(r.origem.inicio) <= Number(limite) * 3600000,
    "Backup expirado para o gate.",
  );
  exigir(
    [undefined, "true", "false"].includes(env.BACKUP_GATE_EXIGIR_REMOTO),
    "Exigência remota inválida.",
  );
  exigir(
    env.BACKUP_GATE_EXIGIR_REMOTO !== "true" || r.etapas.remotoVerificado === true,
    "Recibo não confirma remoto verificado.",
  );
  return r;
}
async function conectar(env) {
  const { policy: p, urlDump } = conferirConfiguracao(env);
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({
    connectionString: urlDump,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });
  try {
    await cliente.connect();
    await cliente.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {
      rows: [r],
    } = await cliente.query(
      `SELECT c.system_identifier::text AS "systemIdentifier", d.oid::text AS "databaseOid", n.oid::text AS "schemaOid", pg_catalog.host(inet_server_addr()) AS host, inet_server_port() AS port, current_database() AS database, current_user AS "user", s.ssl AS tls FROM pg_control_system() c CROSS JOIN pg_database d CROSS JOIN pg_namespace n CROSS JOIN pg_stat_ssl s WHERE d.datname=current_database() AND n.nspname=$1 AND s.pid=pg_backend_pid()`,
      [p.schema],
    );
    exigir(
      r &&
        r.tls === true &&
        r.host === p.endpoint.host &&
        r.port === p.endpoint.port &&
        r.database === p.endpoint.database &&
        r.user === p.endpoint.user,
      "Endpoint operacional ou TLS diverge da policy.",
    );
    const identidade = {
      systemIdentifier: r.systemIdentifier,
      databaseOid: r.databaseOid,
      schemaOid: r.schemaOid,
    };
    exigir(
      igual(identidade, p.identidade),
      "Identidade operacional diverge da policy independente.",
    );
    return { cliente, identidade, p, urlDump };
  } catch (erro) {
    await cliente.end().catch(() => {});
    throw erro;
  }
}
async function gerarDump(evidencia, env) {
  const inicio = new Date().toISOString();
  const { cliente, identidade, p, urlDump } = await conectar(env);
  let filho;
  const abortar = () => filho?.kill("SIGTERM");
  process.once("SIGTERM", abortar);
  process.once("SIGINT", abortar);
  try {
    const {
      rows: [r],
    } = await cliente.query("SELECT pg_export_snapshot() AS snapshot");
    exigir(/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(r.snapshot), "Snapshot inválido.");
    const h = createHash("sha256");
    let bytes = 0;
    filho = spawn(
      "pg_dump",
      [
        urlDump,
        "-Fc",
        "--no-publications",
        "--no-subscriptions",
        "--strict-names",
        `--schema=${p.schema}`,
        "--lock-wait-timeout=30s",
        `--snapshot=${r.snapshot}`,
      ],
      {
        env: { PATH: env.PATH, HOME: env.HOME || "/tmp", LANG: "C" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    // Mensagens do cliente podem conter credenciais ou detalhes do banco; não as registrar.
    filho.stderr.resume();
    const fim = new Promise((resolve, reject) => {
      filho.once("error", reject);
      filho.once("close", (code, signal) =>
        code === 0 && signal === null
          ? resolve()
          : reject(new Error("pg_dump falhou ou foi interrompido.")),
      );
    });
    fim.catch(() => {});
    const timer = setTimeout(() => filho.kill("SIGTERM"), p.duracaoMaximaSegundos * 1000);
    try {
      await pipeline(
        filho.stdout,
        new Transform({
          transform(bloco, _, cb) {
            h.update(bloco);
            bytes += bloco.length;
            cb(null, bloco);
          },
        }),
        process.stdout,
        { end: false },
      );
      await fim;
    } finally {
      clearTimeout(timer);
    }
    exigir(bytes > 0, "Dump bruto vazio.");
    await cliente.query("COMMIT");
    fs.writeFileSync(
      evidencia,
      JSON.stringify({
        inicio,
        fim: new Date().toISOString(),
        snapshot: r.snapshot,
        identidade,
        dumpSha256: h.digest("hex"),
        dumpBytes: bytes,
      }),
      { mode: 0o600, flag: "wx" },
    );
  } finally {
    abortar();
    await cliente.end();
    process.removeListener("SIGTERM", abortar);
    process.removeListener("SIGINT", abortar);
  }
}
async function cli() {
  const [acao, a, b, ...resto] = process.argv.slice(2);
  if (acao === "validar-config") {
    const c = conferirConfiguracao();
    process.stdout.write(`${c.alvo}\t${c.policy.endpoint.database}\n`);
    return;
  }
  if (acao === "dump") {
    exigir(a, "Informe destino privado da evidência.");
    await gerarDump(a, process.env);
    return;
  }
  if (acao === "assinar") {
    process.stdout.write(JSON.stringify(await assinarRecibo(json(a), json(b))) + "\n");
    return;
  }
  if (acao === "verificar") {
    const r = await verificarEstado();
    process.stdout.write(`[origem-backup] Origem autenticada e artefatos conferidos: ${r.base}.\n`);
    return;
  }
  if (acao === "executar") {
    const { cliente } = await conectar(process.env);
    await cliente.query("ROLLBACK");
    await cliente.end();
    exigir(a && b, "Informe executável e entrada.");
    const filho = spawn(a, [b, ...resto], { env: process.env, stdio: "inherit" });
    const encaminhar = (s) => filho.kill(s);
    process.on("SIGTERM", encaminhar);
    process.on("SIGINT", encaminhar);
    process.exitCode = await new Promise((resolve, reject) => {
      filho.once("error", reject);
      filho.once("close", (c, s) => resolve(s ? 1 : c));
    });
    return;
  }
  throw new Error("Uso: origem-backup.mjs validar-config|dump|assinar|verificar|executar");
}
if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))
) {
  cli().catch((erro) => {
    process.stderr.write(`[origem-backup] ${erro.message}\n`);
    process.exitCode = 1;
  });
}
