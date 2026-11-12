// Etapa de contas: cria administração e coordenação quando solicitado.
import path from "node:path";
import { acao, avisoEtapa, executarEtapa, falha, lerSegredo } from "./contexto.mjs";

export const id = "contas";
export const titulo = "Cria administração e coordenação quando solicitado";
export const limiteSegundos = 600;

function compose(ctx, argumentos, env) {
  return executarEtapa(
    ctx,
    "bash",
    [ctx.caminhos.appDir + "/scripts/servidor/compose.sh", ...argumentos],
    { timeout: 300000, env },
  );
}

function existeConta(ctx, email) {
  if (/['\r\n]/.test(email)) {
    throw falha("E_USO", "O e-mail da conta contém caractere inválido.", {
      documentacao: "docs/instalador.md#flags",
    });
  }
  const banco = ctx.ambiente?.get("POSTGRES_DB") ?? "frequencia";
  const usuario = ctx.ambiente?.get("POSTGRES_USER") ?? "frequencia";
  const resultado = compose(
    ctx,
    [
      "exec",
      "-T",
      "db",
      "psql",
      "-X",
      "-U",
      usuario,
      "-d",
      banco,
      "-tAc",
      `select 1 from usuarios where lower(email) = lower('${email.replace(/'/g, "''")}') limit 1`,
    ],
    {},
  );
  if (resultado.status !== 0) {
    throw falha("E_VALIDACAO", "Não foi possível consultar as contas existentes.", {
      dica: "Confira o banco, as migrações e o container da aplicação.",
      documentacao: "docs/instalador.md#aplicar",
    });
  }
  return String(resultado.stdout).trim() === "1";
}

function criarConta(ctx, script, prefixo, email, senha, nome) {
  const variaveis = {
    [`${prefixo}_EMAIL`]: email,
    [`${prefixo}_SENHA`]: senha,
    [`${prefixo}_NOME`]: nome,
  };
  const resultado = compose(
    ctx,
    [
      "exec",
      "-T",
      ...Object.keys(variaveis).flatMap((chave) => ["-e", chave]),
      "app",
      "node",
      `./scripts/administracao/${script}`,
      ...(script === "criar-admin.mjs" ? ["--somente-criar"] : []),
    ],
    variaveis,
  );
  return resultado.status === 0;
}

function recuperarSenhas(ctx) {
  if (!ctx.senhas) ctx.senhas = {};
  if (ctx.configuracao.emailAdmin && !ctx.senhas.admin?.senha) {
    const caminho =
      ctx.configuracao.arquivoSenhaAdmin || path.join(ctx.caminhos.configDir, "senha-admin");
    const senha = lerSegredo(caminho, "senha de administração");
    ctx.segredos.push(senha);
    ctx.senhas.admin = { caminho, senha, gerada: false };
  }
  if (ctx.configuracao.emailCoordenacao && !ctx.senhas.coordenacao?.senha) {
    const caminho =
      ctx.configuracao.arquivoSenhaCoordenacao ||
      path.join(ctx.caminhos.configDir, "senha-coordenacao");
    const senha = lerSegredo(caminho, "senha de coordenação");
    ctx.segredos.push(senha);
    ctx.senhas.coordenacao = { caminho, senha, gerada: false };
  }
}

export function executar(ctx) {
  if (ctx.configuracao.pularContas) {
    return {
      estado: "pulada",
      acoes: [acao("Criação de contas pulada por --pular-contas", null, false)],
      avisos: [],
      detalhes: { semMudancas: true, criadas: [] },
    };
  }
  if (ctx.naoIniciar) {
    return {
      estado: "pulada",
      acoes: [acao("Contas não criadas por causa de --nao-iniciar", null, false)],
      avisos: [
        avisoEtapa(
          "A_NAO_INICIAR",
          "As contas não foram criadas porque a pilha não foi iniciada.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, criadas: [] },
    };
  }
  const acoes = [];
  const avisos = [];
  const criadas = [];
  recuperarSenhas(ctx);
  const admin = ctx.senhas?.admin;
  if (!admin?.senha) {
    throw falha("E_USO", "A senha inicial da administração não está disponível.", {
      dica: "Informe --arquivo-senha-admin ou remova --pular-contas.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (!ctx.forcar && existeConta(ctx, ctx.configuracao.emailAdmin)) {
    acoes.push(acao("A conta de administração já existe", null, false));
  } else {
    const nome = "Administração";
    if (
      !criarConta(ctx, "criar-admin.mjs", "ADMIN", ctx.configuracao.emailAdmin, admin.senha, nome)
    ) {
      throw falha("E_VALIDACAO", "Não foi possível criar a conta de administração.", {
        dica: "Confira o log da aplicação e as migrações.",
        documentacao: "docs/instalador.md#aplicar",
      });
    }
    criadas.push(ctx.configuracao.emailAdmin);
    acoes.push(acao("Cria a conta de administração", null, true));
  }
  if (ctx.configuracao.emailCoordenacao) {
    const coordenacao = ctx.senhas?.coordenacao;
    if (!coordenacao?.senha) {
      throw falha("E_USO", "A senha inicial da coordenação não está disponível.", {
        documentacao: "docs/instalador.md#flags",
      });
    }
    if (!ctx.forcar && existeConta(ctx, ctx.configuracao.emailCoordenacao)) {
      acoes.push(acao("A conta de coordenação já existe", null, false));
    } else {
      if (
        !criarConta(
          ctx,
          "criar-coordenacao.mjs",
          "CONTA",
          ctx.configuracao.emailCoordenacao,
          coordenacao.senha,
          "Coordenação",
        )
      ) {
        throw falha("E_VALIDACAO", "Não foi possível criar a conta de coordenação.", {
          dica: "Confira o log da aplicação e as migrações.",
          documentacao: "docs/instalador.md#aplicar",
        });
      }
      criadas.push(ctx.configuracao.emailCoordenacao);
      acoes.push(acao("Cria a conta de coordenação", null, true));
    }
  }
  if (!acoes.length) acoes.push(acao("Nenhuma conta precisou ser criada", null, false));
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: criadas.length === 0,
      criadas,
      admin: ctx.configuracao.emailAdmin || null,
      coordenacao: ctx.configuracao.emailCoordenacao || null,
    },
  };
}
