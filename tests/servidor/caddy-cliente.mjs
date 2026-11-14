// Exercita HTTPS sem SNI em rede isolada, confiando apenas na CA sintética do ensaio.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import { setTimeout as esperar } from "node:timers/promises";

const ip = "203.0.113.10";
const negativo = process.argv[2] === "sem-default-sni";
const app = http.createServer((pedido, resposta) => {
  if (pedido.url === "/prova-sem-sni") {
    assert.equal(pedido.headers.host, ip);
    assert.equal(pedido.headers["x-forwarded-proto"], "https");
  }
  resposta.end("aplicacao-sintetica\n");
});
await new Promise((resolve, reject) => {
  app.once("error", reject);
  app.listen(3000, "127.0.0.1", resolve);
});

try {
  let pronto = false;
  for (let tentativa = 0; tentativa < 50 && !pronto; tentativa++) {
    pronto = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port: 8443 });
      socket.setTimeout(200, () => socket.destroy());
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.once("close", () => resolve(false));
    });
    if (!pronto) await esperar(100);
  }
  assert.ok(pronto, "Caddy não abriu a porta isolada em 5 segundos.");

  const requisitar = () =>
    new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: "127.0.0.1",
        port: 8443,
        servername: "",
        ca: readFileSync("/fixture/ca.pem"),
        rejectUnauthorized: true,
        checkServerIdentity: (_nome, certificado) => tls.checkServerIdentity(ip, certificado),
      });
      let resposta = "";
      socket.setTimeout(5000, () => socket.destroy(new Error("Prazo do handshake esgotado.")));
      socket.once("error", reject);
      socket.once("secureConnect", () => {
        assert.equal(socket.authorized, true);
        assert.match(socket.getPeerCertificate().subjectaltname, /IP Address:203\.0\.113\.10/);
        socket.write(`GET /prova-sem-sni HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`);
      });
      socket.on("data", (dados) => {
        resposta += dados.toString();
      });
      socket.once("end", () => resolve(resposta));
    });

  if (negativo) {
    await assert.rejects(requisitar, (erro) => /^ERR_SSL_.*ALERT/.test(erro.code ?? ""));
    process.stdout.write("Controle negativo: sem default_sni, o handshake sem SNI é recusado.\n");
  } else {
    const resposta = await requisitar();
    assert.match(resposta, /^HTTP\/1\.1 200 /);
    assert.match(resposta, /aplicacao-sintetica/);
    process.stdout.write(
      "HTTPS sem SNI: CA sintética verificada, SAN IPv4 correto e proxy HTTP 200.\n",
    );
  }
} finally {
  app.closeAllConnections();
  await new Promise((resolve) => app.close(resolve));
}
