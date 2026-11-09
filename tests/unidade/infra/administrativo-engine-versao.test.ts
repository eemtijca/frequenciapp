// Confere o contrato HTTP do cliente real sobre um subprocesso explicitamente falso.
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { criarClienteEngine } from "../../isolamento/administrativo/postgres-nativo.mjs";

const id = "c".repeat(64);
const caminho = `/containers/${id}/json`;
const script = String.raw`// Responde bytes fixos sem Engine, socket ou banco real.
import fs from "node:fs";
let dados = Buffer.alloc(0), enviado = false;
process.stdin.on("data", (b) => {
  dados = Buffer.concat([dados, b]);
  if (enviado || !dados.includes("\r\n\r\n")) return;
  enviado = true;
  fs.writeFileSync(process.argv[2], dados.toString());
  process.stdout.end(Buffer.from(process.argv[3], "base64"), () => process.stdin.destroy());
});`;

function http(versao: string) {
  const corpo = JSON.stringify({ Id: id });
  return `HTTP/1.1 200 OK\r\nAPI-Version: ${versao}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(corpo)}\r\nConnection: close\r\n\r\n${corpo}`;
}

async function conferirResposta(
  wire: string,
  conferir: (resposta: Promise<unknown>) => Promise<void>,
) {
  const base = await mkdtemp(join(tmpdir(), "fadm-versao-"));
  const arquivo = join(base, "http-falso.mjs");
  const pedido = join(base, "pedido.txt");
  try {
    await writeFile(arquivo, script, { mode: 0o600 });
    expect(
      spawnSync(process.execPath, ["--check", arquivo], { env: { NODE_ENV: "test" } }).status,
    ).toBe(0);
    const iniciar = vi.fn(() =>
      spawn(process.execPath, [arquivo, pedido, Buffer.from(wire).toString("base64")], {
        env: { NODE_ENV: "test" },
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    const cliente = criarClienteEngine({ nome: `fadm-${"a".repeat(32)}`, iniciar });
    await conferir(cliente("GET", caminho));
    expect(iniciar).toHaveBeenCalledTimes(1);
    expect((await readFile(pedido, "utf8")).split("\r\n")[0]).toBe(`GET /v1.47${caminho} HTTP/1.1`);
  } finally {
    await rm(base, { recursive: true });
  }
}

it("ENGINE-VERSAO-01 aceita máximo 1.56 sem mudar o pedido v1.47", async () => {
  await conferirResposta(http("1.56"), async (resposta) => {
    await expect(resposta).resolves.toEqual({ Id: id });
  });
});

it.each(["1.47", "1.100"])("ENGINE-VERSAO-02 aceita máximo %s", async (versao) => {
  await conferirResposta(http(versao), async (resposta) => {
    await expect(resposta).resolves.toEqual({ Id: id });
  });
});

it("ENGINE-VERSAO-03 preserva a ausência permitida de API-Version", async () => {
  await conferirResposta(http("1.56").replace("API-Version: 1.56\r\n", ""), async (resposta) => {
    await expect(resposta).resolves.toEqual({ Id: id });
  });
});

it.each([
  "1.46",
  "0.99",
  "2.0",
  "v1.56",
  "1",
  "1.56.0",
  "1.056",
  "1.+56",
  "1.-56",
  "1.5e2",
  "1.9007199254740992",
  "",
  "1.47, 1.56",
  "1.56\r\nAPI-Version: 1.56",
  "1.56\r\napi-version: 1.47",
])("ENGINE-VERSAO-04 recusa anúncio incompatível ou ambíguo %j", async (versao) => {
  await conferirResposta(http(versao), async (resposta) => {
    await expect(resposta).rejects.toThrow("Versão Engine incompatível.");
  });
});

it.each(["truncado", "tipo", "status"] as const)(
  "ENGINE-VERSAO-05 máximo superior não dispensa HTTP válido: %s",
  async (modo) => {
    const wire = http("1.56");
    const invalido =
      modo === "truncado"
        ? wire.slice(0, -1)
        : modo === "tipo"
          ? wire.replace("application/json", "text/plain")
          : wire.replace("200 OK", "500 Internal Server Error");
    await conferirResposta(invalido, async (resposta) => {
      await expect(resposta).rejects.toThrow(
        modo === "truncado"
          ? /aborted|incompleta|sem resposta completa/
          : /Inspeção Engine inválida/,
      );
    });
  },
);

it.each([
  "/containers/json",
  `/containers/${"f".repeat(63)}/json`,
  `/containers/${"F".repeat(64)}/json`,
  `${caminho}?x=1`,
  `/v1.56${caminho}`,
])("ENGINE-VERSAO-06 recusa rota ou ID antes do subprocesso: %s", async (rota) => {
  const iniciar = vi.fn(() => {
    throw new Error("Subprocesso não deve iniciar.");
  });
  const cliente = criarClienteEngine({ nome: `fadm-${"a".repeat(32)}`, iniciar });
  await expect(cliente("GET", rota)).rejects.toThrow("Rota nativa não autorizada.");
  expect(iniciar).not.toHaveBeenCalled();
});

it("ENGINE-VERSAO-07 mantém o limite do pedido antes do subprocesso", async () => {
  const iniciar = vi.fn(() => {
    throw new Error("Subprocesso não deve iniciar.");
  });
  const cliente = criarClienteEngine({ nome: `fadm-${"a".repeat(32)}`, iniciar });
  await expect(cliente("POST", "/containers/create", { dados: "a".repeat(16384) })).rejects.toThrow(
    "Pedido Engine excedido.",
  );
  expect(iniciar).not.toHaveBeenCalled();
});
