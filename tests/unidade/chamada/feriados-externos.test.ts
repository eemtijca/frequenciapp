// Conversão das datas da base externa para o calendário civil, sem rede.
import { describe, expect, it } from "vitest";
import {
  diaDaDataApi,
  nomeDeFeriadoExterno,
  reunirFeriadosExternos,
} from "@/domain/feriados-externos";

describe("feriados externos", () => {
  it("converte a data da base e recusa dia fora do ano ou inválido", () => {
    expect(diaDaDataApi("12/10/2026", 2026)).toBe("2026-10-12");
    expect(diaDaDataApi(" 29/02/2028 ", 2028)).toBe("2028-02-29");
    expect(diaDaDataApi("29/02/2026", 2026)).toBeNull();
    expect(diaDaDataApi("12/10/2026", 2027)).toBeNull();
    expect(diaDaDataApi("2026-10-12", 2026)).toBeNull();
    expect(diaDaDataApi("31/04/2026", 2026)).toBeNull();
  });

  it("apara o nome e limita o tamanho da coluna", () => {
    expect(nomeDeFeriadoExterno("  Natal   da escola  ")).toBe("Natal da escola");
    expect(nomeDeFeriadoExterno("   ")).toBeNull();
    expect(nomeDeFeriadoExterno("A".repeat(121))).toBe("A".repeat(120));
  });

  it("reúne páginas em ordem, sem repetir a data", () => {
    const reunido = reunirFeriadosExternos(
      [
        { data: "21/04/2026", nome: "Tiradentes" },
        { data: "01/01/2026", nome: "  Confraternização  " },
        { data: "21/04/2026", nome: "Outro nome" },
        { data: "32/01/2026", nome: "Inválido" },
        { data: "07/09/2027", nome: "Outro ano" },
        { data: "12/10/2026", nome: "" },
      ],
      2026,
    );
    expect(reunido.feriados).toEqual([
      { dia: "2026-01-01", nome: "Confraternização" },
      { dia: "2026-04-21", nome: "Tiradentes" },
    ]);
    expect(reunido.ignorados).toBe(3);
  });
});
