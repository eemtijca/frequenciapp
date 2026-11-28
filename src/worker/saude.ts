// Saúde e métricas internas do worker, sem porta pública e sem dado de aluno.
import { timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { ambiente } from "@/infra/ambiente";
import { banco } from "@/infra/banco";
import { filaDePlanilhas, filaDeTrabalhos } from "@/infra/fila/bullmq";
import { atualizarContagensBullmq, metricas } from "@/infra/metricas";

function tokenConfere(cabecalho: string | undefined, esperado: string): boolean {
  if (!cabecalho?.startsWith("Bearer ")) return false;
  const recebido = Buffer.from(cabecalho.slice(7));
  const alvo = Buffer.from(esperado);
  return recebido.length === alvo.length && timingSafeEqual(recebido, alvo);
}

async function verificarDependencias(): Promise<boolean> {
  const bancoOk = await banco().$queryRaw`SELECT 1`.then(
    () => true,
    () => false,
  );
  if (!bancoOk) return false;
  if (ambiente.fila.driver !== "redis") return true;
  const redisOk = await filaDeTrabalhos()
    .getJobCounts()
    .then(
      () => true,
      () => false,
    );
  return redisOk;
}

async function coletarMetricas(): Promise<string> {
  if (ambiente.fila.driver === "redis") {
    const [trabalhos, planilhas] = await Promise.all([
      filaDeTrabalhos().getJobCounts(),
      filaDePlanilhas().getJobCounts(),
    ]);
    atualizarContagensBullmq("trabalhos", trabalhos as unknown as Record<string, number>);
    atualizarContagensBullmq("planilha", planilhas as unknown as Record<string, number>);
  }
  return metricas().registro.metrics();
}

export interface SaudeDoWorker {
  servidor: Server;
  parar: () => Promise<void>;
}

export function iniciarSaude(): SaudeDoWorker {
  const servidor = createServer(async (requisicao, resposta) => {
    const url = new URL(requisicao.url ?? "/", "http://worker");
    if (requisicao.method !== "GET") {
      resposta.writeHead(405).end();
      return;
    }
    if (url.pathname === "/saude") {
      const ok = await verificarDependencias();
      resposta
        .writeHead(ok ? 200 : 503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        })
        .end(JSON.stringify({ ok }));
      return;
    }
    if (url.pathname === "/metricas") {
      const esperado = ambiente.metricasToken;
      if (!esperado) {
        resposta.writeHead(404).end();
        return;
      }
      if (!tokenConfere(requisicao.headers.authorization, esperado)) {
        resposta.writeHead(401).end();
        return;
      }
      try {
        const corpo = await coletarMetricas();
        resposta
          .writeHead(200, {
            "Content-Type": metricas().registro.contentType,
            "Cache-Control": "no-store",
          })
          .end(corpo);
      } catch {
        resposta.writeHead(503).end();
      }
      return;
    }
    resposta.writeHead(404).end();
  });

  servidor.listen(ambiente.fila.workerPorta, "0.0.0.0");

  return {
    servidor,
    parar: () =>
      new Promise((resolver, rejeitar) => {
        servidor.close((erro) => (erro ? rejeitar(erro) : resolver()));
      }),
  };
}
