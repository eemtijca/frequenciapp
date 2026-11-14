// Etapa de proxy: valida Caddy ou Nginx, TLS público ou interno e as portas públicas.
import fs from "node:fs";
import path from "node:path";
import { resolverProxy } from "../configuracao-proxy.mjs";
import { acao, avisoEtapa, falha, garantirDiretorio } from "./contexto.mjs";

export const id = "proxy";
export const titulo = "Configura Caddy ou Nginx, TLS e portas públicas";
export const limiteSegundos = 900;

export function executar(ctx) {
  const configuracao = ctx.configuracao;
  const acoes = [];
  const avisos = [];
  const { arquivos: relativos } = resolverProxy(configuracao);
  const ausentes = relativos.filter(
    (relativo) => !fs.existsSync(path.join(ctx.caminhos.appDir, relativo)),
  );
  if (ausentes.length) {
    throw falha(
      "E_VALIDACAO",
      `O arquivo de configuração do proxy não foi encontrado: ${ausentes.join(", ")}.`,
      {
        dica: "Confira o checkout e o proxy escolhido.",
        documentacao: "docs/instalador.md#flags",
      },
    );
  }
  acoes.push(
    acao(
      `Valida a configuração do ${configuracao.proxy} para ${configuracao.dominio}`,
      null,
      false,
    ),
  );
  if (configuracao.proxy === "nginx") {
    const certificados = path.join(
      ctx.caminhos.appDir,
      "infra",
      "servidor",
      "nginx",
      "certificados",
    );
    let existia = true;
    try {
      fs.lstatSync(certificados);
    } catch {
      existia = false;
    }
    const ajustou = garantirDiretorio(certificados, 0o700);
    if (!existia || ajustou) {
      acoes.push(
        acao(
          "Prepara o diretório de certificados do Nginx",
          `install -d -m 700 ${certificados}`,
          true,
        ),
      );
    }
    if (configuracao.tls === "acme") {
      avisos.push(
        avisoEtapa(
          "A_CERTBOT",
          "O certificado do Nginx ACME precisa ser emitido pelo certbot antes da primeira subida.",
          "docs/instalador.md#flags",
        ),
      );
    }
  }
  if (configuracao.tls === "interno") {
    avisos.push(
      avisoEtapa(
        "A_TLS_INTERNO",
        "O TLS interno usa uma autoridade local; os clientes precisam confiar no certificado.",
        "docs/instalador.md#segurança",
      ),
    );
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: acoes.every((item) => !item.altera),
      proxy: configuracao.proxy,
      tls: configuracao.tls,
      dominio: configuracao.dominio,
      arquivos: relativos,
      portaHttp: configuracao.portaHttp,
      portaHttps: configuracao.portaHttps,
    },
  };
}
