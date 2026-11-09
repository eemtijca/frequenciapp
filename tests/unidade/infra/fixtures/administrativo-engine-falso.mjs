// Simula Engine em processo separado; nunca conecta Docker ou PostgreSQL.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const [arquivo, modo = "normal"] = process.argv.slice(2);
let bytes = Buffer.alloc(0);
for await (const bloco of process.stdin) bytes = Buffer.concat([bytes, bloco]);
const fim = bytes.indexOf("\r\n\r\n");
const [linha] = bytes.subarray(0, fim).toString().split("\r\n");
const [metodo, caminho] = linha.split(" ");
const estado = JSON.parse(readFileSync(arquivo, "utf8"));
estado.chamadas.push({ metodo, caminho });
let resposta = null;
let status = 200;
if (caminho === "/v1.47/containers/create") {
  estado.id = randomBytes(32).toString("hex");
  estado.spec = JSON.parse(bytes.subarray(fim + 4).toString());
  estado.running = false;
  estado.existe = true;
  resposta = { Id: estado.id, Warnings: [] };
} else if (caminho === `/v1.47/containers/${estado.id}/json`) {
  if (!estado.existe) {
    status = 404;
    resposta = { message: `No such container: ${estado.id}` };
    // Só estas variantes fechadas substituem a inspeção após DELETE.
    const variantes = {
      "inspecao-204-vazia": { status: 204, resposta: null },
      "inspecao-200-nula": { status: 200, resposta: null },
      "inspecao-201-nula": { status: 201, resposta: null },
      "inspecao-200-array": { status: 200, resposta: [] },
      "inspecao-200-string": { status: 200, resposta: "ausente" },
      "inspecao-200-numero": { status: 200, resposta: 0 },
      "inspecao-200-booleano": { status: 200, resposta: false },
      "inspecao-201-objeto": { status: 201, resposta: {} },
    };
    if (metodo === "GET" && Object.hasOwn(variantes, modo)) {
      status = variantes[modo].status;
      resposta = variantes[modo].resposta;
      estado.inspecaoPosDelete = { modo, status };
    }
  } else
    resposta = {
      Id: estado.id,
      Config: estado.spec,
      HostConfig: estado.spec.HostConfig,
      Mounts: [],
      State: { Running: estado.running, ExitCode: 0 },
    };
} else if (caminho === `/v1.47/containers/${estado.id}/start`) estado.running = true;
else if (caminho === `/v1.47/containers/${estado.id}/stop`) estado.running = false;
else if (metodo === "DELETE" && caminho === `/v1.47/containers/${estado.id}`) estado.existe = false;
else throw new Error("Endpoint inesperado no Engine falso.");
writeFileSync(arquivo, JSON.stringify(estado), { mode: 0o600 });
if (modo === "perder-criacao" && caminho.endsWith("/create")) process.exit(0);
if (modo === "404-forcado") {
  status = 404;
  resposta = { message: `No such container: ${estado.id}` };
}
if (modo === "404-null") resposta = null;
if (modo === "404-array") resposta = [];
if (modo === "404-extra") resposta = { ...resposta, extra: true };
if (modo === "404-alheio")
  resposta = { message: `No such container: ${randomBytes(32).toString("hex")}` };
if (modo === "404-tipo") resposta = { message: 404 };
if (modo === "status-invalido") status = 500;
const corpo =
  status === 204
    ? ""
    : modo === "json-invalido"
      ? "{"
      : modo === "404-ausente"
        ? ""
        : JSON.stringify(resposta);
const tamanho = modo === "exceder" ? 20000 : Buffer.byteLength(corpo);
const versao = modo === "versao-invalida" ? "1.46" : "1.47";
const tipo = modo === "404-content-type" ? "text/plain" : "application/json";
const header = `HTTP/1.1 ${status} Sintetico\r\nAPI-Version: ${versao}\r\nContent-Type: ${tipo}\r\nContent-Length: ${tamanho}\r\nConnection: close\r\n\r\n`;
process.stdout.write(header.slice(0, 17));
process.stdout.write(header.slice(17));
process.stdout.end(modo === "truncar" ? corpo.slice(0, -1) : corpo);
