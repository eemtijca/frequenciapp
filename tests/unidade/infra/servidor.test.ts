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

  it("mantém Caddy público, interno e IPv4 com proxy e saúde", async () => {
    const publico = await ler("infra/servidor/Caddyfile");
    const interno = await ler("infra/servidor/Caddyfile.interno");
    const ipv4 = await ler("infra/servidor/Caddyfile.ipv4");

    expect(publico).toContain("acme_ca {$ACME_CA}");
    expect(publico).toContain("reverse_proxy app:3000");
    expect(publico).toContain("health_uri /api/saude");
    expect(publico).toContain("admin off");
    expect(interno).toContain("tls internal");
    expect(interno).toContain("reverse_proxy app:3000");
    expect(ipv4).toContain("default_sni {$DOMINIO}");
    expect(ipv4).toContain("reverse_proxy app:3000");
  });

  it("bloqueia /api/metricas no Caddy antes do proxy e preserva /api/saude", async () => {
    for (const arquivo of [
      "infra/servidor/Caddyfile",
      "infra/servidor/Caddyfile.interno",
      "infra/servidor/Caddyfile.ipv4",
    ]) {
      const conteudo = await ler(arquivo);

      expect(conteudo, arquivo).toContain("@metricas path /api/metricas");
      expect(conteudo, arquivo).toContain("respond @metricas 404");
      expect(conteudo.indexOf("respond @metricas 404"), arquivo).toBeLessThan(
        conteudo.indexOf("reverse_proxy app:3000"),
      );
      expect(conteudo, arquivo).toContain("health_uri /api/saude");
    }
  });

  it("mantém Nginx com HTTP inicial, HTTPS e cabeçalhos de proxy", async () => {
    const http = await ler("infra/servidor/nginx/frequenciapp-http.conf");
    const https = await ler("infra/servidor/nginx/frequenciapp-https.conf");

    expect(http).toContain("acme-challenge");
    expect(http).toContain("return 503");
    expect(https).toContain("listen 80;");
    expect(https).toContain("location ^~ /.well-known/acme-challenge/");
    expect(https).toContain("root /var/www/certbot;");
    expect(https).toContain("return 301 https://$host$request_uri;");
    expect(https).toContain("listen 443 ssl");
    expect(https).toContain("ssl_protocols TLSv1.2 TLSv1.3");
    expect(https).toContain("proxy_pass http://app:3000");
    expect(https).toContain("X-Forwarded-For");
    expect(https).toContain("X-Forwarded-Proto");
  });

  it("bloqueia /api/metricas no Nginx com correspondência exata", async () => {
    const http = await ler("infra/servidor/nginx/frequenciapp-http.conf");
    const https = await ler("infra/servidor/nginx/frequenciapp-https.conf");
    const bloco = "location = /api/metricas {\n        return 404;\n    }";
    const httpsServidor = https.slice(https.indexOf("listen 443 ssl"));

    for (const [arquivo, conteudo] of [
      ["frequenciapp-http.conf", http],
      ["frequenciapp-https.conf", httpsServidor],
    ] as const) {
      expect(conteudo, arquivo).toContain(bloco);
      expect(conteudo.indexOf("location = /api/metricas"), arquivo).toBeLessThan(
        conteudo.indexOf("location / {"),
      );
    }
  });

  it("mantém backup com Compose, URL, GPG, age e retenção mínima", async () => {
    const backup = await ler("scripts/servidor/backup-banco.sh");
    const imagem = await ler("infra/servidor/backup/Dockerfile");

    expect(backup).toContain("BACKUP_MODO");
    expect(backup).toContain("compose | url");
    expect(backup).toContain("BACKUP_CRIPTOGRAFIA");
    expect(backup).toContain("gpg | age");
    expect(backup).toContain("pg_restore -l");
    expect(backup).toContain("sha256sum");
    expect(backup).toContain("rclone_limpo copy");
    expect(backup).toContain("BACKUP_RETER_MINIMO");
    expect(backup).toContain("BACKUP_RETER_REMOTO");
    expect(backup).toContain("--verificar");
    expect(backup).toContain("gerar_dump_cifrado");
    expect(backup).toContain("hashes[$nome]");
    expect(imagem).toContain("postgresql-client-17");
    expect(imagem).toContain("rclone");
    expect(imagem).toContain("age");
  });

  it("monta e confere a instalação antes das rotinas", async () => {
    const comum = await ler("scripts/servidor/comum.sh");

    expect(comum).toContain("COMPOSE_ARQUIVOS");
    expect(comum).toContain("SERVIDOR_SERVICO_APP");
    expect(comum).toContain("verificar_instalacao");
    expect(comum).toContain("config --services");
    expect(comum).toContain("--project-directory");
  });

  it("mantém atualização com worktree, backup obrigatório, migração e rollback", async () => {
    const atualizar = await ler("scripts/servidor/atualizar.sh");
    const dockerfile = await ler("Dockerfile");
    const compose = await ler("compose.yml");

    expect(atualizar).toContain("auto | release | main");
    expect(atualizar).toContain("validar_backup_obrigatorio");
    expect(atualizar).toContain("worktree add");
    expect(atualizar).toContain("prisma/migrations");
    expect(atualizar).toContain("--permitir-migracoes");
    expect(atualizar).toContain("checkout --detach");
    expect(atualizar).toContain("escrever_falha");
    expect(atualizar).toContain("org.opencontainers.image.revision");
    expect(atualizar).toContain("migracoesPossivelmenteAplicadas");
    expect(dockerfile).toContain("org.opencontainers.image.revision");
    expect(compose).toContain("COMMIT_SHA: ${COMMIT_SHA:-}");
  });

  it("restaura em banco validado e preserva o banco anterior", async () => {
    const restaurar = await ler("scripts/servidor/restaurar.sh");

    expect(restaurar).toContain("BACKUP_RESTAURACAO_URL_VALIDACAO");
    expect(restaurar).toContain("--clean --if-exists");
    expect(restaurar).toContain("banco_temp");
    expect(restaurar).toContain("alter database");
    expect(restaurar).toContain("RESTAURAR_MANTER_ANTERIOR");
    expect(restaurar).toContain("pg_restore -l");
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
      "BACKUP_RETER_MINIMO=5",
      "BACKUP_RETER_REMOTO=false",
      "ATUALIZAR_MODO=auto",
      "ATUALIZAR_VERIFICAR_IMAGEM=true",
      "RESTAURAR_MANTER_ANTERIOR=true",
      "AGENDA_HORARIO=",
      "CRON_TZ=",
    ]) {
      expect(exemplo, variavel).toContain(variavel);
    }
  });

  it("valida o fuso do cron e agenda os CronJobs do Kubernetes", async () => {
    const instalador = await ler("scripts/servidor/instalar-rotinas.sh");
    const agenda = await ler("infra/kubernetes/frequenciapp/templates/cronjob-agenda.yaml");
    const backupBanco = await ler(
      "infra/kubernetes/frequenciapp/templates/cronjob-backup-banco.yaml",
    );
    const valores = await ler("infra/kubernetes/frequenciapp/values.yaml");

    expect(instalador).toContain("CRON_FUSO_SISTEMA");
    expect(instalador).toContain("cron_suporta_tz");
    expect(instalador).toContain("servidor.template");
    expect(agenda).toContain("agenda.timeZone");
    expect(backupBanco).toContain("backup.database.timeZone");
    expect(valores).toContain("retentionMinimum: 5");
    expect(valores).toContain("remoteRetention: false");
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

  it("valida Prometheus, token em arquivo e overlay do Compose nos dois proxies", async () => {
    const validar = await ler("infra/servidor/validar.sh");
    const observabilidade = await ler("compose.observabilidade.yml");
    const prometheus = await ler("infra/observabilidade/prometheus/prometheus.yml");
    const token = /export METRICAS_TOKEN="([^"]+)"/.exec(validar)?.[1] ?? "";

    expect(token).toMatch(/^[A-Za-z0-9_-]{32,200}$/);
    expect(validar).toContain("export PROMETHEUS_PORTA=9090");
    expect(validar.match(/compose\.observabilidade\.yml/g)).toHaveLength(2);
    expect(validar).toContain("infra/observabilidade/prometheus/entrypoint.sh");
    expect(validar).toContain(
      "prom/prometheus:v3.16.0@sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06",
    );
    expect(validar).toContain('-v "$REPO/infra/observabilidade/prometheus:/etc/prometheus:ro"');
    expect(validar).toContain("check config /etc/prometheus/prometheus.yml");
    expect(validar).toContain("check rules /etc/prometheus/regras.yml");
    expect(validar).toContain('-v "$tmp/metricas-token:/tmp/metricas-token:ro"');
    expect(validar).toContain('printf \'%s\' "$METRICAS_TOKEN" >"$tmp/metricas-token"');
    expect(validar).not.toMatch(/echo[^\n]*METRICAS_TOKEN/);

    expect(observabilidade).toContain(
      "prom/prometheus:v3.16.0@sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06",
    );
    expect(observabilidade).toContain(
      "alpine/socat:1.8.1.3@sha256:71131702f671a88b3808a70b7330f9679cd9b9933adcafadc191508edfe55bba",
    );
    expect(observabilidade).toContain('"127.0.0.1:${PROMETHEUS_PORTA:-9090}:9090"');
    expect(observabilidade).toContain("METRICAS_TOKEN: ${METRICAS_TOKEN:?");
    expect(prometheus).toContain("credentials_file: /tmp/metricas-token");
    expect(prometheus).toContain("- /etc/prometheus/regras.yml");
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
