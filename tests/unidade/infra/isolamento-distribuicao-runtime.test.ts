// Exige o entrypoint final, a saúde HTTP e a identidade do mesmo banco antes do aceite.
import { expect, it, vi } from "vitest";
import { ensaiarDistribuicao } from "../../isolamento/executar.mjs";
const prova = { rodada: "a".repeat(32), rede: "net:[1]", ipCanario: "192.0.2.30" };
function fixture() {
  const eventos: string[] = [];
  const servidor = {
    saude: vi.fn(async () => {
      eventos.push("http");
    }),
    ownership: vi.fn(async () => {
      eventos.push("ownership");
    }),
    encerrar: vi.fn(async () => {
      eventos.push("encerrar");
    }),
  };
  const deps = {
    perimetro: async () => {
      eventos.push("perimetro");
    },
    consultar: vi.fn(async (sql: string) =>
      sql.includes("pg_stat_activity")
        ? {
            banco: `ft_${prova.rodada}`,
            papel: `ft_${prova.rodada}`,
            schema: "public",
            conexoes: 1,
          }
        : sql.includes("as objetos")
          ? { banco: `ft_${prova.rodada}`, papel: `ft_${prova.rodada}`, objetos: 0 }
          : { admin: 1, coordenacao: 1, turmas: 9, alunos: 300 },
    ),
    comando: vi.fn(async (_p: string, args: string[]) => {
      eventos.push(args[0] ?? "");
    }),
    servidor: vi.fn(async (_ambiente: NodeJS.ProcessEnv) => {
      eventos.push("entrypoint");
      return servidor;
    }),
  };
  return { deps, servidor, eventos };
}
it("só aceita a distribuição depois de iniciar entrypoint, comprovar HTTP e encerrar o servidor", async () => {
  const { deps, eventos } = fixture();
  await ensaiarDistribuicao(prova, deps);
  expect(eventos).toEqual([
    "perimetro",
    "docker/app/migrar.mjs",
    "scripts/administracao/criar-admin.mjs",
    "scripts/administracao/criar-coordenacao.mjs",
    "scripts/seed/seed.mjs",
    "entrypoint",
    "http",
    "ownership",
    "encerrar",
  ]);
  expect(deps.consultar.mock.calls.some(([sql]) => sql.includes("pg_stat_activity"))).toBe(true);
});
it.each(["saude", "ownership", "encerrar"] as const)(
  "recusa falha de %s sem deixar de encerrar o filho",
  async (fase) => {
    const { deps, servidor } = fixture();
    const erro = new Error(`falha-${fase}`);
    servidor[fase].mockRejectedValueOnce(erro);
    await expect(ensaiarDistribuicao(prova, deps)).rejects.toBe(erro);
    expect(servidor.encerrar).toHaveBeenCalledOnce();
  },
);
it("recusa conexão do runtime a outro banco e conserva a falha original se o encerramento falhar", async () => {
  const { deps, servidor } = fixture();
  deps.consultar.mockResolvedValueOnce({
    banco: `ft_${prova.rodada}`,
    papel: `ft_${prova.rodada}`,
    objetos: 0,
  });
  deps.consultar.mockResolvedValueOnce({ admin: 1, coordenacao: 1, turmas: 9, alunos: 300 });
  deps.consultar.mockResolvedValueOnce({
    banco: "vizinho",
    papel: `ft_${prova.rodada}`,
    schema: "public",
    conexoes: 1,
  });
  servidor.encerrar.mockRejectedValueOnce(new Error("cleanup"));
  await expect(ensaiarDistribuicao(prova, deps)).rejects.toThrow(/mesmo banco/);
  expect(servidor.encerrar).toHaveBeenCalledOnce();
});
