// Confere identidade, endereços e perímetro sem abrir sockets.
import { afterEach, describe, expect, it, vi } from "vitest";
import { exigirIsolamento } from "../../helpers/isolamento.mjs";

const prova = vi.hoisted(() => ({
  rodada: "0123456789abcdef0123456789abcdef",
  rede: "net:[4242]",
  interfaces: ["lo"],
  rotas: "Iface\tDestination\tGateway\n",
}));
const url = `postgresql://ft_${prova.rodada}:sintetica@127.0.0.1:5432/ft_${prova.rodada}?schema=public`;
const manifesto = () => ({
  versao: 1,
  rodada: prova.rodada,
  rede: prova.rede,
  databaseUrl: url,
  appUrl: "http://127.0.0.1:3000",
  marcador: "a".repeat(64),
});
vi.mock("node:fs", () => ({
  readFileSync: (caminho: string) =>
    caminho.endsWith("manifesto.json") ? JSON.stringify(manifesto()) : prova.rotas,
  lstatSync: () => ({ isFile: () => true, mode: 0o100600, uid: process.getuid?.() ?? 0 }),
  readlinkSync: () => prova.rede,
  readdirSync: () => prova.interfaces,
}));
const ambiente = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  FREQUENCIAPP_ISOLAMENTO: "1",
  DATABASE_URL: url,
  DIRECT_URL: url,
  APP_URL: "http://127.0.0.1:3000",
  TEST_BASE_URL: "http://127.0.0.1:3000",
  DATABASE_SCHEMA: "public",
});
afterEach(() => {
  prova.interfaces = ["lo"];
  prova.rotas = "Iface\tDestination\tGateway\n";
});

describe("configuração provada", () => {
  it("aceita somente os destinos registrados pelo provisionador no namespace sem rotas", () => {
    expect(exigirIsolamento(ambiente())).toMatchObject({ databaseUrl: url, rodada: prova.rodada });
  });
  it.each([
    ["DATABASE_URL", ""],
    ["DIRECT_URL", ""],
    ["APP_URL", ""],
    ["TEST_BASE_URL", ""],
    ["DATABASE_URL", url.replace("127.0.0.1", "externo.exemplo")],
    ["DIRECT_URL", url.replace("/ft_", "/outro_")],
    ["APP_URL", "http://externo.exemplo:3000"],
    ["TEST_BASE_URL", "http://127.0.0.1:3001"],
    ["DATABASE_SCHEMA", "outro"],
    ["PGHOST", "externo.exemplo"],
    ["DATABASE_URL", `${url}&host=externo.exemplo`],
  ])("recusa %s divergente antes de conexão", (chave, valor) => {
    expect(() => exigirIsolamento({ ...ambiente(), [chave]: valor })).toThrow(/isolamento/i);
  });
  it("recusa até rede interna quando existe interface não loopback", () => {
    prova.interfaces = ["lo", "eth0"];
    expect(() => exigirIsolamento(ambiente())).toThrow(/isolamento/i);
  });
  it("recusa qualquer rota IPv4", () => {
    prova.rotas += "eth0\t00000000\t010011AC\n";
    expect(() => exigirIsolamento(ambiente())).toThrow(/isolamento/i);
  });
});
