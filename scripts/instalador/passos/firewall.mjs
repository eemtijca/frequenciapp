// Etapa de firewall: abre apenas SSH, HTTP e HTTPS e somente com consentimento.
import { acao, avisoEtapa, executarEtapa, falha } from "./contexto.mjs";

export const id = "firewall";
export const titulo = "Ajusta o firewall somente com consentimento explícito";
export const limiteSegundos = 300;

function regrasUfw(ctx, portas) {
  const status = executarEtapa(ctx, "ufw", ["status"], { timeout: 30000 });
  const texto = `${status.stdout}\n${status.stderr}`;
  return portas.filter((porta) => !new RegExp(`\\b${porta}(?:/tcp)?\\b`).test(texto));
}

function abrirUfw(ctx, portas) {
  const faltantes = regrasUfw(ctx, portas);
  if (!faltantes.length) return [];
  const acoes = [];
  for (const porta of faltantes) {
    const resultado = executarEtapa(ctx, "ufw", ["allow", `${porta}/tcp`], { timeout: 30000 });
    if (resultado.status !== 0) {
      throw falha("E_VALIDACAO", `Não foi possível liberar a porta ${porta} no ufw.`, {
        dica: "Confira o firewall e a permissão de root.",
        documentacao: "docs/instalador.md#segurança",
        saida: 5,
      });
    }
    acoes.push(acao(`Libera a porta ${porta}/tcp no ufw`, `ufw allow ${porta}/tcp`, true));
  }
  const ativo = executarEtapa(ctx, "ufw", ["--force", "enable"], { timeout: 30000 });
  if (ativo.status !== 0) {
    throw falha("E_VALIDACAO", "Não foi possível ativar o ufw.", {
      documentacao: "docs/instalador.md#segurança",
      saida: 5,
    });
  }
  acoes.push(acao("Ativa o ufw", "ufw --force enable", true));
  return acoes;
}

function abrirFirewalld(ctx, portas) {
  const acoes = [];
  const servicos = { 22: "ssh", 80: "http", 443: "https" };
  const listagem = executarEtapa(ctx, "firewall-cmd", ["--permanent", "--list-services"], {
    timeout: 30000,
  });
  const ativos = new Set(
    String(listagem.stdout ?? "")
      .split(/\s+/)
      .filter(Boolean),
  );
  for (const porta of portas) {
    const servico = servicos[porta];
    if (!servico || ativos.has(servico)) continue;
    const resultado = executarEtapa(
      ctx,
      "firewall-cmd",
      ["--permanent", `--add-service=${servico}`],
      { timeout: 30000 },
    );
    if (resultado.status !== 0) {
      throw falha("E_VALIDACAO", `Não foi possível liberar ${servico} no firewalld.`, {
        documentacao: "docs/instalador.md#segurança",
        saida: 5,
      });
    }
    acoes.push(
      acao(
        `Libera ${servico} no firewalld`,
        `firewall-cmd --permanent --add-service=${servico}`,
        true,
      ),
    );
  }
  if (!acoes.length) return [];
  const recarga = executarEtapa(ctx, "firewall-cmd", ["--reload"], { timeout: 30000 });
  if (recarga.status !== 0) {
    throw falha("E_VALIDACAO", "Não foi possível recarregar o firewalld.", {
      documentacao: "docs/instalador.md#segurança",
      saida: 5,
    });
  }
  acoes.push(acao("Recarrega o firewalld", "firewall-cmd --reload", true));
  return acoes;
}

export function executar(ctx) {
  if (ctx.configuracao.firewall === "nao") {
    return {
      estado: "pulada",
      acoes: [acao("Firewall não alterado por configuração", null, false)],
      avisos: [],
      detalhes: { semMudancas: true, alterado: false },
    };
  }
  if (!ctx.sim) {
    return {
      estado: "pulada",
      acoes: [acao("Firewall não alterado sem --sim", null, false)],
      avisos: [
        avisoEtapa(
          "A_FIREWALL_SEM_CONSENTIMENTO",
          "O firewall não foi alterado porque falta --sim.",
          "docs/instalador.md#segurança",
        ),
      ],
      detalhes: { semMudancas: true, alterado: false },
    };
  }
  const firewall = ctx.deteccao.firewall;
  if (firewall === "ufw") {
    const acoes = abrirUfw(ctx, [
      ctx.configuracao.portaSsh,
      ctx.configuracao.portaHttp,
      ctx.configuracao.portaHttps,
    ]);
    return {
      estado: "concluida",
      acoes: acoes.length ? acoes : [acao("As regras do ufw já estão presentes", null, false)],
      avisos: [],
      detalhes: { semMudancas: acoes.length === 0, alterado: acoes.length > 0, firewall },
    };
  }
  if (firewall === "firewalld") {
    const acoes = abrirFirewalld(ctx, [
      ctx.configuracao.portaSsh,
      ctx.configuracao.portaHttp,
      ctx.configuracao.portaHttps,
    ]);
    return {
      estado: "concluida",
      acoes: acoes.length
        ? acoes
        : [acao("As regras do firewalld já estão presentes", null, false)],
      avisos: [],
      detalhes: { semMudancas: acoes.length === 0, alterado: acoes.length > 0, firewall },
    };
  }
  return {
    estado: "pulada",
    acoes: [acao(`Firewall ${firewall} exige configuração manual`, null, false)],
    avisos: [
      avisoEtapa(
        "A_FIREWALL_MANUAL",
        `O firewall ${firewall} não é alterado automaticamente; libere apenas 22, 80 e 443.`,
        "docs/instalador.md#segurança",
      ),
    ],
    detalhes: { semMudancas: true, alterado: false, firewall },
  };
}
