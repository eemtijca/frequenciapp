// Automação do schema de preview: nomes, conta sintética, paginação e decisão da faxina.
import { describe, expect, it, vi } from "vitest";
import {
  emailDaConta,
  faxina,
  nomeDoSchema,
  prsAbertos,
  schemasParaRemover,
} from "../../../scripts/banco/preview-schema.mjs";

const pagina = (inicio: number, quantidade: number) =>
  Array.from({ length: quantidade }, (_, indice) => ({ number: inicio + indice }));

describe("faxina com inventário completo", () => {
  it("percorre duas páginas cheias e preserva o PR presente só na última", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(pagina(1, 100))))
      .mockResolvedValueOnce(new Response(JSON.stringify(pagina(101, 100))))
      .mockResolvedValueOnce(new Response(JSON.stringify(pagina(201, 1))));
    const abertos = await prsAbertos({
      repositorio: "escola/app",
      token: "ficticio",
      buscar,
    });
    expect(abertos).toHaveLength(201);
    expect(buscar.mock.calls.map(([url]) => new URL(url).searchParams.get("page"))).toEqual([
      "1",
      "2",
      "3",
    ]);
    for (const [, opcoes] of buscar.mock.calls) {
      expect(opcoes).toMatchObject({ redirect: "error" });
      expect(opcoes.headers).toMatchObject({ authorization: "Bearer ficticio" });
    }
    expect(
      schemasParaRemover(
        ["preview_pr_201", "preview_pr_202", "preview_pr_0", "preview_pr_01"],
        abertos,
      ),
    ).toEqual(["preview_pr_202"]);
  });

  it("recusa repositório fora do formato dono/nome", async () => {
    const buscar = vi.fn();
    await expect(prsAbertos({ repositorio: "escola", token: "ficticio", buscar })).rejects.toThrow(
      "GITHUB_REPOSITORY e GITHUB_TOKEN",
    );
    await expect(
      prsAbertos({ repositorio: "escola/../outra", token: "ficticio", buscar }),
    ).rejects.toThrow("GITHUB_REPOSITORY e GITHUB_TOKEN");
    expect(buscar).not.toHaveBeenCalled();
  });

  it.each(["http", "json", "objeto", "numero", "duplicada"])(
    "aborta %s antes de qualquer DROP",
    async (falha) => {
      const resposta =
        falha === "http"
          ? new Response("", { status: 503 })
          : falha === "json"
            ? new Response("{")
            : new Response(
                JSON.stringify(
                  falha === "objeto"
                    ? {}
                    : falha === "numero"
                      ? [{ number: "101" }]
                      : pagina(1, 100),
                ),
              );
      const buscar = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(pagina(1, 100))))
        .mockResolvedValueOnce(resposta);
      const query = vi.fn().mockResolvedValue({ rows: [{ nspname: "preview_pr_201" }] });
      const end = vi.fn();
      await expect(
        faxina({
          conectar: async () => ({ query, end }),
          lerPrs: () => prsAbertos({ repositorio: "escola/app", token: "ficticio", buscar }),
        }),
      ).rejects.toThrow();
      expect(query.mock.calls.filter(([sql]) => /drop/i.test(sql))).toHaveLength(0);
    },
  );

  it("executa remoção só depois de concluir a listagem", async () => {
    const ordem: string[] = [];
    const query = vi.fn(async (sql: string) => {
      ordem.push(sql);
      return { rows: [{ nspname: "preview_pr_2" }] };
    });
    await faxina({
      conectar: async () => ({ query, end: vi.fn() }),
      lerPrs: async () => {
        ordem.push("listagem completa");
        return [1];
      },
    });
    expect(ordem.findIndex((s) => /drop schema/.test(s))).toBeGreaterThan(
      ordem.indexOf("listagem completa"),
    );
  });
});

describe("schema de preview por pull request", () => {
  it("nomeia e valida o número do pull request", () => {
    expect(nomeDoSchema(125)).toBe("preview_pr_125");
    expect(nomeDoSchema("42")).toBe("preview_pr_42");
    for (const valor of [0, -1, 1.5, "abc", undefined]) {
      expect(() => nomeDoSchema(valor)).toThrow("O número do pull request é inválido");
    }
  });

  it("deriva o e-mail da conta sintética", () => {
    expect(emailDaConta(42)).toBe("preview-pr-42@escola.exemplo");
  });

  it("remove apenas schemas de preview sem pull request aberto", () => {
    const existentes = ["preview_pr_1", "preview_pr_2", "preview", "public", "preview_pr_10"];
    expect(schemasParaRemover(existentes, [2, 10])).toEqual(["preview_pr_1"]);
    expect(schemasParaRemover(existentes, [1, 2, 10])).toEqual([]);
  });
});
