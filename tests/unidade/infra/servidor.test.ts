// Guarda os contratos dos arquivos de servidor auto-hospedado.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

async function ler(caminho: string): Promise<string> {
  return readFile(path.join(RAIZ, caminho), "utf8");
}

describe("servidor auto-hospedado", () => {
  it("não publica as portas da aplicação e do banco", async () => {
    const compose = await ler("compose.servidor.yml");

    expect(compose).toContain("ports: !reset []");
    expect(compose).toContain("internal: true");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain('profiles: ["backup"]');
  });

  it("mantém Caddy público e interno com proxy e saúde", async () => {
    const publico = await ler("infra/servidor/Caddyfile");
    const interno = await ler("infra/servidor/Caddyfile.interno");

    expect(publico).toContain("acme_ca {$ACME_CA}");
    expect(publico).toContain("reverse_proxy app:3000");
    expect(publico).toContain("health_uri /api/saude");
    expect(publico).toContain("admin off");
    expect(interno).toContain("tls internal");
    expect(interno).toContain("reverse_proxy app:3000");
  });

  it("mantém Nginx com HTTP inicial, HTTPS e cabeçalhos de proxy", async () => {
    const http = await ler("infra/servidor/nginx/frequenciapp-http.conf");
    const https = await ler("infra/servidor/nginx/frequenciapp-https.conf");

    expect(http).toContain("acme-challenge");
    expect(http).toContain("return 503");
    expect(https).toContain("listen 443 ssl");
    expect(https).toContain("ssl_protocols TLSv1.2 TLSv1.3");
    expect(https).toContain("proxy_pass http://app:3000");
    expect(https).toContain("X-Forwarded-For");
    expect(https).toContain("X-Forwarded-Proto");
  });

  it("mantém backup com Compose, URL, GPG e age", async () => {
    const backup = await ler("scripts/servidor/backup-banco.sh");
    const imagem = await ler("infra/servidor/backup/Dockerfile");

    expect(backup).toContain("BACKUP_MODO");
    expect(backup).toContain("compose | url");
    expect(backup).toContain("BACKUP_CRIPTOGRAFIA");
    expect(backup).toContain("gpg | age");
    expect(backup).toContain("pg_restore -l");
    expect(backup).toContain("sha256sum");
    expect(backup).toContain("rclone_limpo copy");
    expect(imagem).toContain("postgresql-client-17");
    expect(imagem).toContain("rclone");
    expect(imagem).toContain("age");
  });

  it("mantém atualização com modos, backup, migração e rollback", async () => {
    const atualizar = await ler("scripts/servidor/atualizar.sh");

    expect(atualizar).toContain("auto | release | main");
    expect(atualizar).toContain("ATUALIZAR_BACKUP_ANTES");
    expect(atualizar).toContain("prisma/migrations");
    expect(atualizar).toContain("--permitir-migracoes");
    expect(atualizar).toContain("checkout --detach");
    expect(atualizar).toContain("escrever_falha");
  });

  it("mantém as rotinas com trava e limpeza", async () => {
    for (const arquivo of [
      "scripts/servidor/agenda.sh",
      "scripts/servidor/backup-banco.sh",
      "scripts/servidor/backup-planilhas.sh",
      "scripts/servidor/restaurar.sh",
      "scripts/servidor/atualizar.sh",
      "scripts/servidor/renovar-certificado.sh",
    ]) {
      const conteudo = await ler(arquivo);
      expect(conteudo, arquivo).toContain("set -Eeuo pipefail");
      expect(conteudo, arquivo).toContain("comum.sh");
    }

    const comum = await ler("scripts/servidor/comum.sh");
    expect(comum).toContain("flock -n");
    expect(comum).toContain("verificar_permissao_arquivo");
    expect(comum).toContain("montar_compose");
  });

  it("documenta as variáveis obrigatórias do exemplo", async () => {
    const exemplo = await ler("infra/servidor/servidor.env.example");

    for (const variavel of [
      "PROXY_TIPO=caddy",
      "TLS_MODO=acme",
      "DOMINIO=",
      "ACME_EMAIL=",
      "BACKUP_CRIPTOGRAFIA=gpg",
      "BACKUP_GPG_DESTINATARIO=",
      "BACKUP_MODO=compose",
      "ATUALIZAR_MODO=auto",
      "AGENDA_HORARIO=",
    ]) {
      expect(exemplo, variavel).toContain(variavel);
    }
  });

  it("libera o Caddyfile do servidor e ignora certificados internos", async () => {
    const ignorados = await ler(".gitignore");

    expect(ignorados).toContain("/Caddyfile");
    expect(ignorados).toContain("infra/servidor/nginx/certificados/");
  });

  it("mantém o chart Helm com migração, agenda e backup", async () => {
    const chart = await ler("infra/kubernetes/frequenciapp/Chart.yaml");
    const deployment = await ler("infra/kubernetes/frequenciapp/templates/deployment.yaml");
    const values = await ler("infra/kubernetes/frequenciapp/values.yaml");

    expect(chart).toContain("name: frequenciapp");
    expect(deployment).toContain("initContainers");
    expect(deployment).toContain('node", "./docker/app/migrar.mjs');
    expect(values).toContain('MIGRAR_NA_PARTIDA: "false"');
    expect(values).toContain("agenda:");
    expect(values).toContain("backup:");
    expect(values).toContain("existingSecret");
  });

  it("publica imagens AMD64 e ARM64 e desativa workflows por variável", async () => {
    const publicacao = await ler(".github/workflows/publicacao.yml");
    const agenda = await ler(".github/workflows/notificacoes.yml");
    const fila = await ler(".github/workflows/fila-planilha.yml");
    const backup = await ler(".github/workflows/backup-externo.yml");
    const migracoes = await ler(".github/workflows/migracoes.yml");

    expect(publicacao).toContain("linux/amd64,linux/arm64");
    expect(publicacao).toContain("github.repository }}-backup");
    expect(agenda).toContain("vars.AGENDA_EXTERNA != 'servidor'");
    expect(fila).toContain("vars.AGENDA_EXTERNA != 'servidor'");
    expect(backup).toContain("vars.BACKUP_EXTERNO != 'servidor'");
    expect(migracoes).toContain("vars.DEPLOY_TARGET");
  });
});
