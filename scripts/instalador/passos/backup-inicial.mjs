// Etapa de backup inicial: executa, verifica o recibo e grava o ponteiro do último backup.
import fs from "node:fs";
import path from "node:path";
import { acao, avisoEtapa, executarEtapa, falha, sha256Arquivo } from "./contexto.mjs";

export const id = "backup-inicial";
export const titulo = "Executa e confere o primeiro backup";
export const limiteSegundos = 3600;

const PADRAO_RECIBO = /^frequenciapp-\d{8}T\d{6}Z-[a-f0-9]{8}\.confirmado\.json$/;

function lerPonteiro(caminho) {
  try {
    const info = fs.lstatSync(caminho);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 1024 * 1024) return null;
    const dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
    return dados;
  } catch {
    return null;
  }
}

function backupValido(ctx) {
  if (!ctx.estado?.backup?.verificadoEm) return false;
  const ponteiro = lerPonteiro(path.join(ctx.caminhos.estadoDir, "ultimo-backup.json"));
  return Boolean(ponteiro?.recibo && PADRAO_RECIBO.test(String(ponteiro.recibo)));
}

function verificarRecibo(ctx) {
  const caminhoEstado = path.join(ctx.caminhos.estadoDir, "ultimo-backup.json");
  const dados = lerPonteiro(caminhoEstado);
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
  const local = path.join(ctx.caminhos.backupBancoDir, arquivo);
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
  const recibos = [
    path.join(ctx.caminhos.estadoDir, "recibos", recibo),
    path.join(ctx.caminhos.backupBancoDir, recibo),
  ];
  if (!recibos.some((caminho) => fs.existsSync(caminho))) {
    throw falha("E_BACKUP", "O arquivo de recibo do backup não foi encontrado.", {
      documentacao: "docs/instalador.md#backup",
    });
  }
  const conferencia = executarEtapa(
    ctx,
    "node",
    [
      path.join(ctx.caminhos.appDir, "scripts", "servidor", "recibos.mjs"),
      "conferir-estado",
      ctx.caminhos.backupBancoDir,
      caminhoEstado,
    ],
    { timeout: 120000 },
  );
  if (conferencia.status !== 0) {
    throw falha("E_BACKUP", "O recibo do backup não passou na conferência de integridade.", {
      dica: "Preserve os artefatos e revise o catálogo de recibos.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  const remoto = String(ctx.ambiente?.get("BACKUP_REMOTO") ?? "");
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

export function executar(ctx) {
  if (ctx.naoIniciar) {
    return {
      estado: "pulada",
      acoes: [acao("Backup inicial não executado por causa de --nao-iniciar", null, false)],
      avisos: [
        avisoEtapa(
          "A_NAO_INICIAR",
          "O backup inicial não foi executado porque a pilha não foi iniciada.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, backup: false },
    };
  }
  if (backupValido(ctx) && !ctx.forcar) {
    return {
      estado: "concluida",
      acoes: [acao("O primeiro backup já está confirmado", null, false)],
      avisos: [],
      detalhes: {
        semMudancas: true,
        backup: true,
        recibo: ctx.estado.backup.ultimoRecibo,
        verificadoEm: ctx.estado.backup.verificadoEm,
      },
    };
  }
  const resultado = executarEtapa(
    ctx,
    "bash",
    [path.join(ctx.caminhos.appDir, "scripts", "servidor", "backup-banco.sh")],
    { timeout: 3600000 },
  );
  if (resultado.status !== 0) {
    throw falha("E_BACKUP", "O primeiro backup falhou.", {
      dica: "Confira a cifra, a chave pública, o espaço e o destino remoto.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  const conferido = verificarRecibo(ctx);
  ctx.backupInfo = conferido;
  return {
    estado: "concluida",
    acoes: [
      acao("Executa o primeiro backup do banco", "scripts/servidor/backup-banco.sh", true),
      acao("Confere o recibo, o checksum e o ponteiro do backup", null, false),
    ],
    avisos: [],
    detalhes: {
      semMudancas: false,
      backup: true,
      recibo: conferido.recibo,
      arquivo: conferido.arquivo,
      sha256: conferido.sha256,
      verificadoEm: conferido.verificadoEm,
      remoto: conferido.remoto,
    },
  };
}
