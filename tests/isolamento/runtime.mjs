// Serve o aplicativo real e uma prova privada, sem criar rota no aplicativo.
import { createServer } from "node:http";
import { chmodSync } from "node:fs";
import next from "next";
import pg from "pg";
import {
  PASTA_PROVA,
  exigirIsolamento,
  conferirBanco,
  assinarDesafio,
} from "../helpers/isolamento.mjs";

const prova = exigirIsolamento();
const banco = new pg.Client({ connectionString: prova.databaseUrl, connectionTimeoutMillis: 3000 });
await banco.connect();
await conferirBanco(banco, prova);
const app = next({ dev: false, hostname: "127.0.0.1", port: 3000 });
await app.prepare();
const atender = app.getRequestHandler();
const http = createServer((req, res) => {
  const desafio = req.headers["x-frequenciapp-desafio"];
  if (typeof desafio === "string" && /^[a-f0-9]{64}$/.test(desafio)) {
    res.setHeader("x-frequenciapp-prova", assinarDesafio(prova, desafio));
  }
  atender(req, res).catch(() => {
    res.statusCode = 500;
    res.end();
  });
});
await new Promise((resolve, reject) => {
  http.once("error", reject);
  http.listen(3000, "127.0.0.1", resolve);
});
const privado = createServer(async (req, res) => {
  try {
    const desafio = req.url?.slice(1);
    if (!/^[a-f0-9]{64}$/.test(desafio ?? "")) throw new Error("Desafio inválido.");
    // A consulta usa o ambiente efetivo do mesmo processo Next que serve HTTP.
    exigirIsolamento();
    await conferirBanco(banco, prova);
    res.end(
      JSON.stringify({
        rodada: prova.rodada,
        rede: prova.rede,
        appUrl: prova.appUrl,
        pid: process.pid,
        assinatura: assinarDesafio(prova, desafio),
      }),
    );
  } catch {
    res.statusCode = 503;
    res.end("{}");
  }
});
await new Promise((resolve, reject) => {
  privado.once("error", reject);
  privado.listen(`${PASTA_PROVA}/app.sock`, resolve);
});
chmodSync(`${PASTA_PROVA}/app.sock`, 0o600);
async function fechar() {
  privado.close();
  http.closeAllConnections();
  http.close();
  await banco.end();
  await app.close();
  process.exit(0);
}
process.once("SIGTERM", fechar);
process.once("SIGINT", fechar);
