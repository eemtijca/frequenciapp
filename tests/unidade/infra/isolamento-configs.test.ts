// A coleta de API e navegador também recusa o ambiente antes dos hooks.
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});
it.each([
  "../../../vitest.api.config",
  "../../../playwright.config",
  "../../../playwright.pwa.config",
  "../../../playwright.legibilidade-anon.config",
  "../../../playwright.paleta.config",
])("bloqueia coleta sem prova em %s", async (caminho) => {
  vi.resetModules();
  vi.stubEnv("FREQUENCIAPP_ISOLAMENTO", "");
  const erro = await import(caminho).then(
    () => null,
    (erro: unknown) => erro,
  );
  expect(erro).toBeInstanceOf(Error);
  expect(String(erro)).toMatch(/isolamento/i);
});
