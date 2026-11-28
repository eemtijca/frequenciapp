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
    expect(validar.match(/compose\.observabilidade\.yml/g)).toHaveLength(8);
    expect(validar.match(/compose\.fila\.yml/g)).toHaveLength(4);
    expect(validar.match(/--profile alertas/g)).toHaveLength(2);
    expect(validar).toContain("config.networks?.interna?.internal");
    expect(validar).toContain("FILA_PLANILHA_TRANSPORTE=direto");
    expect(validar).toContain("infra/observabilidade/prometheus/entrypoint.sh");
    expect(validar).toContain(
      "prom/prometheus:v3.16.0@sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06",
    );
    expect(validar).toContain('-v "$REPO/infra/observabilidade/prometheus:/etc/prometheus:ro"');
    expect(validar).toContain("check config /etc/prometheus/prometheus.yml");
    expect(validar).toContain("check rules /etc/prometheus/regras.yml");
    expect(validar).toContain("test rules /etc/prometheus/regras.test.yml");
    expect(validar).toContain("-w /etc/prometheus");
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

  it("isola a ponte do painel em interna e painel, sem publica", async () => {
    const observabilidade = await ler("compose.observabilidade.yml");
    const blocoPrometheus = observabilidade.slice(
      observabilidade.indexOf("  prometheus:"),
      observabilidade.indexOf("  prometheus-ui:"),
    );
    const blocoPonte = observabilidade.slice(
      observabilidade.indexOf("  prometheus-ui:"),
      observabilidade.indexOf("  node-exporter:"),
    );

    expect(observabilidade).toMatch(/^networks:\n(?:  #.*\n)*  painel:$/m);
    expect(blocoPrometheus).toContain("    networks:\n      - interna\n");
    expect(blocoPrometheus).not.toContain("- painel");
    expect(blocoPrometheus).not.toContain("- publica");

    expect(blocoPonte).toContain("    networks:\n      - interna\n      - painel\n");
    expect(blocoPonte).not.toContain("publica");
    expect(blocoPonte).toContain('"127.0.0.1:${PROMETHEUS_PORTA:-9090}:9090"');
    // A rede painel existe apenas para publicar a ponte no loopback, como bridge comum.
    expect(observabilidade.match(/^      - painel$/gm)).toHaveLength(1);
    expect(observabilidade.slice(observabilidade.indexOf("\nnetworks:"))).not.toContain(
      "internal: true",
    );
  });

  it("coleta o host com node exporter na rede interna", async () => {
    const observabilidade = await ler("compose.observabilidade.yml");
    const prometheus = await ler("infra/observabilidade/prometheus/prometheus.yml");
    const regras = await ler("infra/observabilidade/prometheus/regras.yml");
    const blocoNode = observabilidade.slice(
      observabilidade.indexOf("  node-exporter:"),
      observabilidade.indexOf("  blackbox-exporter:"),
    );

    expect(observabilidade).toContain(
      "prom/node-exporter:v1.12.1@sha256:1b4e4438faca4dd7e001dd445d161a4a2091b0fededa84093b3a8dfeae1f1be0",
    );
    expect(blocoNode).toContain("pid: host");
    expect(blocoNode).toContain("--path.rootfs=/host");
    expect(blocoNode).toContain("--collector.textfile.directory=/var/lib/node_exporter/textfile");
    expect(blocoNode).toContain("/:/host:ro,rslave");
    expect(blocoNode).toContain(
      "${ESTADO_DIR:-/var/lib/frequenciapp}/metricas:/var/lib/node_exporter/textfile:ro",
    );
    expect(blocoNode).toContain("      - interna");
    expect(blocoNode).toContain("cap_drop:\n      - ALL");
    expect(blocoNode).toContain("no-new-privileges:true");
    expect(blocoNode).not.toContain("ports:");
    expect(blocoNode).not.toContain("privileged:");

    expect(prometheus).toContain("job_name: node-exporter");
    expect(prometheus).toContain("- node-exporter:9100");
    expect(regras).toContain("alert: FrequenciappDiscoBaixo");
    expect(regras).toContain("alert: FrequenciappMemoriaBaixa");
    expect(regras).toContain("node_filesystem_avail_bytes");
    expect(regras).toContain("node_memory_MemAvailable_bytes");
  });

  it("sonda HTTPS e certificado com blackbox exporter nos dois proxies", async () => {
    const observabilidade = await ler("compose.observabilidade.yml");
    const caddy = await ler("compose.servidor-caddy.yml");
    const nginx = await ler("compose.servidor-nginx.yml");
    const prometheus = await ler("infra/observabilidade/prometheus/prometheus.yml");
    const regras = await ler("infra/observabilidade/prometheus/regras.yml");
    const blackbox = await ler("infra/observabilidade/blackbox/blackbox.yml");
    const entrypoint = await ler("infra/observabilidade/blackbox/entrypoint.sh");
    const blocoBlackbox = observabilidade.slice(
      observabilidade.indexOf("  blackbox-exporter:"),
      observabilidade.indexOf("\nvolumes:"),
    );

    expect(observabilidade).toContain(
      "prom/blackbox-exporter:v0.29.1@sha256:ea1c7aa3ef3f307cd03e85f34abb604478ccb90b567fc690da0cd9776da76b13",
    );
    expect(blocoBlackbox).toContain("      - interna\n      - publica");
    expect(blocoBlackbox).not.toContain("ports:");
    expect(blocoBlackbox).toContain("cap_drop:\n      - ALL");
    expect(blocoBlackbox).toContain("no-new-privileges:true");
    expect(blocoBlackbox).toContain("DOMINIO: ${DOMINIO:?");

    expect(blackbox).toContain("https_2xx:");
    expect(blackbox).toContain("prober: http");
    expect(blackbox).toContain("timeout: 5s");
    expect(blackbox).toContain("valid_status_codes: [200]");
    expect(blackbox).toContain("preferred_ip_protocol: ip4");
    expect(blackbox).toContain("Host: __DOMINIO__");
    expect(blackbox).toContain("server_name: __DOMINIO__");
    expect(blackbox).toContain("# ca_file:");
    expect(entrypoint).toContain("__DOMINIO__");
    expect(entrypoint).toContain("$DOMINIO");
    expect(entrypoint).toContain("/tmp/blackbox.yml");
    expect(entrypoint).toContain('exec /bin/blackbox_exporter "$@"');

    for (const [arquivo, conteudo] of [
      ["compose.servidor-caddy.yml", caddy],
      ["compose.servidor-nginx.yml", nginx],
    ] as const) {
      expect(conteudo, arquivo).toMatch(/publica:\s*\n\s+aliases:\s*\n\s+- proxy/);
    }

    expect(prometheus).toContain("job_name: blackbox");
    expect(prometheus).toContain("metrics_path: /probe");
    expect(prometheus).toContain("module: [https_2xx]");
    expect(prometheus).toContain("- https://proxy:443/api/saude");
    expect(prometheus).toContain("target_label: __param_target");
    expect(prometheus).toContain("replacement: blackbox-exporter:9115");

    expect(regras).toContain("alert: FrequenciappSondaHttps");
    expect(regras).toContain("alert: FrequenciappSondaColetorIndisponivel");
    expect(regras).toContain("alert: FrequenciappSondaSemAmostra");
    expect(regras).toContain("alert: FrequenciappCertificadoExpirando");
    expect(regras).toContain('probe_success{job="blackbox"} == 0');
    expect(regras).toContain('up{job="blackbox"} == 0');
    expect(regras).toContain(
      'absent(probe_success{job="blackbox"}) and on(job) (up{job="blackbox"} == 1)',
    );
    expect(regras).toContain("A sonda não obteve resposta 200");
    expect(regras).toContain("probe_ssl_earliest_cert_expiry");
    expect(regras).toContain("14 * 24 * 3600");
  });

  it("não expõe o ponto de montagem na descrição do alerta de disco", async () => {
    const regras = await ler("infra/observabilidade/prometheus/regras.yml");
    const disco = regras.slice(
      regras.indexOf("alert: FrequenciappDiscoBaixo"),
      regras.indexOf("alert: FrequenciappMemoriaBaixa"),
    );

    expect(disco).toContain("node_filesystem_avail_bytes");
    expect(disco).toContain('mountpoint!~"/var/lib/docker/.+"');
    expect(disco).toContain("min by (instance, job)");
    expect(disco).not.toContain("$labels.mountpoint");
    expect(disco).toContain("O caminho do ponto de montagem fica apenas na métrica local.");
  });

  it("cobre os cenários da sonda nos testes das regras", async () => {
    const testes = await ler("infra/observabilidade/prometheus/regras.test.yml");

    for (const texto of [
      "sonda com sucesso",
      "sonda sem resposta 200",
      "coletor fora do ar",
      "coletor no ar sem amostra",
      "recuperação do coletor e da amostra",
      "recuperação da sonda",
      "perfil de alertas desligado",
    ]) {
      expect(testes, texto).toContain(texto);
    }

    expect(testes).toContain("rule_files:\n  - regras.yml");
    for (const alerta of [
      "FrequenciappSondaHttps",
      "FrequenciappSondaColetorIndisponivel",
      "FrequenciappSondaSemAmostra",
    ]) {
      expect(testes, alerta).toContain(`alertname: ${alerta}`);
    }
  });

  it("registra node e blackbox no inventário de ferramentas", async () => {
    const inventario = JSON.parse(await ler("scripts/github/ferramentas.json")) as {
      usos: Array<{ arquivo: string; trecho: string }>;
    };

    for (const nome of ["prom/node-exporter", "prom/blackbox-exporter", "prom/alertmanager"]) {
      expect(
        inventario.usos.some(
          (uso) => uso.arquivo === "compose.observabilidade.yml" && uso.trecho.includes(nome),
        ),
        nome,
      ).toBe(true);
    }
  });

  it("mantém o Alertmanager opt-in, isolado e com receptor por arquivo", async () => {
    const observabilidade = await ler("compose.observabilidade.yml");
    const bloco = observabilidade.slice(
      observabilidade.indexOf("  alertmanager:"),
      observabilidade.indexOf("\nvolumes:"),
    );
    const entrypoint = await ler("infra/observabilidade/alertmanager/entrypoint.sh");
    const modelo = await ler("infra/observabilidade/alertmanager/alertmanager.yml");

    expect(bloco).toContain('profiles: ["alertas"]');
    expect(bloco).toContain(
      "prom/alertmanager:v0.35.0@sha256:e638797febd034838eca8b98cdbd46f951e9bf7f178777aa8669167406a9946c",
    );
    expect(bloco).not.toContain("ports:");
    expect(bloco).toContain("      - interna\n      - publica");
    expect(bloco).toContain("alertmanager_data:/alertmanager");
    expect(bloco).toContain('entrypoint: ["/bin/sh", "/etc/alertmanager/entrypoint.sh"]');
    expect(bloco).toContain('command: ["--storage.path=/alertmanager"]');
    expect(bloco).toContain("restart: unless-stopped");
    expect(bloco).toContain("cap_drop:\n      - ALL");
    expect(bloco).toContain("no-new-privileges:true");
    expect(bloco).toContain("stop_grace_period: 30s");
    expect(bloco).toContain('max-size: "10m"');
    expect(bloco).toContain('max-file: "5"');
    expect(bloco).toContain("/bin/wget");
    expect(bloco).toContain("--spider");
    expect(bloco).toContain("/-/healthy");
    expect(observabilidade).toContain("alertmanager_data:");

    for (const variavel of [
      "ALERTA_WEBHOOK_URL",
      "ALERTA_WEBHOOK_TOKEN",
      "ALERTA_EMAIL_PARA",
      "ALERTA_EMAIL_DE",
      "ALERTA_SMTP_SMARTHOST",
      "ALERTA_SMTP_USUARIO",
      "ALERTA_SMTP_SENHA",
    ]) {
      expect(entrypoint, variavel).toContain(variavel);
      expect(observabilidade, variavel).toContain(`${variavel}: \${${variavel}:-}`);
    }
    expect(entrypoint).toContain("/etc/alertmanager/alertmanager.yml");
    expect(entrypoint).toContain("/tmp/alertmanager.yml");
    expect(entrypoint).toContain("umask 077");
    expect(entrypoint).toContain("escapar_yaml");
    expect(entrypoint).toContain("tr -d '\\r\\n'");
    expect(entrypoint).toContain("Configure apenas um receptor: webhook ou e-mail.");
    expect(entrypoint).toContain("ALERTA_WEBHOOK_URL não pode conter espaços.");
    expect(entrypoint).toContain("ALERTA_WEBHOOK_TOKEN exige ALERTA_WEBHOOK_URL.");
    expect(entrypoint).toContain("não podem conter quebra de linha");
    expect(entrypoint).toContain("require_tls: true");
    expect(entrypoint).toContain("send_resolved: true");
    expect(entrypoint).toContain("/bin/amtool check-config /tmp/alertmanager.yml");
    expect(entrypoint).toContain('exec /bin/alertmanager --config.file=/tmp/alertmanager.yml "$@"');
    expect(entrypoint).not.toContain("NOTIFICAR_URL");

    expect(entrypoint).toContain("smtp_auth_password_file: /tmp/alertmanager-smtp-password");
    expect(entrypoint).not.toMatch(/smtp_auth_password:/);
    expect(entrypoint).toContain("/tmp/alertmanager-webhook-url");
    expect(entrypoint).toContain("/tmp/alertmanager-webhook-token");
    expect(entrypoint).toContain("credentials_file: /tmp/alertmanager-webhook-token");
    expect(entrypoint).toContain("chmod 600 /tmp/alertmanager-smtp-password");
    expect(entrypoint).toContain("chmod 600 /tmp/alertmanager-webhook-url");
    expect(entrypoint).toContain("chmod 600 /tmp/alertmanager-webhook-token");
    expect(entrypoint).toContain("AUTORIZACAO_WEBHOOK");
    expect(entrypoint).toContain("awk");

    const blocosSed = entrypoint.match(/^\s*sed(?:[^\n]*\\\n)*[^\n]*$/gm) ?? [];
    expect(blocosSed.length).toBeGreaterThan(0);
    for (const blocoSed of blocosSed) {
      expect(blocoSed).not.toContain("$smtp_senha");
      expect(blocoSed).not.toContain("$webhook");
      expect(blocoSed).not.toContain("$webhook_token");
    }

    expect(modelo).toContain("webhook_configs:");
    expect(modelo).toContain("url_file: /tmp/alertmanager-webhook-url");
    expect(modelo).toContain("AUTORIZACAO_WEBHOOK");
    expect(modelo).toContain("send_resolved: true");
    expect(modelo).not.toContain("ALERTA_");
  });

  it("envia alertas ao Alertmanager e monitora a entrega", async () => {
    const prometheus = await ler("infra/observabilidade/prometheus/prometheus.yml");
    const regras = await ler("infra/observabilidade/prometheus/regras.yml");
    const alerta = regras.slice(
      regras.indexOf("alert: FrequenciappAlertmanagerFalhaNotificacao"),
      regras.indexOf("alert: FrequenciappBackupAtrasado"),
    );

    expect(prometheus).toContain("alerting:");
    expect(prometheus).toContain("alertmanagers:");
    expect(prometheus).toContain("- alertmanager:9093");
    expect(prometheus).toContain("job_name: alertmanager");
    expect(alerta).toContain(
      'rate(alertmanager_notifications_failed_total{job="alertmanager"}[10m]) > 0',
    );
    expect(alerta).toContain("for: 10m");
    expect(alerta).toContain("severity: warning");
    expect(regras).not.toContain('up{job="alertmanager"}');
  });

  it("publica a idade do último backup verificado", async () => {
    const backup = await ler("scripts/servidor/backup-banco.sh");
    const regras = await ler("infra/observabilidade/prometheus/regras.yml");
    const atraso = regras.slice(regras.indexOf("alert: FrequenciappBackupAtrasado"));

    expect(backup).toContain("publicar_metrica_ultimo_backup");
    expect(backup).toContain("ultimo-backup.prom");
    expect(backup).toContain('date -u -d "$instante" +%s');
    expect(backup).toContain('mkdir -p "$diretorio"');
    expect(backup).toContain('chmod 755 "$diretorio"');
    expect(backup).toContain('chmod 644 "$temporario"');
    expect(backup).toContain('mv -f "$temporario" "$destino"');
    expect(backup).toContain('rm -f -- "$temporario"');
    expect(backup).toContain('[ "$sem_escrita" = false ]');
    expect(backup).toContain(
      "# HELP frequenciapp_backup_ultimo_sucesso_timestamp_seconds Momento do último backup verificado.",
    );
    expect(atraso).toContain(
      "(time() - frequenciapp_backup_ultimo_sucesso_timestamp_seconds) > 24 * 3600",
    );
    expect(atraso).toContain("for: 1h");
    expect(atraso).toContain("severity: warning");
  });

  it("documenta os receptores de alerta vazios no exemplo", async () => {
    const exemplo = await ler("infra/servidor/servidor.env.example");

    for (const variavel of [
      "ALERTA_WEBHOOK_URL",
      "ALERTA_WEBHOOK_TOKEN",
      "ALERTA_EMAIL_PARA",
      "ALERTA_EMAIL_DE",
      "ALERTA_SMTP_SMARTHOST",
      "ALERTA_SMTP_USUARIO",
      "ALERTA_SMTP_SENHA",
    ]) {
      expect(exemplo, variavel).toContain(`# ${variavel}=\n`);
    }
  });

  it("valida os exporters e o Alertmanager na configuração do servidor", async () => {
    const validar = await ler("infra/servidor/validar.sh");

    expect(validar).toContain("infra/observabilidade/blackbox/entrypoint.sh");
    expect(validar).toContain("infra/observabilidade/alertmanager/entrypoint.sh");
    expect(validar).toContain("--profile alertas");
    expect(validar).toContain('sed "s|__DOMINIO__|$DOMINIO|g"');
    expect(validar).toContain('chmod 644 "$tmp/blackbox.yml"');
    expect(validar).toContain(
      "prom/blackbox-exporter:v0.29.1@sha256:ea1c7aa3ef3f307cd03e85f34abb604478ccb90b567fc690da0cd9776da76b13",
    );
    expect(validar).toContain("--config.check --config.file=/etc/blackbox_exporter/blackbox.yml");
    expect(validar).toContain("--entrypoint /bin/amtool");
    expect(validar).toContain("check-config /etc/alertmanager/alertmanager.yml");
    expect(validar).toContain(
      "prom/alertmanager:v0.35.0@sha256:e638797febd034838eca8b98cdbd46f951e9bf7f178777aa8669167406a9946c",
    );
    expect(validar).toContain('-e ALERTA_WEBHOOK_URL="https://monitor.exemplo.br/frequenciapp"');
    expect(validar).toContain('-e ALERTA_WEBHOOK_TOKEN="token-sintetico-de-validacao"');
    expect(validar).toContain('-e ALERTA_EMAIL_PARA="coordenacao@escola.exemplo.br"');
    expect(validar).toContain('-e ALERTA_SMTP_SENHA="senha-sintetica-de-validacao"');
    expect(
      validar.match(/\/etc\/alertmanager\/entrypoint\.sh --version >\/dev\/null/g),
    ).toHaveLength(2);
    expect(validar).toContain("smtp_auth_password_file: /tmp/alertmanager-smtp-password");
    expect(validar).toContain("url_file: /tmp/alertmanager-webhook-url");
    expect(validar).toContain("credentials_file: /tmp/alertmanager-webhook-token");
    expect(validar).toContain("check-config /config/alertmanager.yml");
    expect(validar).not.toMatch(/echo[^\n]*(?:ALERTA_SMTP_SENHA|ALERTA_WEBHOOK_URL)/);
  });

  it("documenta host, TLS, alertas e idade do backup", async () => {
    const observabilidade = await ler("docs/observabilidade.md");
    const autoHospedagem = await ler("docs/auto-hospedagem.md");
    const backup = await ler("docs/backup-servidor.md");
    const changelog = await ler("CHANGELOG.md");

    for (const texto of [
      "node exporter",
      "blackbox exporter",
      "Alertmanager",
      "alias `proxy`",
      "--profile alertas",
      "probe_success",
      "probe_ssl_earliest_cert_expiry",
      "alertmanager_notifications_failed_total",
      "frequenciapp_backup_ultimo_sucesso_timestamp_seconds",
      "alertmanager_data",
      "amtool alert add",
      "não publicam portas",
    ]) {
      expect(observabilidade, texto).toContain(texto);
    }

    for (const alerta of [
      "FrequenciappIndisponivel",
      "FrequenciappErros5xx",
      "FrequenciappLatenciaP95",
      "FrequenciappPoolAguardando",
      "FrequenciappFilaPlanilhaParada",
      "FrequenciappDiscoBaixo",
      "FrequenciappMemoriaBaixa",
      "FrequenciappSondaHttps",
      "FrequenciappSondaColetorIndisponivel",
      "FrequenciappSondaSemAmostra",
      "FrequenciappCertificadoExpirando",
      "FrequenciappAlertmanagerFalhaNotificacao",
      "FrequenciappBackupAtrasado",
    ]) {
      expect(observabilidade, alerta).toContain(alerta);
    }

    for (const texto of [
      "url_file",
      "smtp_auth_password_file",
      "credentials_file",
      "ALERTA_WEBHOOK_TOKEN",
      "regras.test.yml",
      "promtool test rules",
    ]) {
      expect(observabilidade, texto).toContain(texto);
    }

    for (const texto of [
      "infra/observabilidade/",
      "blackbox.yml",
      "alertmanager.yml",
      "scripts/servidor/compose.sh --profile alertas up -d alertmanager",
      "node-exporter",
      "probe_success",
      "probe_ssl_earliest_cert_expiry",
      "frequenciapp_backup_ultimo_sucesso_timestamp_seconds",
      "Alertmanager sem entrega",
      "FrequenciappSondaColetorIndisponivel",
      "FrequenciappSondaSemAmostra",
    ]) {
      expect(autoHospedagem, texto).toContain(texto);
    }

    for (const texto of [
      "$ESTADO_DIR/metricas/ultimo-backup.prom",
      "modo 755",
      "modo 644",
      "--sem-escrita",
      "24 horas",
      "FrequenciappBackupAtrasado",
    ]) {
      expect(backup, texto).toContain(texto);
    }

    expect(changelog).toContain("frequenciapp_backup_ultimo_sucesso_timestamp_seconds");
    expect(changelog).toContain("[observabilidade.md](docs/observabilidade.md)");
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
