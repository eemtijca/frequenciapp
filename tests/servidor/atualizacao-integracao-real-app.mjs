// App sintético por Unix: executa o migrador original e serve bytes da imagem.
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
const socket = "/http/app.sock";
export function consultarUnix(caminho = socket) {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath: caminho, path: "/api/saude", timeout: 1000 }, (res) => {
      const a = [];
      let n = 0;
      res.on("data", (b) => {
        n += b.length;
        if (n > 1024) res.destroy(new Error("HTTP_LIMITE"));
        else a.push(b);
      });
      res.once("error", reject);
      res.once("end", () =>
        res.statusCode === 200 ? resolve(Buffer.concat(a)) : reject(new Error("HTTP_STATUS")),
      );
    });
    req.once("error", reject);
    req.once("timeout", () => req.destroy(new Error("HTTP_PRAZO")));
  });
}
export function limparSocketProprio(n) {
  if (!fs.existsSync(n)) return;
  const s = fs.lstatSync(n);
  if (!s.isSocket() || s.uid !== process.getuid()) throw new Error("SOCKET_OWNER");
  fs.unlinkSync(n);
}
export function respostaCommit(commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("COMMIT");
  return Buffer.from(commit + "\n");
}
export async function iniciarApp() {
  if (process.getuid() !== 1000) throw new Error("APP_UID");
  const commit = fs.readFileSync("/app/commit.txt", "utf8").trim(),
    body = respostaCommit(commit);
  const codigo = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["/app/docker/app/migrar.mjs"], {
      cwd: "/app",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        DATABASE_URL: "postgresql://frequencia@localhost/frequencia?host=/pgsocket",
        DATABASE_SCHEMA: "public",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let n = 0;
    for (const s of [p.stdout, p.stderr])
      s.on("data", (b) => {
        n += b.length;
        if (n > 65536) p.kill("SIGTERM");
      });
    p.once("error", reject);
    p.once("close", (c, s) => (s ? reject(new Error("MIGRADOR_SINAL")) : resolve(c)));
  });
  if (codigo !== 0) throw new Error("MIGRADOR_CODIGO");
  limparSocketProprio(socket);
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/api/saude") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, resolve);
  });
  fs.chmodSync(socket, 0o666);
  const parar = () => server.close(() => process.exit(0));
  process.once("SIGTERM", parar);
  process.once("SIGINT", parar);
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length === 3 && ["--observar", "--saude"].includes(process.argv[2]))
      process.stdout.write(await consultarUnix());
    else if (process.argv.length === 2) await iniciarApp();
    else throw new Error("ARGUMENTOS");
  } catch (e) {
    process.stderr.write((e.code ?? e.message) + "\n");
    process.exitCode = 1;
  }
}
