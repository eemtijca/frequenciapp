import pg from "pg";
import { identificadorPostgres, resolverSchema } from "../../src/infra/schema-postgres.mjs";

function objeto(nome: string): string {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória para a fixture.");
  const schema = resolverSchema({
    url: process.env.DATABASE_URL,
    schemaExplicito: process.env.DATABASE_SCHEMA,
  });
  return `${identificadorPostgres(schema)}.${identificadorPostgres(nome)}`;
}

/**
 * Verificação conservadora de configuração, não prova de isolamento ou da identidade
 * do backend: proxies e processos externos podem direcionar conexões de outro modo.
 * É obrigatório um harness com banco sintético exclusivo e servidor isolado.
 * A suite global já realiza exclusões e alterações globais; esta guarda não a protege.
 */
export function conferirConexaoFixture(cliente: pg.Client): void {
  const runtime = process.env.DATABASE_URL;
  const direto = process.env.DIRECT_URL;
  if (!runtime || !direto || runtime !== direto) {
    throw new Error("DATABASE_URL e DIRECT_URL devem ser idênticas e explícitas para a fixture.");
  }
  let url: URL;
  try {
    url = new URL(runtime);
  } catch {
    throw new Error("URL do banco da fixture inválida.");
  }
  // Não presumir como o driver ou um proxy interpretam parâmetros de roteamento.
  const permitidos = new Set(["schema", "sslmode"]);
  const chaves = [...url.searchParams.keys()];
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !/^\/[^/]+$/.test(url.pathname) ||
    url.hash ||
    chaves.some((chave) => !permitidos.has(chave)) ||
    new Set(chaves).size !== chaves.length
  )
    throw new Error("URL do banco da fixture ambígua ou incompleta.");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !database ||
    database.includes("/") ||
    database.includes("\0") ||
    cliente.host !== url.hostname ||
    String(cliente.port) !== (url.port || "5432") ||
    cliente.database !== database
  ) {
    throw new Error("O cliente da fixture não corresponde ao banco configurado.");
  }
  // Executa a mesma validação e precedência de banco.ts antes de qualquer escrita.
  objeto("feriados");
}

/** A trava advisory usa outra conexão para não fixar o snapshot serializable. */
async function comTravas(
  cliente: pg.Client,
  tarefa: () => Promise<void>,
  esperaMaximaMs = 0,
): Promise<void> {
  conferirConexaoFixture(cliente);
  const advisory = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    keepAlive: true,
  });
  let conectada = false;
  let transacaoAdvisory = false;
  let transacaoDados = false;
  let timeoutAnterior: string | undefined;
  let erro: unknown;
  let falhou = false;
  let perdeuConexao = false;
  advisory.on("error", () => {
    perdeuConexao = true;
  });
  advisory.on("end", () => {
    if (conectada) perdeuConexao = true;
  });
  try {
    await advisory.connect();
    conectada = true;
    await advisory.query("begin");
    transacaoAdvisory = true;
    const limite = Date.now() + esperaMaximaMs;
    for (;;) {
      const { rows } = await advisory.query<{ obtida: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS obtida",
        [0x46524551, 1],
      );
      if (rows[0]?.obtida === true && !perdeuConexao) break;
      if (perdeuConexao || Date.now() >= limite)
        throw new Error("Trava da planilha de frequência indisponível.");
      await new Promise((resolver) => setTimeout(resolver, 100));
    }
    // SHOW e SET são anteriores ao BEGIN, logo não fixam o snapshot dos dados.
    const timeout = await cliente.query<{ lock_timeout: string }>("show lock_timeout");
    timeoutAnterior = timeout.rows[0]?.lock_timeout;
    if (timeoutAnterior === undefined) throw new Error("Não foi possível ler lock_timeout.");
    await cliente.query("set lock_timeout = '5s'");
    await cliente.query("begin isolation level serializable");
    transacaoDados = true;
    await cliente.query(`lock table ${objeto("feriados")} in share row exclusive mode`);
    if (perdeuConexao) throw new Error("Conexão da trava da planilha perdida.");
    await tarefa();
    if (perdeuConexao) throw new Error("Conexão da trava da planilha perdida.");
    await cliente.query("commit");
    transacaoDados = false;
    if (perdeuConexao)
      throw new Error("Conexão da trava perdida durante o commit; resultado incerto.");
  } catch (e) {
    erro = e;
    falhou = true;
  } finally {
    const limpar = async (acao: () => Promise<unknown>) => {
      try {
        await acao();
      } catch (e) {
        if (!falhou) {
          erro = e;
          falhou = true;
        }
      }
    };
    let dadosEncerrados = false;
    if (transacaoDados) {
      try {
        await cliente.query("rollback");
      } catch (e) {
        if (!falhou) {
          erro = e;
          falhou = true;
        }
        // Não mantenha uma transação de dados indefinida após perder a advisory.
        await limpar(() => cliente.end());
        dadosEncerrados = true;
      }
    }
    if (timeoutAnterior !== undefined && !dadosEncerrados)
      await limpar(() =>
        cliente.query("select set_config('lock_timeout', $1, false)", [timeoutAnterior]),
      );
    if (transacaoAdvisory) await limpar(() => advisory.query("rollback"));
    conectada = false;
    await limpar(() => advisory.end());
  }
  if (falhou) throw erro;
}

/** Exige harness sintético exclusivo; SQL externo pode ignorar o protocolo.
 * Um commit de resultado incerto pode deixar o UUID para revisão e limpeza.
 * `esperaMaximaMs` permite aguardar uma requisição concorrente liberar a trava. */
export async function criarFeriadoDaFixture(
  cliente: pg.Client,
  dia: string,
  nome: string,
  esperaMaximaMs = 0,
): Promise<void> {
  await comTravas(
    cliente,
    async () => {
      const { rows } = await cliente.query<{ ocupado: boolean }>(
        `select exists(select 1 from ${objeto("feriados")} where dia=$1::date)
         or exists(select 1 from ${objeto("frequencias")} where dia=$1::date)
         or exists(select 1 from ${objeto("frequencias_parciais")} where dia=$1::date) as ocupado`,
        [dia],
      );
      if (rows[0]?.ocupado !== false)
        throw new Error(`Data ocupada para feriado sintético: ${dia}`);
      await cliente.query(
        `insert into ${objeto("feriados")}(dia,nome,atualizado_em) values ($1,$2,now())`,
        [dia, nome],
      );
    },
    esperaMaximaMs,
  );
}

/** Nunca remove feriado alheio; usa a mesma ordem de trava para a remoção.
 * `esperaMaximaMs` evita perder a limpeza quando o aplicativo ainda segura a trava. */
export async function removerFeriadoDaFixture(
  cliente: pg.Client,
  dia: string,
  nome: string,
  esperaMaximaMs = 0,
): Promise<void> {
  await comTravas(
    cliente,
    async () => {
      await cliente.query(`delete from ${objeto("feriados")} where dia=$1::date and nome=$2`, [
        dia,
        nome,
      ]);
    },
    esperaMaximaMs,
  );
}

/** Datas civis presentes; leitura sem alterar o calendário compartilhado. */
export async function lerFeriados(cliente: pg.Client): Promise<string[]> {
  const { rows } = await cliente.query<{ dia: string }>(
    `select to_char(dia, 'YYYY-MM-DD') as dia from ${objeto("feriados")} order by dia`,
  );
  return rows.map(({ dia }) => dia);
}

/** Evita criar feriado sintético em data que já possua registros de terceiros. */
export async function lerDiasComFrequencia(cliente: pg.Client): Promise<string[]> {
  const { rows } = await cliente.query<{ dia: string }>(
    `select to_char(dia, 'YYYY-MM-DD') as dia from ${objeto("frequencias")} union select to_char(dia, 'YYYY-MM-DD') as dia from ${objeto("frequencias_parciais")}`,
  );
  return rows.map(({ dia }) => dia);
}
