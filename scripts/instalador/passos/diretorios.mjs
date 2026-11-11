// Etapa de diretórios: cria estado, backup, log e configuração com modo restrito.
import fs from "node:fs";
import { acao, avisoEtapa, executarEtapa, falha, garantirDiretorio } from "./contexto.mjs";

export const id = "diretorios";
export const titulo = "Cria estado, backup, log e configuração com modo restrito";
export const limiteSegundos = 300;

const DIRETORIOS = [
  ["configDir", 0o700, "configuração"],
  ["estadoDir", 0o700, "estado"],
  ["logDir", 0o750, "log"],
  ["backupDir", 0o700, "backup"],
  ["backupBancoDir", 0o700, "backup do banco"],
  ["backupPlanilhasDir", 0o700, "backup das planilhas"],
  ["lockDir", 0o700, "trava"],
];

export function executar(ctx) {
  const acoes = [];
  const criados = [];
  for (const [chave, modo, rotulo] of DIRETORIOS) {
    const caminho = ctx.caminhos[chave];
    let existia = true;
    try {
      fs.lstatSync(caminho);
    } catch {
      existia = false;
    }
    const ajustouModo = garantirDiretorio(caminho, modo);
    if (!existia) {
      criados.push(caminho);
      acoes.push(
        acao(
          `Cria o diretório de ${rotulo} com modo ${modo.toString(8)}`,
          `install -d -m ${modo.toString(8)} ${caminho}`,
          true,
        ),
      );
    } else if (ajustouModo) {
      acoes.push(
        acao(
          `Ajusta o modo do diretório de ${rotulo} para ${modo.toString(8)}`,
          `chmod ${modo.toString(8)} ${caminho}`,
          true,
        ),
      );
    }
  }
  const recibos = `${ctx.caminhos.estadoDir}/recibos`;
  const expurgos = `${ctx.caminhos.estadoDir}/expurgos`;
  const existiaRecibos = fs.existsSync(recibos);
  const existiaExpurgos = fs.existsSync(expurgos);
  const criadosRecibos = garantirDiretorio(recibos, 0o700);
  const criadosExpurgos = garantirDiretorio(expurgos, 0o700);
  if (!existiaRecibos || criadosRecibos) {
    acoes.push(acao("Cria o catálogo de recibos de backup", `install -d -m 700 ${recibos}`, true));
  }
  if (!existiaExpurgos || criadosExpurgos) {
    acoes.push(acao("Cria o journal de expurgos de backup", `install -d -m 700 ${expurgos}`, true));
  }

  const avisos = [];
  if (ctx.uid === 0 && !ctx.modoTeste) {
    const usuario = ctx.usuarioServico;
    const caminhos = [
      ctx.caminhos.configDir,
      ctx.caminhos.estadoDir,
      ctx.caminhos.logDir,
      ctx.caminhos.backupDir,
      ctx.caminhos.lockDir,
      recibos,
      expurgos,
    ];
    const resultado = executarEtapa(ctx, "chown", ["-R", `${usuario}:${usuario}`, ...caminhos], {
      timeout: 60000,
    });
    if (resultado.status !== 0) {
      throw falha("E_VALIDACAO", "Não foi possível ajustar o proprietário dos diretórios.", {
        dica: "Confira a conta de implantação e a permissão de root.",
        documentacao: "docs/instalador.md#segurança",
        saida: 5,
      });
    }
    acoes.push(
      acao(
        `Ajusta os diretórios para a conta ${usuario}`,
        `chown -R ${usuario}:${usuario} ...`,
        true,
      ),
    );
  } else if (ctx.modoTeste) {
    avisos.push(
      avisoEtapa(
        "A_DIRETORIOS_TESTE",
        "Os diretórios são sintéticos e não receberam proprietário de serviço.",
        "docs/instalador.md#testes-em-docker",
      ),
    );
  }
  if (!acoes.length) {
    acoes.push(acao("Os diretórios de operação já existem com os modos corretos", null, false));
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: acoes.every((item) => !item.altera),
      criados,
      recibos,
      expurgos,
    },
  };
}
