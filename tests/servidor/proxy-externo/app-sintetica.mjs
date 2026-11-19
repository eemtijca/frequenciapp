// Aplicação sintética do ensaio: saúde pública, métricas autenticadas e registro de caminhos.
import http from "node:http";

const token = process.env.METRICAS_TOKEN;
if (!token) throw new Error("METRICAS_TOKEN ausente no ensaio.");

const caminhos = [];
const servidor = http.createServer((pedido, resposta) => {
  caminhos.push(pedido.url);
  if (pedido.url === "/api/estado") {
    resposta.setHeader("content-type", "application/json");
    resposta.end(JSON.stringify({ caminhos }));
    return;
  }
  if (pedido.url === "/api/saude") {
    resposta.end("saude-sintetica\n");
    return;
  }
  if (pedido.url === "/api/metricas") {
    const autorizado = pedido.headers.authorization === `Bearer ${token}`;
    resposta.statusCode = autorizado ? 200 : 401;
    resposta.end(autorizado ? "frequenciapp_http_requests_total 1\n" : "nao autorizado\n");
    return;
  }
  resposta.statusCode = 404;
  resposta.end("nao encontrado\n");
});
servidor.listen(3000, "0.0.0.0");
