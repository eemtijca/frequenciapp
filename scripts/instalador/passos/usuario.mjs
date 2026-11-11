// Etapa de usuário: cria a conta de implantação e ajusta o grupo docker.
import { acao, avisoEtapa, executarEtapa, falha, USUARIO_PADRAO } from "./contexto.mjs";

export const id = "usuario";
export const titulo = "Cria a conta de implantação e os diretórios de operação";
export const limiteSegundos = 300;

function existeUsuario(ctx, usuario) {
  return executarEtapa(ctx, "id", ["-u", usuario], { timeout: 10000 }).status === 0;
}

function criarUsuario(ctx, usuario) {
  const casa = ctx.caminhos.estadoDir;
  if (ctx.deteccao.familia === "alpine") {
    return executarEtapa(ctx, "adduser", ["-S", "-D", "-h", casa, "-s", "/sbin/nologin", usuario], {
      timeout: 60000,
    });
  }
  return executarEtapa(
    ctx,
    "useradd",
    ["--system", "--create-home", "--home-dir", casa, "--shell", "/bin/bash", usuario],
    { timeout: 60000 },
  );
}

function grupoDocker(ctx, usuario) {
  const grupos = executarEtapa(ctx, "id", ["-nG", usuario], { timeout: 10000 });
  if (grupos.status !== 0) return false;
  if (String(grupos.stdout).split(/\s+/).includes("docker")) return true;
  const resultado = executarEtapa(ctx, "usermod", ["-aG", "docker", usuario], { timeout: 30000 });
  if (resultado.status === 0) return true;
  const alternativo = executarEtapa(ctx, "addgroup", [usuario, "docker"], { timeout: 30000 });
  return alternativo.status === 0;
}

export function executar(ctx) {
  const usuario = ctx.usuarioServico || USUARIO_PADRAO;
  const acoes = [];
  const avisos = [];
  let existe = existeUsuario(ctx, usuario);
  if (!existe && ctx.modoTeste) {
    avisos.push(
      avisoEtapa(
        "A_USUARIO_TESTE",
        `A conta ${usuario} não foi criada no modo de teste; os caminhos continuam sintéticos.`,
        "docs/instalador.md#testes-em-docker",
      ),
    );
    return {
      estado: "concluida",
      acoes: [acao("Mantém a conta de teste sem criar usuário do sistema", null, false)],
      avisos,
      detalhes: { semMudancas: true, usuario, simulado: true, existe: false },
    };
  }
  if (!existe) {
    acoes.push(
      acao(
        `Cria a conta de implantação ${usuario}`,
        ctx.deteccao.familia === "alpine"
          ? `adduser -S -D -h ${ctx.caminhos.estadoDir} -s /sbin/nologin ${usuario}`
          : `useradd --system --create-home --home-dir ${ctx.caminhos.estadoDir} --shell /bin/bash ${usuario}`,
        true,
      ),
    );
    const resultado = criarUsuario(ctx, usuario);
    if (resultado.status !== 0) {
      throw falha("E_VALIDACAO", `Não foi possível criar a conta ${usuario}.`, {
        dica: "Confira a permissão de root e o diretório inicial.",
        documentacao: "docs/instalador.md#segurança",
        saida: 5,
      });
    }
    existe = true;
  }
  const noGrupo = grupoDocker(ctx, usuario);
  if (!noGrupo) {
    avisos.push(
      avisoEtapa(
        "A_DOCKER_GRUPO",
        `A conta ${usuario} não ficou no grupo docker; ajuste o grupo antes das rotinas.`,
        "docs/instalador.md#segurança",
      ),
    );
  }
  if (!acoes.length) {
    acoes.push(acao(`A conta ${usuario} e o grupo docker já estão configurados`, null, false));
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: { semMudancas: acoes.every((item) => !item.altera), usuario, existe, noGrupo },
  };
}
