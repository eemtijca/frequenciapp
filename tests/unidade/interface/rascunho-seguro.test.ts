// Executa o efeito de gravação real isolado; não substitui o aceite da interface no navegador.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function efeitoDeGravacao(contexto: Record<string, unknown>): () => void {
  const texto = readFileSync("src/components/chamada/vista-frequencia.tsx", "utf8");
  const fonte = ts.createSourceFile(
    "vista.tsx",
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let efeito: ts.Expression | undefined;
  function visitar(no: ts.Node) {
    if (
      ts.isCallExpression(no) &&
      no.expression.getText(fonte) === "useEffect" &&
      no.arguments[1]?.getText(fonte).match(/^\[\s*sujo,\s*ausencias,/)
    )
      efeito = no.arguments[0];
    ts.forEachChild(no, visitar);
  }
  visitar(fonte);
  if (!efeito) throw new Error("Efeito de gravação não encontrado.");
  const js = ts.transpileModule(`const acao = ${efeito.getText(fonte)}; acao;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(js, contexto) as () => void;
}

function leituraDeRascunho(contexto: Record<string, unknown>): () => void {
  const texto = readFileSync("src/components/chamada/vista-frequencia.tsx", "utf8");
  const fonte = ts.createSourceFile(
    "vista.tsx",
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let trecho: ts.TryStatement | undefined;
  function visitar(no: ts.Node) {
    if (
      ts.isTryStatement(no) &&
      no.tryBlock.statements[0]?.getText(fonte).startsWith("const bruto = sessionStorage.getItem")
    )
      trecho = no;
    ts.forEachChild(no, visitar);
  }
  visitar(fonte);
  if (!trecho) throw new Error("Leitura de rascunho não encontrada.");
  const js = ts.transpileModule(`const acao = () => { ${trecho.getText(fonte)} }; acao;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(js, contexto) as () => void;
}

describe("leitura local da chamada", () => {
  it("não apaga cópia recuperável se a leitura é bloqueada", () => {
    const removeItem = vi.fn();
    const toast = { error: vi.fn() };
    const ler = leituraDeRascunho({
      usuario: { id: "u" },
      dia: "d",
      turmaId: "t",
      chaveRascunho: () => "u:d:t",
      sessionStorage: {
        getItem() {
          throw new DOMException("Bloqueado", "SecurityError");
        },
        removeItem,
      },
      toast,
    });
    expect(ler).not.toThrow();
    expect(removeItem).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
  });
  it("falha ao remover conteúdo comprovadamente inválido não derruba a chamada", () => {
    const toast = { error: vi.fn() };
    const ler = leituraDeRascunho({
      usuario: { id: "u" },
      dia: "d",
      turmaId: "t",
      chaveRascunho: () => "u:d:t",
      sessionStorage: {
        getItem: () => "{",
        removeItem() {
          throw new DOMException("Bloqueado", "SecurityError");
        },
      },
      toast,
    });
    expect(ler).not.toThrow();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("rascunho no efeito da chamada", () => {
  for (const nome of ["QuotaExceededError", "SecurityError"]) {
    it(`preserva cópia anterior e avisa uma vez por episódio de ${nome}`, () => {
      const copias = new Map([["u:d:t", "cópia anterior"]]);
      let falhar = true;
      const removeItem = vi.fn((chave: string) => copias.delete(chave));
      const armazenamento = {
        setItem(chave: string, valor: string) {
          if (falhar) throw new DOMException("Falha sintética", nome);
          copias.set(chave, valor);
        },
        removeItem,
      };
      const toast = { error: vi.fn() };
      const estado = {
        sujo: true,
        dia: "d",
        turmaId: "t",
        usuario: { id: "u" },
        ausencias: new Map([["aluno", new Set(["aula"])]]),
        justificativas: new Map(),
        observacoes: new Map(),
        revisaoSalva: 3,
        sabadoLiberado: false,
        justificativasAntecipadasRef: { current: [] },
        falhaRascunho: { current: "" },
        chaveRascunho: (u: string, d: string, t: string) => `${u}:${d}:${t}`,
        sessionStorage: armazenamento,
        toast,
      };
      const gravar = efeitoDeGravacao(estado);
      gravar();
      gravar();
      expect(copias.get("u:d:t")).toBe("cópia anterior");
      expect(removeItem).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledOnce();
      falhar = false;
      gravar();
      expect(JSON.parse(copias.get("u:d:t") ?? "null")).toMatchObject({
        revisao: 3,
        faltas: [{ alunoId: "aluno", horarios: ["aula"] }],
      });
      falhar = true;
      gravar();
      expect(toast.error).toHaveBeenCalledTimes(2);
      expect(estado.ausencias.has("aluno")).toBe(true);
    });
  }
});
