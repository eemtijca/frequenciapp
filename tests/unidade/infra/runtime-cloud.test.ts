// Contratos declarativos de runtime cloud sem a credencial usada para migrar.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const ler = (nuvem: string, arquivo: string) =>
  readFileSync(`infra/terraform/${nuvem}/${arquivo}.tf`, "utf8");
describe("separação de credenciais cloud", () => {
  it.each(["aws", "azure", "gcp"])("%s não deriva runtime do administrador do banco", (nuvem) => {
    const locais = ler(nuvem, "locals");
    expect(locais).toMatch(/url_runtime\s+= var\.url_runtime/);
    expect(locais).toMatch(/url_migracao\s+= var\.url_migracao/);
    const segredos = ler(nuvem, "segredos");
    expect(segredos).toContain("local.url_runtime");
    expect(segredos).toContain("local.url_migracao");
    const variaveis = ler(nuvem, "runtime");
    expect(variaveis).toContain('variable "runtime_provisionado"');
    expect(variaveis).toMatch(/default\s+= false/);
    expect(locais).toContain("url_runtime_efetiva");
    expect(locais).toContain("url_migracao_efetiva");
    expect(locais).toContain("schema_aplicacao_efetiva");
    expect(variaveis).toContain('local.schema_aplicacao_efetiva != "public"');
  });
  it.each(["azure", "gcp"])("%s cria o job de migração apenas em produção", (nuvem) => {
    const migracao = ler(nuvem, "migracao");
    expect(migracao).toMatch(/count\s+= var\.modo_local \? 0 : 1/);
    expect(migracao).toContain("docker/app/migrar.mjs");
  });
  it("AWS aguarda migrador isolado e não injeta DIRECT_URL no container api", () => {
    const codigo = ler("aws", "computacao");
    const inicioApi = codigo.search(/name\s*=\s*"api"/);
    const inicioMigrar = codigo.search(/name\s*=\s*"migrar"/);
    const app = codigo.slice(inicioApi, inicioMigrar);
    expect(app).toContain('value = "false"');
    expect(app).not.toContain('name = "DIRECT_URL"');
    expect(codigo).toContain('condition = "SUCCESS"');
    expect(codigo).toMatch(/name\s+=\s+"migrar"/);
  });
  it.each(["azure", "gcp"])(
    "%s mantém DIRECT_URL e IAM migrador fora do serviço principal",
    (nuvem) => {
      const codigo = ler(nuvem, "computacao");
      expect(codigo).not.toMatch(/name\s*=\s*"DIRECT_URL"|DIRECT_URL\s*=/);
      expect(codigo).not.toMatch(
        /google_secret_manager_secret\.direct_url|azurerm_key_vault_secret\.direct_url/,
      );
      expect(codigo).toContain("MIGRAR_NA_PARTIDA");
      expect(ler(nuvem, "migracao")).toContain("docker/app/migrar.mjs");
    },
  );
});
