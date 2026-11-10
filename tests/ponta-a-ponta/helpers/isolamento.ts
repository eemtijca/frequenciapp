// Guarda fail-closed da suíte de ponta a ponta: exige confirmação explícita e
// recusa banco ou aplicação fora dos hosts sintéticos locais.
const HOSTS_BANCO = new Set(["localhost", "127.0.0.1", "::1", "db"]);
const HOSTS_APLICACAO = new Set(["localhost", "127.0.0.1", "::1", "app"]);

function urlValida(valor: string, protocolos: readonly string[], descricao: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${descricao} inválida. Use uma URL sintética completa.`);
  }
  if (!protocolos.includes(url.protocol)) {
    throw new Error(`${descricao} inválida. Use ${protocolos.join(" ou ")}.`);
  }
  return url;
}

/**
 * Executa antes de qualquer leitura ou escrita da suíte. A confirmação
 * explícita impede que uma variável herdada aponte para um banco real, e os
 * hosts permitidos mantêm o ensaio no ambiente local ou no serviço do Compose.
 */
export function exigirAmbienteE2E(
  ambiente: Record<string, string | undefined> = process.env,
): void {
  if (ambiente.E2E_BANCO_SINTETICO !== "true") {
    throw new Error(
      "A suíte de ponta a ponta exige E2E_BANCO_SINTETICO=true e um banco descartável.",
    );
  }
  const banco = ambiente.DATABASE_URL?.trim() ?? "";
  const direto = ambiente.DIRECT_URL?.trim() ?? "";
  if (!banco || !direto) {
    throw new Error("Defina DATABASE_URL e DIRECT_URL para o banco sintético da suíte.");
  }
  if (banco !== direto) {
    throw new Error("DATABASE_URL e DIRECT_URL precisam apontar para o mesmo banco sintético.");
  }
  const urlBanco = urlValida(banco, ["postgres:", "postgresql:"], "URL do banco");
  if (!HOSTS_BANCO.has(urlBanco.hostname.toLowerCase())) {
    throw new Error(
      "A URL do banco da suíte precisa usar localhost, 127.0.0.1, ::1 ou o serviço db.",
    );
  }
  const base = ambiente.TEST_BASE_URL?.trim() || "http://localhost:3000";
  const urlBase = urlValida(base, ["http:", "https:"], "URL da aplicação");
  if (!HOSTS_APLICACAO.has(urlBase.hostname.toLowerCase())) {
    throw new Error(
      "A URL da aplicação da suíte precisa usar localhost, 127.0.0.1, ::1 ou o serviço app.",
    );
  }
}
