// Horários civis dos avisos, padrões de adesão e separação dos tipos por
// papel, sem banco e sem transporte externo.
import { describe, expect, it } from "vitest";
import {
  horarioDeEnvioAtingido,
  preferenciasParaPapel,
  tiposParaPapel,
  mensagemDeNovaChamada,
  mensagemDePendencias,
} from "@/domain/notificacoes";

describe("horários das notificações", () => {
  it("considera o horário da escola, incluindo o minuto exato do limite", () => {
    expect(
      horarioDeEnvioAtingido(new Date("2026-09-30T19:59:59Z"), "America/Fortaleza", "17:00"),
    ).toBe(false);
    expect(
      horarioDeEnvioAtingido(new Date("2026-09-30T20:00:00Z"), "America/Fortaleza", "17:00"),
    ).toBe(true);
    expect(
      horarioDeEnvioAtingido(new Date("2026-09-30T22:00:00Z"), "America/Fortaleza", "17:00"),
    ).toBe(true);
  });
  it("reinicia o limite após a meia-noite local", () => {
    expect(
      horarioDeEnvioAtingido(new Date("2026-10-01T02:59:00Z"), "America/Fortaleza", "23:59"),
    ).toBe(true);
    expect(
      horarioDeEnvioAtingido(new Date("2026-10-01T03:00:00Z"), "America/Fortaleza", "23:59"),
    ).toBe(false);
    expect(
      horarioDeEnvioAtingido(new Date("2026-10-01T03:00:00Z"), "America/Fortaleza", "00:00"),
    ).toBe(true);
  });
  it.each(["24:00", "8:00", "12:60", "inválido"])("recusa horário inválido %s", (horario) => {
    expect(horarioDeEnvioAtingido(new Date(), "America/Fortaleza", horario)).toBe(false);
  });
});

describe("preferências por papel", () => {
  it("preserva o resumo de diretores e exige adesão a novas chamadas", () => {
    expect(tiposParaPapel("DIRETOR_TURMA")).toEqual(["resumoDiario", "novasChamadas"]);
    expect(preferenciasParaPapel("DIRETOR_TURMA")).toEqual({
      resumoDiario: true,
      novasChamadas: false,
      chamadasPendentes: false,
    });
  });
  it.each(["ADMIN", "COORDENACAO"] as const)(
    "oferece pendências a %s, sem ampliar avisos de diretor",
    (papel) => {
      expect(tiposParaPapel(papel)).toEqual(["chamadasPendentes"]);
      expect(preferenciasParaPapel(papel, { resumoDiario: true, novasChamadas: true })).toEqual({
        resumoDiario: false,
        novasChamadas: false,
        chamadasPendentes: true,
      });
    },
  );
  it("preserva uma recusa explícita sem voltar ao padrão", () => {
    expect(
      preferenciasParaPapel("COORDENACAO", { chamadasPendentes: false }).chamadasPendentes,
    ).toBe(false);
    expect(preferenciasParaPapel("DIRETOR_TURMA", { resumoDiario: false }).resumoDiario).toBe(
      false,
    );
  });
  it("mantém etiquetas distintas por tipo e chamada sem dados individuais", () => {
    const nova = mensagemDeNovaChamada("2026-09-30", "chamada-sintetica");
    const outra = mensagemDeNovaChamada("2026-09-30", "outra-chamada");
    const pendente = mensagemDePendencias("2026-09-30");
    expect(nova.etiqueta).not.toBe(outra.etiqueta);
    expect(pendente.etiqueta).not.toBe(nova.etiqueta);
    expect(nova.corpo).toContain("Minhas turmas");
    expect(pendente.corpo).toContain("chamadas pendentes");
  });
});
