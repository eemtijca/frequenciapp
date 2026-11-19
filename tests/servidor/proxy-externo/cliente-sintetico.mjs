// Cliente do ensaio: prova saúde, certificado, bloqueio no proxy e coleta autenticada no backend.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import https from "node:https";
import tls from "node:tls";
import { setTimeout as esperar } from "node:timers/promises";

const dominio = "frequencia.exemplo.invalid";
const token = process.env.METRICAS_TOKEN;
if (!token) throw new Error("METRICAS_TOKEN ausente no cliente do ensaio.");

function valor(texto, nome) {
  const achado = new RegExp(`^${nome} (\\S+)$`, "m").exec(texto);
  assert.ok(achado, `Métrica ${nome} ausente na sonda.`);
  return Number(achado[1]);
}

async function sondar(alvo, esperado) {
  const url = `http://blackbox-exporter:9115/probe?module=https_2xx&target=${encodeURIComponent(
    alvo,
  )}`;
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    try {
      const resposta = await fetch(url);
      if (resposta.ok) {
        const texto = await resposta.text();
        if (valor(texto, "probe_success") === esperado) return texto;
      }
    } catch {
      // O blackbox ainda não abriu a escuta; a próxima tentativa cobre a partida.
    }
    await esperar(100);
  }
  throw new Error(`O alvo ${alvo} não atingiu o resultado esperado dentro do prazo.`);
}

async function requisitar(servername, caminho, host) {
  return new Promise((resolve, reject) => {
    const pedido = https.request(
      {
        host: "proxy",
        port: 443,
        path: caminho,
        servername,
        ca: readFileSync("/fixture/ca.pem"),
        rejectUnauthorized: true,
        headers: { Host: host },
        checkServerIdentity: (_nome, certificado) =>
          tls.checkServerIdentity(servername, certificado),
      },
      (resposta) => {
        let corpo = "";
        resposta.setEncoding("utf8");
        resposta.on("data", (parte) => {
          corpo += parte;
        });
        resposta.on("end", () => resolve({ status: resposta.statusCode, corpo }));
      },
    );
    pedido.once("error", reject);
    pedido.end();
  });
}

const saude = await sondar("https://proxy:443/api/saude", 1);
assert.equal(valor(saude, "probe_success"), 1, "A saúde do domínio precisa responder 200.");
assert.equal(valor(saude, "probe_http_status_code"), 200);
assert.ok(
  valor(saude, "probe_ssl_earliest_cert_expiry") > Date.now() / 1000,
  "O certificado esperado precisa ser válido e confiado pela CA da fixture.",
);

const metricas = await sondar("https://proxy:443/api/metricas", 0);
assert.equal(valor(metricas, "probe_success"), 0, "A rota de métricas não pode responder 200.");
assert.equal(valor(metricas, "probe_http_status_code"), 404);

const estado = await (await fetch("http://app:3000/api/estado")).json();
assert.ok(estado.caminhos.includes("/api/saude"), "O proxy não encaminhou a saúde ao backend.");
assert.ok(
  !estado.caminhos.includes("/api/metricas"),
  "O proxy externo entregou /api/metricas ao backend.",
);

const semToken = await fetch("http://app:3000/api/metricas");
assert.equal(semToken.status, 401);
const comToken = await fetch("http://app:3000/api/metricas", {
  headers: { authorization: `Bearer ${token}` },
});
assert.equal(comToken.status, 200);
assert.match(await comToken.text(), /^frequenciapp_/m);

const vhost = await requisitar("painel.exemplo.invalid", "/", "painel.exemplo.invalid");
assert.equal(vhost.status, 200);
assert.match(vhost.corpo, /outro-vhost-sintetico/);

process.stdout.write(
  `Proxy externo: ${dominio} com Host, SNI e CA corretos; saúde 200; métricas 404 sem chegar ao backend; coleta autenticada 200.\n`,
);
