// Prova recusas reais no namespace da rodada antes de contas ou fixtures.
import assert from "node:assert/strict";
import net from "node:net";
import pg from "pg";
import { verificarIsolamento } from "../helpers/isolamento.mjs";

const ambiente = { ...process.env };
const conectarSocket = net.Socket.prototype.connect;
const conectarBanco = pg.Client.prototype.connect;
const fetchOriginal = globalThis.fetch;
let conexoes = 0;
const proibido = () => {
  conexoes++;
  throw new Error("Conexão indevida no negativo.");
};
net.Socket.prototype.connect = proibido;
pg.Client.prototype.connect = proibido;
globalThis.fetch = proibido;
const casos = [
  { FREQUENCIAPP_ISOLAMENTO: "" },
  { DATABASE_URL: "", DIRECT_URL: "" },
  { DATABASE_URL: ambiente.DATABASE_URL.replace("127.0.0.1", "externo.exemplo") },
  { DIRECT_URL: ambiente.DIRECT_URL.replace("/ft_", "/outro_") },
  { APP_URL: "http://externo.exemplo:3000" },
  { TEST_BASE_URL: "http://127.0.0.1:3001" },
];
try {
  for (const caso of casos) {
    Object.assign(process.env, caso);
    await assert.rejects(verificarIsolamento(), /isolamento/i);
    Object.assign(process.env, ambiente);
  }
  assert.equal(conexoes, 0);
} finally {
  net.Socket.prototype.connect = conectarSocket;
  pg.Client.prototype.connect = conectarBanco;
  globalThis.fetch = fetchOriginal;
  Object.assign(process.env, ambiente);
}
process.stdout.write(`[isolamento] ${casos.length} configurações recusadas, zero conexões.\n`);
