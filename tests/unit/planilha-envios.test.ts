// Cartões das integrações com planilha: erro vigente por grupo, data do
// último envio e datas sem horário, independentes do fuso do processo.
import { describe, expect, it } from "vitest";
import { erroVigente, rotuloInstante, rotuloUltimoEnvio } from "@/domain/planilha";
import { rotuloData } from "@/domain/frequencia";

type Resultado = "SUCESSO" | "FALHA" | "PARCIAL";

interface Registro {
  resultado: Resultado;
  criadoEm: string;
  turma: string | null;
}

function registro(resultado: Resultado, criadoEm: string, turma: string | null = "A"): Registro {
  return { resultado, criadoEm, turma };
}

const unico = () => "saidas";
const porTurma = (item: Registro) => item.turma;

describe("erroVigente com grupo único (saídas)", () => {
  it("some quando o envio mais recente foi sucesso, mesmo com falha antes", () => {
    const historico = [
      registro("FALHA", "2026-08-31T12:00:00Z"),
      registro("SUCESSO", "2026-09-27T15:00:00Z"),
    ];
    expect(erroVigente(historico, unico)).toBeNull();
  });

  it("aparece quando o envio mais recente foi falha", () => {
    const historico = [
      registro("SUCESSO", "2026-08-31T12:00:00Z"),
      registro("FALHA", "2026-09-27T15:00:00Z"),
    ];
    expect(erroVigente(historico, unico)?.resultado).toBe("FALHA");
  });

  it("mostra envio parcial quando ele é o mais recente, sem depender da ordem de entrada", () => {
    const historico = [
      registro("PARCIAL", "2026-09-27T15:00:00Z"),
      registro("SUCESSO", "2026-09-20T12:00:00Z"),
      registro("FALHA", "2026-08-31T12:00:00Z"),
    ];
    expect(erroVigente(historico, unico)?.resultado).toBe("PARCIAL");
  });

  it("devolve nulo sem envios", () => {
    expect(erroVigente([], unico)).toBeNull();
  });
});

describe("erroVigente por turma (frequência)", () => {
  it("mantém a falha de uma turma mesmo com sucesso posterior de outra", () => {
    const historico = [
      registro("FALHA", "2026-09-27T15:00:00Z", "A"),
      registro("SUCESSO", "2026-09-27T15:00:05Z", "B"),
    ];
    expect(erroVigente(historico, porTurma)?.turma).toBe("A");
  });

  it("apaga a falha da turma quando ela é enviada de novo com sucesso", () => {
    const historico = [
      registro("FALHA", "2026-08-31T12:00:00Z", "A"),
      registro("SUCESSO", "2026-09-01T12:00:00Z", "B"),
      registro("SUCESSO", "2026-09-27T15:00:00Z", "A"),
    ];
    expect(erroVigente(historico, porTurma)).toBeNull();
  });

  it("escolhe a falha mais recente entre turmas ainda com erro", () => {
    const historico = [
      registro("FALHA", "2026-09-10T12:00:00Z", "A"),
      registro("PARCIAL", "2026-09-20T12:00:00Z", "B"),
      registro("SUCESSO", "2026-09-25T12:00:00Z", "C"),
    ];
    const vigente = erroVigente(historico, porTurma);
    expect(vigente?.turma).toBe("B");
    expect(vigente?.resultado).toBe("PARCIAL");
  });

  it("ignora registro de turma excluída", () => {
    const historico = [
      registro("FALHA", "2026-09-27T15:00:00Z", null),
      registro("SUCESSO", "2026-09-20T12:00:00Z", "A"),
    ];
    expect(erroVigente(historico, porTurma)).toBeNull();
  });
});

describe("datas dos cartões", () => {
  it("formata dia civil sem voltar um dia em fuso negativo ou avançar em positivo", () => {
    expect(rotuloData("2026-09-01")).toBe("01/09/2026");
    expect(rotuloData("2026-12-31")).toBe("31/12/2026");
  });

  it("usa a data em que o envio aconteceu, não o início do período", () => {
    const sincronizacoes = [
      { de: "2026-09-01", ate: "2026-09-30", criadoEm: "2026-09-27T15:00:00.000Z" },
      { de: "2026-08-01", ate: "2026-08-31", criadoEm: "2026-08-31T12:00:00.000Z" },
    ];
    expect(rotuloUltimoEnvio(sincronizacoes, "America/Fortaleza")).toBe(
      "Último envio em 27/09/2026",
    );
  });

  it("lê o instante no fuso da escola", () => {
    const sincronizacoes = [{ criadoEm: "2026-09-27T02:00:00.000Z" }];
    expect(rotuloUltimoEnvio(sincronizacoes, "America/Fortaleza")).toBe(
      "Último envio em 26/09/2026",
    );
    expect(rotuloUltimoEnvio(sincronizacoes, "Asia/Tokyo")).toBe("Último envio em 27/09/2026");
  });

  it("indica ausência de envios", () => {
    expect(rotuloUltimoEnvio([], "America/Fortaleza")).toBe("Sem envios");
  });

  it("formata instante vazio, inválido ou sem fuso sem quebrar", () => {
    expect(rotuloInstante(null, "America/Fortaleza")).toBe("");
    expect(rotuloInstante("não é data", "America/Fortaleza")).toBe("");
    expect(rotuloInstante("2026-09-27T15:00:00.000Z", "")).toBe("27/09/2026");
    expect(rotuloInstante("2026-09-27T15:00:00.000Z", "Fuso/Inexistente")).toBe("27/09/2026");
  });
});
