// Etapa do controlador: adota o snapshot, confere o migrador e instala o cron estável.
import fs from "node:fs";
import path from "node:path";
import { acao, avisoEtapa, executarEtapa, falha, sha256Arquivo } from "./contexto.mjs";

export const id = "controlador";
export const titulo = "Adota o controlador opt-in e instala o cron estável";
export const limiteSegundos = 1800;

const DOCUMENTACAO = "docs/controlador-manutencao.md";
const LIMITE_PERFIL_BYTES = 4 * 1024 * 1024;
const TIMEOUT_ADOCAO_MS = 1800000;
const TIMEOUT_ROTINAS_MS = 600000;

function registrar(ctx, linha) {
  if (typeof ctx.registrarLog === "function") ctx.registrarLog(linha);
}

function erroControlador(mensagem, dica) {
  return falha("E_CONTROLADOR", mensagem, { dica, documentacao: DOCUMENTACAO });
}

function consultarPerfil(caminho) {
  try {
    const informacao = fs.lstatSync(caminho);
    return {
      existe: true,
      regular: !informacao.isSymbolicLink() && informacao.isFile(),
      tamanho: informacao.size,
    };
  } catch (erro) {
    if (erro?.code === "ENOENT") return { existe: false, regular: false, tamanho: 0 };
    throw erroControlador(
      "Não foi possível consultar o perfil do controlador.",
      "Confira a permissão do prefixo e repita a adoção.",
    );
  }
}

function lerPerfilJson(caminho) {
  const perfil = consultarPerfil(caminho);
  if (!perfil.existe) {
    throw erroControlador(
      "O perfil do controlador não foi encontrado depois da adoção.",
      "Confira o prefixo, arquive um prefixo parcial e repita a adoção.",
    );
  }
  if (!perfil.regular) {
    throw erroControlador(
      "O perfil do controlador precisa ser um arquivo regular, sem link simbólico.",
      "Remova o link ou o diretório e repita a adoção em um prefixo limpo.",
    );
  }
  if (perfil.tamanho > LIMITE_PERFIL_BYTES) {
    throw erroControlador(
      "O perfil do controlador excede o tamanho aceito.",
      "Confira o conteúdo do perfil e repita a adoção em um prefixo limpo.",
    );
  }
  let texto;
  try {
    texto = fs.readFileSync(caminho, "utf8");
  } catch {
    throw erroControlador(
      "Não foi possível ler o perfil do controlador.",
      "Confira a permissão do prefixo e repita a adoção.",
    );
  }
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw erroControlador(
      "O perfil do controlador não contém um JSON válido.",
      "Arquive o prefixo parcial e repita a adoção.",
    );
  }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw erroControlador(
      "O perfil do controlador não contém um objeto JSON.",
      "Arquive o prefixo parcial e repita a adoção.",
    );
  }
  return dados;
}

function hashesDoPerfil(dados) {
  const candidatos = [
    dados.migradorSha256,
    dados.sha256Migrador,
    dados.migrador?.sha256,
    dados.migrador?.migradorSha256,
    dados.hashes?.migradorSha256,
    dados.hashes?.migrador,
  ];
  const hashes = [];
  for (const candidato of candidatos) {
    if (typeof candidato === "string" && candidato.length > 0 && !hashes.includes(candidato)) {
      hashes.push(candidato);
    }
  }
  return hashes;
}

function hashDoMigrador(ctx) {
  const caminho = path.join(ctx.caminhos.appDir, "docker", "app", "migrar.mjs");
  try {
    return sha256Arquivo(caminho);
  } catch {
    throw erroControlador(
      "O migrador da aplicação não foi encontrado para conferir o hash.",
      "Confira o checkout da aplicação e o caminho docker/app/migrar.mjs.",
    );
  }
}

function hashAdotado(ctx) {
  const caminho = path.join(ctx.caminhos.appDir, "docker", "app", "migrar.mjs");
  try {
    return sha256Arquivo(caminho);
  } catch {
    // Uma adoção já registrada continua idempotente mesmo sem o checkout local.
  }
  const hashEstado = ctx.estado?.controlador?.migradorSha256;
  if (typeof hashEstado === "string" && hashEstado.length > 0) return hashEstado;
  try {
    return hashesDoPerfil(lerPerfilJson(ctx.caminhos.controladorPerfil))[0] ?? null;
  } catch {
    return null;
  }
}

function operadorAdotado(ctx) {
  const operador = String(ctx.configuracao.operadorControlador ?? "").trim();
  if (operador) return operador;
  try {
    const dados = lerPerfilJson(ctx.caminhos.controladorPerfil);
    return typeof dados.operador === "string" ? dados.operador : "";
  } catch {
    return "";
  }
}

function argumentosControlador(ctx, operador, fase) {
  return [
    path.join(ctx.caminhos.appDir, "scripts", "servidor", "instalar-controlador.sh"),
    "--fonte",
    ctx.caminhos.appDir,
    "--app",
    ctx.caminhos.appDir,
    "--config",
    ctx.caminhos.configDir,
    "--prefixo",
    ctx.caminhos.controladorPrefixo,
    "--operador",
    operador,
    fase,
  ];
}

function argumentosRotinas(ctx, fase) {
  return [
    path.join(ctx.caminhos.appDir, "scripts", "servidor", "instalar-rotinas.sh"),
    "--controlador",
    "--perfil",
    ctx.caminhos.controladorPerfil,
    fase,
  ];
}

function executarComando(ctx, argumentos, opcoes) {
  let resultado;
  try {
    resultado = executarEtapa(ctx, "bash", argumentos, { timeout: opcoes.timeout });
  } catch {
    throw erroControlador(opcoes.mensagem, opcoes.dica);
  }
  if (resultado.status !== 0 || resultado.erro) {
    throw erroControlador(opcoes.mensagem, opcoes.dica);
  }
}

export function executar(ctx) {
  if (ctx.naoIniciar) {
    return {
      estado: "pulada",
      acoes: [acao("Adoção do controlador não executada por causa de --nao-iniciar", null, false)],
      avisos: [
        avisoEtapa(
          "A_NAO_INICIAR",
          "O controlador não foi adotado porque a instalação não foi iniciada.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, adotado: false, rotinas: "cron" },
    };
  }

  const caminhoPerfil = ctx.caminhos.controladorPerfil;
  const estadoControlador = ctx.estado?.controlador;
  const perfil = consultarPerfil(caminhoPerfil);
  if (
    estadoControlador?.adotado === true &&
    perfil.existe &&
    perfil.regular &&
    estadoControlador.readocaoPendente !== true
  ) {
    executarComando(ctx, argumentosRotinas(ctx, "--plano"), {
      timeout: TIMEOUT_ROTINAS_MS,
      mensagem: "O plano das rotinas estáveis do controlador falhou.",
      dica: "Confira o journal, o fuso do cron e o perfil adotado.",
    });
    const migradorSha256 = hashAdotado(ctx);
    registrar(ctx, "etapa=controlador estado=concluida semMudancas=true");
    return {
      estado: "concluida",
      acoes: [acao("O controlador já está adotado e o perfil confere", null, false)],
      avisos: [],
      detalhes: {
        adotado: true,
        prefixo: ctx.caminhos.controladorPrefixo,
        perfil: caminhoPerfil,
        operador: operadorAdotado(ctx),
        migradorSha256,
        rotinas: "cron",
        semMudancas: true,
      },
    };
  }

  const acoes = [];
  const readocao = estadoControlador?.readocaoPendente === true;
  if (perfil.existe && !readocao) {
    throw erroControlador(
      "O prefixo do controlador já existe e não está marcado para readoção.",
      "Arquive o prefixo parcial e repita a adoção em um caminho limpo.",
    );
  }
  if (readocao) {
    throw erroControlador(
      "A readoção exige revisão administrativa sem mover o prefixo ou a trava ativa.",
      "Preserve journal e pins; a transição restrita de seletores usa o comando de reconfiguração.",
    );
  }

  const operador = String(ctx.configuracao.operadorControlador ?? "").trim();
  if (!operador) {
    throw erroControlador(
      "O perfil controlador exige o operador informado com --operador-controlador.",
      "Repita o comando com --operador-controlador e uma conta sem privilégio administrativo.",
    );
  }

  registrar(ctx, "etapa=controlador fase=controlador-plano");
  executarComando(ctx, argumentosControlador(ctx, operador, "--plano"), {
    timeout: TIMEOUT_ADOCAO_MS,
    mensagem: "O plano de adoção do controlador falhou.",
    dica: "Confira a identidade Compose, o estado legado e as permissões do checkout.",
  });
  acoes.push(
    acao(
      "Planeja a adoção do controlador",
      "scripts/servidor/instalar-controlador.sh --plano",
      false,
    ),
  );

  registrar(ctx, "etapa=controlador fase=controlador-confirmar");
  executarComando(ctx, argumentosControlador(ctx, operador, "--confirmar"), {
    timeout: TIMEOUT_ADOCAO_MS,
    mensagem: "A adoção do controlador não terminou com sucesso.",
    dica: "Confira o log, o prefixo e o journal antes de repetir.",
  });
  acoes.push(
    acao(
      "Confirma a adoção do controlador",
      "scripts/servidor/instalar-controlador.sh --confirmar",
      true,
    ),
  );

  const confirmado = consultarPerfil(caminhoPerfil);
  if (!confirmado.existe) {
    throw erroControlador(
      "O perfil do controlador não foi encontrado depois da adoção.",
      "Confira o prefixo, arquive um prefixo parcial e repita a adoção.",
    );
  }
  if (!confirmado.regular) {
    throw erroControlador(
      "O perfil do controlador precisa ser um arquivo regular, sem link simbólico.",
      "Remova o link ou o diretório e repita a adoção em um prefixo limpo.",
    );
  }

  const migradorSha256 = hashDoMigrador(ctx);
  const dadosPerfil = lerPerfilJson(caminhoPerfil);
  for (const hashPerfil of hashesDoPerfil(dadosPerfil)) {
    if (hashPerfil !== migradorSha256) {
      throw erroControlador(
        "O hash do migrador do perfil do controlador diverge do checkout.",
        "Revise o journal e os pins e refaça a adoção a partir de um prefixo limpo.",
      );
    }
  }

  registrar(ctx, "etapa=controlador fase=rotinas-plano");
  executarComando(ctx, argumentosRotinas(ctx, "--plano"), {
    timeout: TIMEOUT_ROTINAS_MS,
    mensagem: "O plano das rotinas estáveis do controlador falhou.",
    dica: "Confira o fuso do cron e o perfil adotado.",
  });
  acoes.push(
    acao(
      "Planeja as rotinas estáveis do controlador",
      "scripts/servidor/instalar-rotinas.sh --controlador --plano",
      false,
    ),
  );

  registrar(ctx, "etapa=controlador fase=rotinas-confirmar");
  executarComando(ctx, argumentosRotinas(ctx, "--confirmar"), {
    timeout: TIMEOUT_ROTINAS_MS,
    mensagem: "A instalação das rotinas estáveis do controlador falhou.",
    dica: "Confira se /etc/cron.d/frequenciapp já existe e revise o perfil adotado.",
  });
  acoes.push(
    acao(
      "Confirma as rotinas estáveis no cron",
      "scripts/servidor/instalar-rotinas.sh --controlador --confirmar",
      true,
    ),
  );

  return {
    estado: "concluida",
    acoes,
    avisos: [],
    detalhes: {
      adotado: true,
      prefixo: ctx.caminhos.controladorPrefixo,
      perfil: caminhoPerfil,
      operador,
      migradorSha256,
      rotinas: "cron",
      semMudancas: false,
    },
  };
}
