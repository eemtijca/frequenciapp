// Módulo interno do comando canal: valida alvo, migrações, backup, atualização e ambiente.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { lerEstadoAtualizador } from "../estado.mjs";
import {
  atualizarEnv,
  executarEtapa,
  falha,
  gravarArquivoPrivado,
  lerEnv,
  sha256Arquivo,
} from "./contexto.mjs";

export const id = "canal";
export const titulo = "Troca o canal de atualização com backup e validação";
export const limiteSegundos = 7200;

const PADRAO_RECIBO = /^frequenciapp-\d{8}T\d{6}Z-[a-f0-9]{8}\.confirmado\.json$/;
const CABECALHO_OPS =
  "# FrequenciApp. Ambiente operacional gerado pelo instalador. Não editar à mão.\n# Este arquivo contém configuração do host e deve permanecer com modo 600.";

function executarGit(ctx, argumentos, timeout = 15000) {
  return executarEtapa(ctx, "git", ["-C", ctx.caminhos.appDir, ...argumentos], { timeout });
}

// Resolve uma tag ou referência segura para o commit completo.
export function resolverCommit(ctx, referencia) {
  if (!referencia || !/^[A-Za-z0-9._/-]+$/.test(referencia) || referencia.startsWith("-")) {
    return "";
  }
  const resultado = executarGit(ctx, ["rev-parse", "--verify", `${referencia}^{commit}`]);
  return resultado.status === 0 ? String(resultado.stdout).trim() : "";
}

// Classifica a relação entre o commit instalado e o commit alvo.
export function classificarAncestralidade(ctx, commitAtual, commitAlvo) {
  if (!commitAtual || !commitAlvo) return "sem-relacao";
  const alvoContemAtual =
    executarGit(ctx, ["merge-base", "--is-ancestor", commitAtual, commitAlvo]).status === 0;
  const atualContemAlvo =
    executarGit(ctx, ["merge-base", "--is-ancestor", commitAlvo, commitAtual]).status === 0;
  if (alvoContemAtual && atualContemAlvo) return "igual";
  if (alvoContemAtual) return "ascendente";
  if (atualContemAlvo) return "descendente";
  return "sem-relacao";
}

// Lista os diretórios de migração de um commit, sem depender do checkout atual.
export function listarMigracoes(ctx, commit) {
  const resultado = executarGit(ctx, [
    "ls-tree",
    "-r",
    "--name-only",
    commit,
    "--",
    "prisma/migrations",
  ]);
  if (resultado.status !== 0) return null;
  const migracoes = new Set();
  for (const linha of String(resultado.stdout).split(/\r?\n/)) {
    const partes = linha.split("/");
    if (partes.length < 3) continue;
    if (partes[0] !== "prisma" || partes[1] !== "migrations") continue;
    if (/^\d+_/.test(partes[2])) migracoes.add(partes[2]);
  }
  return [...migracoes].sort();
}

// Compara as migrações do commit instalado com as do alvo.
export function compararMigracoes(ctx, commitAtual, commitAlvo) {
  const atuais = listarMigracoes(ctx, commitAtual);
  const alvo = listarMigracoes(ctx, commitAlvo);
  if (!atuais || !alvo) {
    throw falha("E_CANAL", "Não foi possível ler as migrações do commit alvo.", {
      dica: "Confira o histórico de migrações e repita a troca de canal.",
      documentacao: "docs/instalador.md#migrações-incompatíveis",
    });
  }
  const removidas = atuais.filter((migracao) => !alvo.includes(migracao));
  const novas = alvo.filter((migracao) => !atuais.includes(migracao));
  return { compativel: removidas.length === 0, removidas, novas };
}

// Calcula o sha256 do migrar.mjs de um commit a partir do blob do Git.
export function hashMigradorCommit(ctx, commit) {
  const conteudo = ctx.lerBlob(commit, "docker/app/migrar.mjs");
  if (!conteudo) return null;
  return crypto.createHash("sha256").update(conteudo).digest("hex");
}

// Lê marcadores de operação incerta que impedem downgrade.
export function lerMarcadoresIncerto(ctx) {
  const motivos = [];
  let estadoIncerto = false;
  let journalIncerto = false;
  const falhaCaminho = path.join(ctx.caminhos.estadoDir, "falha.json");
  try {
    const informacao = fs.lstatSync(falhaCaminho);
    if (!informacao.isSymbolicLink() && informacao.isFile() && informacao.size <= 1024 * 1024) {
      let dados = null;
      try {
        dados = JSON.parse(fs.readFileSync(falhaCaminho, "utf8"));
      } catch {
        dados = null;
      }
      const semMigracao = dados?.migracoesPossivelmenteAplicadas === false;
      if (!semMigracao) {
        estadoIncerto = true;
        motivos.push("Há falha anterior com migração possivelmente aplicada.");
      }
    }
  } catch (erro) {
    if (erro.code !== "ENOENT") {
      estadoIncerto = true;
      motivos.push("Não foi possível ler o marcador de falha anterior.");
    }
  }
  const andamento = path.join(ctx.caminhos.estadoDir, "atualizacao-em-andamento.json");
  if (fs.existsSync(andamento)) {
    journalIncerto = true;
    motivos.push("Há atualização em andamento registrada pelo controlador.");
  }
  const journal = path.join(ctx.caminhos.estadoDir, "journal");
  try {
    for (const nome of fs.readdirSync(journal).slice(0, 64)) {
      if (/incerto/i.test(nome)) {
        journalIncerto = true;
        motivos.push("Há registro incerto no journal do controlador.");
        break;
      }
      const caminho = path.join(journal, nome);
      try {
        const informacao = fs.lstatSync(caminho);
        if (!informacao.isFile() || informacao.size > 64 * 1024) continue;
        const texto = fs.readFileSync(caminho, "utf8");
        if (/"incerto"\s*:\s*true|"estado"\s*:\s*"incerto"/i.test(texto)) {
          journalIncerto = true;
          motivos.push("Há registro incerto no journal do controlador.");
          break;
        }
      } catch {
        // Registro ilegível não é tratado como incerto sem marcador explícito.
      }
    }
  } catch (erro) {
    if (erro.code !== "ENOENT") {
      journalIncerto = true;
      motivos.push("Não foi possível ler o journal do controlador.");
    }
  }
  return { estadoIncerto, journalIncerto, motivos };
}

function lerOps(ctx) {
  try {
    return lerEnv(fs.readFileSync(ctx.caminhos.opsEnv, "utf8")).mapa;
  } catch {
    return new Map();
  }
}

function lerPonteiroBackup(ctx, estadoDir) {
  const caminho = path.join(estadoDir, "ultimo-backup.json");
  try {
    const informacao = fs.lstatSync(caminho);
    if (informacao.isSymbolicLink() || !informacao.isFile() || informacao.size > 1024 * 1024) {
      return null;
    }
    const dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
    return dados;
  } catch {
    return null;
  }
}

function conferirReciboBackup(ctx) {
  const ops = lerOps(ctx);
  const estadoDir = String(ops.get("ESTADO_DIR") ?? "") || ctx.caminhos.estadoDir;
  const backupDir = String(ops.get("BACKUP_BANCO_DIR") ?? "") || ctx.caminhos.backupBancoDir;
  const dados = lerPonteiroBackup(ctx, estadoDir);
  if (!dados) {
    throw falha("E_BACKUP", "O backup terminou sem um ponteiro de último backup válido.", {
      dica: "Confira o log de backup-banco.sh e o diretório de estado.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  const recibo = String(dados.recibo ?? "");
  if (!PADRAO_RECIBO.test(recibo)) {
    throw falha("E_BACKUP", "O recibo do backup não segue o formato confirmado.", {
      documentacao: "docs/instalador.md#backup",
    });
  }
  const arquivo = String(dados.arquivo ?? "");
  if (!arquivo || path.basename(arquivo) !== arquivo) {
    throw falha("E_BACKUP", "O ponteiro do backup não informa um arquivo local válido.", {
      documentacao: "docs/instalador.md#backup",
    });
  }
  const sha256 = String(dados.sha256 ?? "");
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw falha("E_BACKUP", "O ponteiro do backup não informa um checksum válido.", {
      documentacao: "docs/instalador.md#backup",
    });
  }
  const local = path.join(backupDir, arquivo);
  if (!fs.existsSync(local)) {
    throw falha("E_BACKUP", "O arquivo de backup não foi encontrado no diretório local.", {
      documentacao: "docs/instalador.md#backup",
    });
  }
  if (sha256Arquivo(local) !== sha256) {
    throw falha("E_BACKUP", "O checksum do arquivo de backup não confere.", {
      dica: "Preserve os arquivos e revise o backup antes de continuar.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  const recibos = [path.join(estadoDir, "recibos", recibo), path.join(backupDir, recibo)];
  if (!recibos.some((caminho) => fs.existsSync(caminho))) {
    throw falha("E_BACKUP", "O arquivo de recibo do backup não foi encontrado.", {
      documentacao: "docs/instalador.md#backup",
    });
  }
  const conferencista = path.join(ctx.caminhos.appDir, "scripts", "servidor", "recibos.mjs");
  if (fs.existsSync(conferencista)) {
    const conferencia = executarEtapa(
      ctx,
      "node",
      [conferencista, "conferir-estado", backupDir, path.join(estadoDir, "ultimo-backup.json")],
      { timeout: 120000 },
    );
    if (conferencia.status !== 0) {
      throw falha("E_BACKUP", "O recibo do backup não passou na conferência de integridade.", {
        dica: "Preserve os artefatos e revise o catálogo de recibos.",
        documentacao: "docs/instalador.md#backup",
      });
    }
  }
  const remoto = String(ops.get("BACKUP_REMOTO") ?? "");
  if (remoto && dados.verificadoRemoto !== true) {
    throw falha("E_BACKUP", "O backup remoto não foi confirmado.", {
      dica: "Confira o rclone, o destino e o checksum remoto.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  return {
    recibo,
    arquivo,
    sha256,
    verificadoEm: ctx.agora(),
    remoto: Boolean(remoto),
  };
}

// Confere o último backup confirmado sem executar uma cópia nova.
export function conferirBackupExistente(ctx) {
  return conferirReciboBackup(ctx);
}

// Executa um backup novo e confirma o recibo antes da troca de canal.
export function executarBackupConfirmado(ctx) {
  const script = path.join(ctx.caminhos.appDir, "scripts", "servidor", "backup-banco.sh");
  const resultado = executarEtapa(ctx, "bash", [script], { timeout: 3600000 });
  if (resultado.status !== 0) {
    throw falha("E_BACKUP", "O backup anterior à troca de canal falhou.", {
      dica: "Confira a cifra, a chave pública, o espaço e o destino remoto.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  return conferirReciboBackup(ctx);
}

// Delega a atualização ao atualizar.sh no modo do canal e confere o estado gravado.
export function delegarAtualizacao(ctx, alvo) {
  const script = path.join(ctx.caminhos.appDir, "scripts", "servidor", "atualizar.sh");
  const argumentos = [script, "--modo", alvo.canal];
  if (alvo.permitirMigracoes) argumentos.push("--permitir-migracoes");
  const resultado = executarEtapa(ctx, "bash", argumentos, {
    timeout: 7200000,
    env: {
      INSTALADOR_ALVO_COMMIT: alvo.commit,
      INSTALADOR_ALVO_TAG: alvo.tag,
      INSTALADOR_ALVO_IMAGEM: alvo.imagem,
      INSTALADOR_ALVO_IMAGEM_BACKUP: alvo.imagemBackup,
    },
  });
  if (resultado.status !== 0) {
    throw falha("E_CANAL", "A atualização do canal não terminou com sucesso.", {
      dica: "Confira o log do atualizar.sh, a saúde e o estado antes de repetir.",
      documentacao: "docs/instalador.md#troca-de-canal",
    });
  }
  const estadoAtualizador = lerEstadoAtualizador({ raiz: ctx.raiz });
  if (!estadoAtualizador.presente || !estadoAtualizador.estado) {
    throw falha("E_CANAL", "O atualizador terminou sem gravar um estado válido.", {
      dica: "Confira o estado em /var/lib/frequenciapp/estado.json.",
      documentacao: "docs/instalador.md#troca-de-canal",
    });
  }
  if (estadoAtualizador.estado.commit !== alvo.commit) {
    throw falha("E_CANAL", "O atualizador aplicou um commit diferente do alvo escolhido.", {
      dica: "Confira a tag estável disponível e repita a troca com a tag aplicada.",
      documentacao: "docs/instalador.md#troca-de-canal",
    });
  }
  if (alvo.canal === "release" && estadoAtualizador.estado.modo !== "release") {
    throw falha("E_CANAL", "O atualizador registrou um modo diferente do canal escolhido.", {
      dica: "Confira o modo do atualizar.sh e o estado gravado.",
      documentacao: "docs/instalador.md#troca-de-canal",
    });
  }
  return estadoAtualizador.estado;
}

// Atualiza as chaves gerenciadas do ops.env depois de uma troca aplicada.
export function atualizarOpsEnv(ctx, alvo) {
  let existente;
  try {
    existente = fs.readFileSync(ctx.caminhos.opsEnv, "utf8");
  } catch {
    throw falha("E_VALIDACAO", "O arquivo ops.env da instalação não foi encontrado.", {
      dica: "Execute o aplicar do perfil antes de trocar o canal.",
      documentacao: "docs/instalador.md#estado-durável",
    });
  }
  const desejado = new Map([
    ["ATUALIZAR_MODO", alvo.canal],
    ["ATUALIZAR_REF", "origin/main"],
    ["ATUALIZAR_PERMITIR_MIGRACOES", "false"],
    ["APP_IMAGEM", `${alvo.imagem}@${alvo.digest}`],
  ]);
  const resultado = atualizarEnv(existente, desejado, CABECALHO_OPS);
  if (resultado.alterou) {
    gravarArquivoPrivado(ctx.caminhos.opsEnv, resultado.texto, ctx.gravarArquivoAtomico);
  }
  return { alterou: resultado.alterou, caminho: ctx.caminhos.opsEnv };
}
