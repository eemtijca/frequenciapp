// Regressões puras para propriedade e limpeza das justificativas da fixture.
import { describe, expect, it } from "vitest";
import {
  guardaDependentesFixture,
  inserirJustificativaFixture,
  novasJustificativasFixture,
  removerJustificativaFixture,
  type JustificativaFixture,
} from "../../helpers/justificativas-fixture";
import { executarLimpezas } from "../../helpers/limpeza-fixture";

type Tabela = "faltas" | "saidas_antecipadas" | "frequencias_parciais";

// Modelo em memória: a exclusão só é restrita quando o SQL contém os predicados.
function bancoSimulado() {
  const registros: JustificativaFixture[] = [];
  const dependentes: Record<Tabela, string[]> = {
    faltas: [],
    saidas_antecipadas: [],
    frequencias_parciais: [],
  };
  const consultar = async (sql: string, parametros: unknown[] = []) => {
    const [id, codigo, rotulo] = parametros;
    if (sql.startsWith("insert")) {
      if (registros.some((r) => r.codigo.toLowerCase() === String(codigo).toLowerCase()))
        throw new Error("código duplicado");
      registros.push({ id: String(id), codigo: String(codigo), rotulo: String(rotulo) });
      return { rows: [] };
    }
    if (sql.includes("codigo in ('QAAg','QAAg2')")) {
      for (let i = registros.length - 1; i >= 0; i--)
        if (["QAAg", "QAAg2"].includes(registros[i]?.codigo ?? "")) registros.splice(i, 1);
      return { rows: [] };
    }
    const indice = registros.findIndex(
      (r) => r.id === id && r.codigo === codigo && r.rotulo === rotulo,
    );
    if (sql.startsWith("select")) {
      const encontrado = sql.includes("codigo=$2")
        ? indice >= 0
        : registros.some((registro) => registro.id === id);
      return { rows: encontrado ? [{ id }] : [] };
    }
    if (!sql.startsWith("delete")) throw new Error(`SQL inesperado: ${sql}`);
    expect(sql).toMatch(/j\.id=\$1 and j\.codigo=\$2 and j\.rotulo=\$3/);
    for (const tabela of Object.keys(dependentes) as Tabela[]) {
      expect(sql).toContain(`not exists (select 1 from ${tabela}`);
      expect(sql).toMatch(/lower\(\w+\.justificativa\)=lower\(j\.codigo\)/);
    }
    const emUso = Object.values(dependentes).some((valores) =>
      valores.some((valor) => valor.toLowerCase() === String(codigo).toLowerCase()),
    );
    if (indice < 0 || emUso) return { rows: [] };
    registros.splice(indice, 1);
    return { rows: [{ id }] };
  };
  return { registros, dependentes, consultar };
}

describe("limpeza de justificativas da fixture", () => {
  it("gera dois códigos válidos e identidades e marcadores novos por execução", () => {
    const a = novasJustificativasFixture();
    const b = novasJustificativasFixture();
    for (const item of [...a, ...b]) {
      expect(item.codigo).toMatch(/^[A-Za-z][A-Za-z0-9]{0,9}$/);
      expect(item.rotulo.length).toBeLessThanOrEqual(60);
    }
    expect(new Set([...a, ...b].map((item) => item.id)).size).toBe(4);
    expect(new Set([...a, ...b].map((item) => item.codigo)).size).toBe(4);
    expect(new Set([...a, ...b].map((item) => item.rotulo)).size).toBe(4);
  });

  it("não remove código de outra execução em caso de colisão", async () => {
    const banco = bancoSimulado();
    const alheia = { id: "outro", codigo: "QAAg", rotulo: "Alheio" };
    const nossa = { id: "nosso", codigo: "QAAg", rotulo: "Nosso" };
    banco.registros.push(alheia);
    await expect(inserirJustificativaFixture(banco.consultar, nossa)).rejects.toThrow("duplicado");
    await removerJustificativaFixture(banco.consultar, nossa);
    expect(banco.registros).toEqual([alheia]);
  });

  it.each([
    ["marcador", { rotulo: "marcador alheio" }],
    ["código", { codigo: "Qoutro" }],
  ])("preserva e relata resíduo quando o %s diverge com o mesmo ID", async (_campo, mudanca) => {
    const banco = bancoSimulado();
    const nossa = { id: "nosso", codigo: "Qabcd", rotulo: "marcador nosso" };
    const alheia = { ...nossa, ...mudanca };
    banco.registros.push(alheia);
    await expect(removerJustificativaFixture(banco.consultar, nossa)).rejects.toThrow(
      /^Justificativa da fixture preservada: resíduo não resolvido por divergência de identidade\.$/,
    );
    expect(banco.registros).toEqual([alheia]);
  });

  it("limpa insert confirmado pelo servidor apesar de resposta perdida", async () => {
    const banco = bancoSimulado();
    const nossa = { id: "nosso", codigo: "Qabcd", rotulo: "marcador nosso" };
    await expect(
      inserirJustificativaFixture(async (sql, parametros) => {
        await banco.consultar(sql, parametros);
        throw new Error("resposta perdida");
      }, nossa),
    ).rejects.toThrow("resposta perdida");
    await removerJustificativaFixture(banco.consultar, nossa);
    expect(banco.registros).toEqual([]);
  });

  it.each(["faltas", "saidas_antecipadas", "frequencias_parciais"] as const)(
    "preserva o catálogo enquanto houver dependente em %s",
    async (tabela) => {
      const banco = bancoSimulado();
      const nossa = { id: "nosso", codigo: "QabcD", rotulo: "marcador nosso" };
      banco.registros.push(nossa);
      banco.dependentes[tabela].push("qabcd");
      await expect(removerJustificativaFixture(banco.consultar, nossa)).rejects.toThrow(
        "ainda possui dependentes",
      );
      expect(banco.registros).toEqual([nossa]);
    },
  );

  it("mantém ações independentes após falha e não remove catálogo em uso", async () => {
    const banco = bancoSimulado();
    const guarda = guardaDependentesFixture();
    const primeira = { id: "1", codigo: "Qum", rotulo: "primeira" };
    const segunda = { id: "2", codigo: "Qdois", rotulo: "segunda" };
    banco.registros.push(primeira, segunda);
    banco.dependentes.frequencias_parciais.push(primeira.codigo);
    const erro = new Error("falha ao limpar frequências");
    let fechou = false;
    let removeuAluno = false;
    await expect(
      executarLimpezas(
        [
          () =>
            guarda.limpar(async () => {
              throw erro;
            }),
          guarda.somenteSeLimpos(async () => {
            removeuAluno = true;
          }),
          () => removerJustificativaFixture(banco.consultar, primeira),
          () => removerJustificativaFixture(banco.consultar, segunda),
        ],
        async () => {
          fechou = true;
        },
      ),
    ).rejects.toBe(erro);
    expect(banco.registros).toEqual([primeira]);
    expect(fechou).toBe(true);
    expect(removeuAluno).toBe(false);
  });

  it("bloqueia cascatas seguintes se limpeza intermediária falhar", async () => {
    const guarda = guardaDependentesFixture();
    const executadas: string[] = [];
    const erro = new Error("falha intermediária");
    await expect(
      executarLimpezas([
        () =>
          guarda.limpar(async () => {
            executadas.push("frequências");
          }),
        guarda.somenteSeLimpos(async () => {
          executadas.push("alunos");
          throw erro;
        }),
        guarda.somenteSeLimpos(async () => {
          executadas.push("horários");
        }),
        async () => {
          executadas.push("independente");
        },
      ]),
    ).rejects.toBe(erro);
    expect(executadas).toEqual(["frequências", "alunos", "independente"]);
  });
});
