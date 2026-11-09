// Inspeciona metadados de recursos sem consultar nem modificar um daemon.
import { describe, expect, it } from "vitest";
import { validarContainer } from "../../isolamento/executar.mjs";
const rodada = "a".repeat(32);
const valido = () => ({
  Config: {
    Labels: { "br.frequenciapp.isolamento": rodada, "br.frequenciapp.isolamento.tipo": "execucao" },
  },
  Mounts: [],
  NetworkSettings: { Networks: {} },
  HostConfig: {
    NetworkMode: "container:proprio",
    PortBindings: {},
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges:true"],
    Privileged: false,
    Binds: null,
  },
});
describe("recursos exclusivos", () => {
  it("aceita apenas o recurso registrado da rodada", () => {
    expect(() => validarContainer(valido(), rodada, "execucao", "container:proprio")).not.toThrow();
  });
  it.each([
    [
      "rótulo",
      (f: ReturnType<typeof valido>) => {
        f.Config.Labels["br.frequenciapp.isolamento"] = "vizinho";
      },
    ],
    [
      "rede",
      (f: ReturnType<typeof valido>) => {
        f.HostConfig.NetworkMode = "host";
      },
    ],
    [
      "privilégios",
      (f: ReturnType<typeof valido>) => {
        f.HostConfig.Privileged = true;
      },
    ],
    [
      "capacidades",
      (f: ReturnType<typeof valido>) => {
        f.HostConfig.CapDrop = [];
      },
    ],
    [
      "elevação",
      (f: ReturnType<typeof valido>) => {
        f.HostConfig.SecurityOpt = [];
      },
    ],
  ])("recusa %s divergente", (_nome, alterar) => {
    const f = valido();
    alterar(f);
    expect(() => validarContainer(f, rodada, "execucao", "container:proprio")).toThrow();
  });
});
