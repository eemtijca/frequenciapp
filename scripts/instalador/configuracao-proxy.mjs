// Resolve a configuração versionada de proxy conforme endereço e modo TLS.
import { isIP } from "node:net";
import { erroValidacao } from "./json.mjs";

export function resolverProxy(configuracao) {
  const dominio = String(configuracao.dominio ?? "");
  const ip = isIP(dominio);
  const nomeValido =
    dominio.length <= 253 &&
    dominio.split(".").every((parte) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(parte)) &&
    !/^\d+$/.test(dominio.split(".").at(-1));
  if (dominio && (ip === 6 || (ip !== 4 && !nomeValido))) {
    throw erroValidacao("O endereço do proxy deve ser um nome DNS válido ou um IPv4.", {
      dica: "Informe --dominio sem esquema, porta ou caminho. IPv6 não é suportado nesta versão.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (
    dominio &&
    ip === 0 &&
    configuracao.tls === "acme" &&
    (!dominio.includes(".") || /(?:^|\.)(?:localhost|local|internal|home\.arpa)$/i.test(dominio))
  ) {
    throw erroValidacao("O TLS público exige um nome DNS público ou um IPv4.", {
      dica: "Use --tls interno explicitamente para um nome local e configure a confiança nos clientes.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (ip === 4 && configuracao.proxy === "nginx" && configuracao.tls === "acme") {
    throw erroValidacao("O HTTPS público por IPv4 exige Caddy nesta versão.", {
      dica: "Use --proxy caddy --tls acme ou escolha --tls interno explicitamente.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  const caddyfile =
    configuracao.tls === "interno"
      ? "infra/servidor/Caddyfile.interno"
      : ip === 4
        ? "infra/servidor/Caddyfile.ipv4"
        : "infra/servidor/Caddyfile";
  return {
    caddyfile,
    ambiente: {
      PROXY_TIPO: configuracao.proxy,
      TLS_MODO: configuracao.tls,
      DOMINIO: dominio,
      ACME_EMAIL: configuracao.emailAcme || "",
      ACME_CA: configuracao.acmeStaging
        ? "https://acme-staging-v02.api.letsencrypt.org/directory"
        : "https://acme-v02.api.letsencrypt.org/directory",
      CADDYFILE: caddyfile,
    },
    arquivos:
      configuracao.proxy === "nginx"
        ? [
            "infra/servidor/nginx/frequenciapp-http.conf",
            "infra/servidor/nginx/frequenciapp-https.conf",
          ]
        : [caddyfile],
  };
}
