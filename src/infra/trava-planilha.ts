// Exclusão de alterações de planilha entre instâncias, com conexão PostgreSQL dedicada.
import pg from "pg";
import { ErroHttp } from "./erros";

export interface ControleTravaPlanilha {
  signal: AbortSignal;
  conferir(): void;
}

/** Mantém a trava durante leitura e escrita sem repetir efeitos externos em transações. */
export async function comTravaPlanilha<T>(
  chave: { namespace: number; recurso: number },
  mensagemOcupada: string,
  tarefa: (controle: ControleTravaPlanilha) => Promise<T>,
): Promise<T> {
  const { ambiente } = await import("./ambiente");
  // A conexão é separada do pool Prisma: o runtime pode ter apenas uma conexão no pool.
  const cliente = new pg.Client({
    connectionString: ambiente.databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    keepAlive: true,
  });
  const interrupcao = new AbortController();
  let conectada = false;
  let encerrando = false;
  let tarefaIniciada = false;
  let perdeuConexao = false;
  const perderConexao = () => {
    if (encerrando) return;
    perdeuConexao = true;
    interrupcao.abort();
  };
  cliente.on("error", perderConexao);
  cliente.on("end", perderConexao);
  const conferir = () => {
    if (perdeuConexao)
      throw new ErroHttp(
        "Não foi possível confirmar a proteção do envio. Confira a planilha antes de repetir.",
        502,
      );
  };
  try {
    await cliente.connect();
    conectada = true;
    await cliente.query("BEGIN");
    // A trava fica ociosa enquanto o Google responde; a janela permanece limitada.
    await cliente.query("SET LOCAL idle_in_transaction_session_timeout = '5min'");
    const resultado = await cliente.query<{ obtida: boolean }>(
      "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS obtida",
      [chave.namespace, chave.recurso],
    );
    conferir();
    if (resultado.rows[0]?.obtida !== true) throw new ErroHttp(mensagemOcupada, 409);
    tarefaIniciada = true;
    const retorno = await tarefa({ signal: interrupcao.signal, conferir });
    conferir();
    return retorno;
  } catch (erro) {
    if (perdeuConexao && tarefaIniciada) conferir();
    if (erro instanceof ErroHttp || tarefaIniciada) throw erro;
    throw new ErroHttp("Não foi possível preparar a proteção do envio. Tente novamente.", 503);
  } finally {
    encerrando = true;
    if (conectada && !perdeuConexao) {
      try {
        await cliente.query("ROLLBACK");
      } catch {
        // Encerrar a conexão também libera a transação e sua trava.
      }
    }
    try {
      await cliente.end();
    } catch {
      // A conexão pode já ter sido encerrada pelo servidor.
    }
  }
}
