// Permissions-Policy: o GPS vale só para a própria origem (mapa de locais de prova); câmera e microfone seguem bloqueados.
import { expect, it } from "vitest";
import nextConfig from "../../../next.config";

it("libera a geolocalização apenas para a própria origem e mantém câmera e microfone bloqueados", async () => {
  const regras = (await nextConfig.headers?.()) ?? [];
  const politica = regras
    .flatMap((regra) => regra.headers)
    .find((cabecalho) => cabecalho.key === "Permissions-Policy")?.value;
  expect(politica).toBeDefined();
  const diretivas = (politica ?? "").split(",").map((parte) => parte.trim());
  expect(diretivas).toContain("geolocation=(self)");
  expect(diretivas).toContain("camera=()");
  expect(diretivas).toContain("microphone=()");
  expect(politica).not.toContain("geolocation=*");
});
