// Executa a agenda periódica do FrequenciApp sem depender de cron externo.
const base = (process.env.AGENDA_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const segredo = process.env.CRON_SECRET ?? "";
const timeoutSegundos = Number(process.env.AGENDA_TIMEOUT ?? "300");

if (!segredo) {
  console.error("[agenda] CRON_SECRET não configurado.");
  process.exit(1);
}

const rotas = [
  "/api/notificacoes/agenda",
  "/api/planilha/fila/agenda",
  "/api/indicadores/agenda",
];

let falhas = 0;

for (const rota of rotas) {
  try {
    const resposta = await fetch(`${base}${rota}`, {
      headers: { Authorization: `Bearer ${segredo}` },
      signal: AbortSignal.timeout(timeoutSegundos * 1000),
    });
    if (!resposta.ok) {
      console.error(`[agenda] ${rota}: HTTP ${resposta.status}`);
      falhas += 1;
      continue;
    }
    console.log(`[agenda] ${rota}: ok`);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    console.error(`[agenda] ${rota}: ${motivo}`);
    falhas += 1;
  }
}

if (falhas > 0) process.exit(1);
