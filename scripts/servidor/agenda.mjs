// Seleciona e executa as funções independentes da agenda periódica.
import { pathToFileURL } from "node:url";

const funcoes = [
  ["AGENDA_NOTIFICACOES", "/api/notificacoes/agenda"],
  ["AGENDA_PLANILHAS", "/api/planilha/fila/agenda"],
  ["AGENDA_INDICADORES", "/api/indicadores/agenda"],
];

export function selecionarRotas(ambiente = process.env) {
  return funcoes.flatMap(([nome, rota]) => {
    const valor = ambiente[nome] === undefined ? "true" : ambiente[nome];
    if (valor !== "true" && valor !== "false") {
      throw new Error(`${nome} deve ser true ou false.`);
    }
    return valor === "true" ? [rota] : [];
  });
}

function normalizarBase(valor) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error("AGENDA_URL deve ser um endereço HTTP ou HTTPS válido.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("AGENDA_URL deve ser um endereço HTTP ou HTTPS válido.");
  }
  return url.href.replace(/\/+$/, "");
}

function lerTimeout(valor) {
  if (!/^\d+$/.test(valor)) {
    throw new Error("AGENDA_TIMEOUT deve ser um inteiro positivo de até 2147483 segundos.");
  }
  const timeout = Number(valor);
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2147483) {
    throw new Error("AGENDA_TIMEOUT deve ser um inteiro positivo de até 2147483 segundos.");
  }
  return timeout;
}

export async function executarAgenda(ambiente = process.env, transporte = fetch, logger = console) {
  const rotas = selecionarRotas(ambiente);
  if (rotas.length === 0) return 0;
  const segredo = ambiente.CRON_SECRET ?? "";
  if (!segredo) throw new Error("CRON_SECRET não configurado.");
  const timeout = lerTimeout(ambiente.AGENDA_TIMEOUT ?? "300");
  const base = normalizarBase(ambiente.AGENDA_URL ?? "http://127.0.0.1:3000");
  let falhas = 0;
  for (const rota of rotas) {
    try {
      const resposta = await transporte(`${base}${rota}`, {
        headers: { Authorization: `Bearer ${segredo}` },
        signal: AbortSignal.timeout(timeout * 1000),
      });
      if (!resposta.ok) {
        logger.error(`[agenda] ${rota}: HTTP ${resposta.status}`);
        falhas += 1;
      } else {
        logger.log(`[agenda] ${rota}: ok`);
      }
    } catch {
      // O transporte pode incluir URL ou cabeçalhos no erro; não expor seu texto.
      logger.error(`[agenda] ${rota}: falha de rede ou timeout`);
      falhas += 1;
    }
  }
  return falhas > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await executarAgenda();
  } catch (erro) {
    console.error(`[agenda] ${erro instanceof Error ? erro.message : "configuração inválida"}`);
    process.exitCode = 1;
  }
}
