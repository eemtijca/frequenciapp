// Valida o encadeamento administrativo de chart, manifests e workflows.
import { describe, expect, it } from "vitest";

// @ts-expect-error: o validador é JavaScript sem declaração de tipos e fica fora do tsconfig.
import { validarInfra } from "../../../scripts/github/validar-ferramentas-infra.mjs";

type Executor = (comando: string, args: string[], entrada?: string) => Promise<string>;

describe("validação administrativa da infraestrutura", () => {
  it("encadeia Helm, kubeconform e actionlint sem ignorar ferramenta ausente", async () => {
    const chamadas: Array<{ comando: string; args: string[]; entrada?: string }> = [];
    const executar: Executor = async (comando, args, entrada) => {
      chamadas.push({ comando, args, entrada });
      return comando === "helm" && args[0] === "template"
        ? "kind: ConfigMap\napiVersion: v1\n"
        : "";
    };

    await validarInfra(executar);

    expect(chamadas.map((chamada) => chamada.comando)).toEqual([
      "helm",
      "helm",
      "kubeconform",
      "actionlint",
    ]);
    expect(chamadas[1]?.args).toContain("frequenciapp");
    expect(chamadas[2]?.args).toContain("-strict");
    expect(chamadas[2]?.entrada).toContain("kind: ConfigMap");
    expect(chamadas[3]?.args.length).toBeGreaterThan(0);
    expect(chamadas[3]?.args.every((arquivo) => arquivo.startsWith(".github/workflows/"))).toBe(
      true,
    );
  });

  it("propaga a falha da primeira ferramenta indisponível", async () => {
    const executar: Executor = async () => {
      throw new Error("Ferramenta indisponível");
    };
    await expect(validarInfra(executar)).rejects.toThrow("Ferramenta indisponível");
  });

  it("recusa Helm sem manifests", async () => {
    const executar: Executor = async (comando, args) => {
      if (comando === "helm" && args[0] === "template") return "   ";
      return "";
    };
    await expect(validarInfra(executar)).rejects.toThrow("Helm não produziu manifests");
  });
});
