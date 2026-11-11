// Serve fixtures sintéticas e prova HTTP/TLS apenas no namespace Nginx já conferido.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const inicializadorNginx = String.raw`#!/bin/sh
# Confere o confinamento antes de aceitar a fixture no loopback exclusivo.
set -eu
umask 077
trap 'exit 1' TERM INT QUIT
test "$(id -u):$(id -g)" = 101:101
awk '/^Cap(Inh|Prm|Eff|Bnd|Amb):/ {if ($2 != "0000000000000000") exit 1; n++} /^NoNewPrivs:/ {if ($2 != 1) exit 1; p++} END {if(n!=5 || p!=1) exit 1}' /proc/self/status
test "$(ls /sys/class/net)" = lo
test "$(wc -l < /proc/net/route)" -eq 1
test "$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start)" -eq 0
awk '$1=="nameserver" {if ($2!="127.0.0.1") exit 1; n++} END {if(n!=1) exit 1}' /etc/resolv.conf
awk '$2=="app" {if ($1!="127.0.0.1") exit 1; n++} END {if(n!=1) exit 1}' /etc/hosts
awk '$5=="/" {if ($6 !~ /(^|,)ro(,|$)/) exit 1; n++} END {if(n!=1) exit 1}' /proc/self/mountinfo
for d in /run /var/cache/nginx /etc/nginx/conf.d /etc/letsencrypt /var/www/certbot; do
  test "$(stat -c %u:%g "$d")" = 101:101
  awk -v d="$d" '$5==d {if ($0 !~ / - tmpfs / || $6 !~ /(^|,)rw(,|$)/) exit 1; n++} END {if(n!=1) exit 1}' /proc/self/mountinfo
done
test ! -e /var/run/docker.sock
test ! -e /run/docker.sock
printf 'NGINX_GATE %s\n' "$(readlink /proc/self/ns/net)"
# Porta alta somente no loopback; não há fixture antes da conferência do cliente.
nc -l -p 3100 > /run/fixture
# Protocolo fechado: três linhas base64, destinos fixos e nenhum comando recebido.
test "$(wc -c < /run/fixture)" -le 32768
test "$(wc -l < /run/fixture)" -eq 3
mkdir -p /etc/letsencrypt/live/frequenciapp /var/www/certbot/.well-known/acme-challenge
{
  IFS= read -r cert
  IFS= read -r chave
  IFS= read -r token
  printf '%s' "$cert" | base64 -d > /etc/letsencrypt/live/frequenciapp/fullchain.pem
  printf '%s' "$chave" | base64 -d > /etc/letsencrypt/live/frequenciapp/privkey.pem
  printf '%s' "$token" | base64 -d > /var/www/certbot/.well-known/acme-challenge/qa
} < /run/fixture
chmod 600 /etc/letsencrypt/live/frequenciapp/privkey.pem
chmod 644 /etc/letsencrypt/live/frequenciapp/fullchain.pem /var/www/certbot/.well-known/acme-challenge/qa
rm /run/fixture
# O entrypoint distribuído escolhe o modelo e inicia o Nginx real, sem alteração.
# Processo único evita alterar nginx.conf ou depender do número de CPUs do host.
exec /docker-entrypoint.sh nginx -g 'daemon off; master_process off;'
`;

export function conferirToken(resposta, esperado) {
  if (resposta.status === 404)
    throw Object.assign(new Error("token sintético ausente: HTTP 404"), { code: "ETOKEN_AUSENTE" });
  if (resposta.status !== 200 || resposta.corpo !== esperado)
    throw Object.assign(new Error("resposta HTTP do token divergente"), { code: "EHTTP_TOKEN" });
  return true;
}

function runtime(netns) {
  assert.equal(process.getuid(), 1000);
  assert.equal(process.getgid(), 1000);
  const status = fs.readFileSync("/proc/self/status", "utf8");
  for (const k of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])
    assert.match(status, new RegExp(`^${k}:\\s+0000000000000000$`, "m"));
  assert.match(status, /^NoNewPrivs:\s+1$/m);
  assert.deepEqual(fs.readdirSync("/sys/class/net"), ["lo"]);
  assert.equal(fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").length, 1);
  assert.equal(fs.readlinkSync("/proc/self/ns/net"), netns);
  assert.deepEqual(
    [...fs.readFileSync("/etc/resolv.conf", "utf8").matchAll(/^nameserver\s+(\S+)/gm)].map(
      (m) => m[1],
    ),
    ["127.0.0.1"],
  );
  for (const p of ["/var/run/docker.sock", "/run/docker.sock"])
    assert.equal(fs.existsSync(p), false);
  const montagens = fs
    .readFileSync("/proc/self/mountinfo", "utf8")
    .trim()
    .split("\n")
    .map((l) => l.split(" "));
  for (const destino of ["/", "/repo"]) {
    const m = montagens.filter((l) => l[4] === destino);
    assert.equal(m.length, 1);
    assert.ok(m[0][5].split(",").includes("ro"));
  }
  const scratch = montagens.filter((l) => l[4] === "/scratch");
  assert.equal(scratch.length, 1);
  assert.ok(scratch[0].includes("tmpfs"));
  assert.equal(fs.statSync("/scratch").uid, 1000);
  assert.equal(fs.statSync("/scratch").gid, 1000);
  assert.equal(
    fs.readFileSync("/proc/sys/net/ipv4/ip_unprivileged_port_start", "utf8").trim(),
    "0",
  );
  return {
    netns,
    uid: 1000,
    gid: 1000,
    capabilities: "zero",
    noNewPrivileges: true,
    interfaces: ["lo"],
    rotas: 0,
    portaNaoPrivilegiadaInicial: 0,
  };
}

function pedir(caminho, tls = false, ca) {
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).get(
      {
        hostname: "127.0.0.1",
        port: tls ? 443 : 80,
        path: caminho,
        headers: { Host: "nginx.invalid" },
        agent: false,
        ...(tls
          ? { ca, servername: "nginx.invalid", rejectUnauthorized: true, minVersion: "TLSv1.2" }
          : {}),
      },
      (res) => {
        const tlsInfo = tls
          ? { autorizado: res.socket.authorized, protocolo: res.socket.getProtocol() }
          : {};
        const partes = [];
        let tamanho = 0;
        res.on("data", (b) => {
          tamanho += b.length;
          if (tamanho > 65536) req.destroy(new Error("resposta excedeu limite"));
          else partes.push(b);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            corpo: Buffer.concat(partes).toString("utf8"),
            location: res.headers.location,
            ...tlsInfo,
          }),
        );
      },
    );
    req.setTimeout(3000, () => req.destroy(new Error("prazo HTTP")));
    req.on("error", reject);
  });
}

async function enviarFixture(certificado, chave, token) {
  const bytes =
    [certificado, chave, token].map((b) => Buffer.from(b).toString("base64")).join("\n") + "\n";
  assert.ok(Buffer.byteLength(bytes) < 32768);
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: 3100 });
    socket.on("connect", () => socket.end(bytes));
    socket.on("error", reject);
    socket.setTimeout(3000, () => socket.destroy(new Error("prazo da fixture")));
    socket.on("close", (erro) => {
      if (!erro) resolve();
    });
  });
}

export async function principal(args = process.argv.slice(2)) {
  assert.equal(args.length, 2);
  const netns = /^--netns=(net:\[\d+\])$/.exec(args[0])?.[1];
  const rodada = /^--rodada=([a-f0-9-]{36})$/.exec(args[1])?.[1];
  assert.ok(netns && rodada, "argumentos fechados obrigatórios");
  const controle = runtime(netns);
  const pasta = fs.mkdtempSync("/scratch/nginx-cert-");
  const cert = path.join(pasta, "cert.pem"),
    key = path.join(pasta, "key.pem");
  // Apenas o executável e os argumentos fixos desta receita; sem shell ou ambiente herdado.
  const r = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-days",
      "1",
      "-subj",
      "/CN=nginx.invalid",
      "-addext",
      "subjectAltName=DNS:nginx.invalid,IP:127.0.0.1",
      "-keyout",
      key,
      "-out",
      cert,
    ],
    {
      env: { PATH: "/usr/bin:/bin", HOME: "/scratch" },
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 65536,
    },
  );
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, "certificado sintético não foi gerado");
  fs.chmodSync(key, 0o600);
  const certificado = fs.readFileSync(cert),
    chave = fs.readFileSync(key);
  const token = `token-sintetico-${rodada}\n`;
  for (let i = 0; i < 30; i++) {
    try {
      await enviarFixture(certificado, chave, token);
      break;
    } catch (erro) {
      if (erro.code !== "ECONNREFUSED" || i === 29) throw erro;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  fs.rmSync(pasta, { recursive: true });
  let resposta;
  // Somente conexão recusada durante a partida recebe espera limitada. HTTP errado falha imediatamente.
  for (let i = 0; i < 50; i++) {
    try {
      resposta = await pedir("/.well-known/acme-challenge/qa");
      break;
    } catch (erro) {
      if (erro.code !== "ECONNREFUSED" || i === 49) throw erro;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  conferirToken(resposta, token);
  const caminho = "/caminho%20sintetico/sub?origem=ensaio&item=2";
  const redirecionamento = await pedir(caminho);
  assert.equal(redirecionamento.status, 301);
  assert.equal(redirecionamento.location, `https://nginx.invalid${caminho}`);
  const tls = await pedir("/api/saude?ensaio=sintetico", true, certificado);
  assert.equal(tls.autorizado, true);
  assert.ok(["TLSv1.2", "TLSv1.3"].includes(tls.protocolo));
  assert.equal(tls.status, 502, "upstream inexistente deve resultar em 502, não em saúde simulada");
  const ausente = await pedir(`/.well-known/acme-challenge/ausente-${rodada}`);
  assert.equal(ausente.status, 404);
  assert.notEqual(ausente.corpo, token);
  assert.throws(() => conferirToken(ausente, token), { code: "ETOKEN_AUSENTE" });
  const resultado = {
    tipo: "nginx-resultado",
    rodada,
    runtime: controle,
    positivo: {
      token80: true,
      redirecionamento301: true,
      tls443: true,
      tokenSha256: createHash("sha256").update(token).digest("hex"),
      location: redirecionamento.location,
      tls: { protocolo: tls.protocolo, autorizado: tls.autorizado, status: tls.status },
    },
    negativo: { tokenAusente: true, status: ausente.status, causa: "ETOKEN_AUSENTE" },
    limite:
      "TLS com upstream loopback inexistente; não comprova saúde do FrequenciApp, emissão ACME ou acesso externo",
  };
  // Exportar a prova antes do término e da desmontagem do tmpfs. Não exportar a chave.
  process.stdout.write(JSON.stringify(resultado) + "\n");
}
const direto =
  process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (direto)
  principal().catch((erro) => {
    process.stderr.write(`FALHOU: ${erro.message}\n`);
    process.exitCode = 1;
  });
