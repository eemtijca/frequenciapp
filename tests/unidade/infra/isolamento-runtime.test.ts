// A prova privada precede HTTP e SQL; ambos precisam corresponder à mesma rodada.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assinarDesafio, verificarIsolamento } from "../../helpers/isolamento.mjs";

const f = vi.hoisted(() => ({
  rodada: "b".repeat(32),
  marcador: "c".repeat(64),
  runtimeValido: true,
  sqlValido: true,
  migracoesValidas: true,
  connect: vi.fn(),
  end: vi.fn(),
  query: vi.fn(),
  cliente: vi.fn(),
}));
const url = () =>
  `postgresql://ft_${f.rodada}:sintetica@127.0.0.1:5432/ft_${f.rodada}?schema=public`;
const prova = () => ({
  versao: 1 as const,
  rodada: f.rodada,
  marcador: f.marcador,
  rede: "net:[42]",
  databaseUrl: url(),
  appUrl: "http://127.0.0.1:3000",
});
vi.mock("node:fs", () => ({
  lstatSync: () => ({ isFile: () => true, mode: 0o100600, uid: process.getuid?.() ?? 0 }),
  readlinkSync: () => "net:[42]",
  readdirSync: (p: string) =>
    p === "/sys/class/net" ? ["lo"] : [{ name: "001", isDirectory: () => true }],
  readFileSync: (p: string) =>
    p.endsWith("manifesto.json")
      ? JSON.stringify(prova())
      : p.endsWith("route")
        ? "Iface Destination Gateway\n"
        : "select 1;",
}));
vi.mock("pg", () => ({
  default: {
    Client: function () {
      f.cliente();
      return { connect: f.connect, end: f.end, query: f.query };
    },
  },
}));
vi.mock("node:http", () => ({
  request: (opcoes: { path: string }, callback: (res: object) => void) => {
    const eventos = new Map<string, (valor?: unknown) => void>();
    return {
      setTimeout: () => undefined,
      on: () => undefined,
      end: () => {
        callback({
          on: (evento: string, fn: (valor?: unknown) => void) => eventos.set(evento, fn),
        });
        queueMicrotask(() => {
          eventos.get("data")?.(
            JSON.stringify({
              ...prova(),
              pid: 42,
              assinatura: f.runtimeValido
                ? assinarDesafio(prova(), opcoes.path.slice(1))
                : "divergente",
            }),
          );
          eventos.get("end")?.();
        });
      },
    };
  },
}));
beforeEach(() => {
  f.runtimeValido = true;
  f.sqlValido = true;
  f.migracoesValidas = true;
  vi.stubEnv("FREQUENCIAPP_ISOLAMENTO", "1");
  vi.stubEnv("DATABASE_URL", url());
  vi.stubEnv("DIRECT_URL", url());
  vi.stubEnv("APP_URL", prova().appUrl);
  vi.stubEnv("TEST_BASE_URL", prova().appUrl);
  vi.stubEnv("DATABASE_SCHEMA", "public");
  f.query.mockImplementation(async (sql: string) =>
    sql.includes("current_database")
      ? {
          rows: [
            {
              banco: `ft_${f.rodada}`,
              papel: `ft_${f.rodada}`,
              schema: "public",
              marcador: f.sqlValido ? f.marcador : "outro",
            },
          ],
        }
      : {
          rows: [
            {
              migration_name: "001",
              checksum: f.migracoesValidas
                ? createHash("sha256").update("select 1;").digest("hex")
                : "alterado",
              finished_at: "concluida",
              rolled_back_at: null,
            },
          ],
        },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, opcoes: { headers: Record<string, string> }) => ({
      ok: true,
      headers: new Headers({
        "x-frequenciapp-prova": assinarDesafio(
          prova(),
          opcoes.headers["x-frequenciapp-desafio"] ?? "",
        ),
      }),
    })),
  );
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("identidade do runtime", () => {
  it("confere a assinatura HTTP, o marcador SQL e cada checksum de migração", async () => {
    await expect(verificarIsolamento()).resolves.toMatchObject({ rodada: f.rodada });
    expect(fetch).toHaveBeenCalledOnce();
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.end).toHaveBeenCalledOnce();
  });
  it("não consulta HTTP ou SQL quando o processo privado é divergente", async () => {
    f.runtimeValido = false;
    await expect(verificarIsolamento()).rejects.toThrow(/isolamento/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(f.cliente).not.toHaveBeenCalled();
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("preserva a recusa original quando o fechamento também falha", async () => {
    f.sqlValido = false;
    const fechamento = new Error("fechamento");
    f.end.mockRejectedValueOnce(fechamento);
    await expect(verificarIsolamento()).rejects.toMatchObject({
      errors: [
        expect.objectContaining({ message: expect.stringMatching(/isolamento/i) }),
        fechamento,
      ],
    });
  });
  it.each(["marcador", "migrações"])("recusa %s divergente sem liberar a fixture", async (tipo) => {
    if (tipo === "marcador") f.sqlValido = false;
    else f.migracoesValidas = false;
    await expect(verificarIsolamento()).rejects.toThrow(/isolamento/i);
    expect(f.end).toHaveBeenCalledOnce();
  });
});
