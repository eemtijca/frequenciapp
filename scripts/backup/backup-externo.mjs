// Backup operacional agnóstico: rclone externo, pacote protegido e confirmação após releitura integral.
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { conferirPacote, criarPacote, sha256 } from "./pacote-backup.mjs";

function perfil(valor) {
  return (
    typeof valor === "string" &&
    valor.length <= 2000 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*:[^\\\x00-\x1f\x7f]*$/.test(valor) &&
    !valor
      .slice(valor.indexOf(":") + 1)
      .split("/")
      .some((parte) => parte === "." || parte === "..")
  );
}

function partesDoPerfil(valor) {
  const separador = valor.indexOf(":");
  return {
    nome: valor.slice(0, separador),
    pasta: valor
      .slice(separador + 1)
      .split("/")
      .filter(Boolean)
      .join("/"),
  };
}

export function configuracaoBackup(variaveis = process.env) {
  const origem = variaveis.BACKUP_ORIGEM;
  const destino = variaveis.BACKUP_DESTINO;
  const senha = variaveis.BACKUP_CHAVE;
  const configRclone = variaveis.BACKUP_RCLONE_CONFIG;
  if (!perfil(origem) || !perfil(destino))
    throw new Error("Configure perfis de origem e destino do backup.");
  const a = partesDoPerfil(origem);
  const b = partesDoPerfil(destino);
  if (
    a.nome === b.nome &&
    (!a.pasta ||
      !b.pasta ||
      a.pasta === b.pasta ||
      a.pasta.startsWith(`${b.pasta}/`) ||
      b.pasta.startsWith(`${a.pasta}/`))
  ) {
    throw new Error("Origem e destino devem ficar em pastas separadas.");
  }
  if (!configRclone || !path.isAbsolute(configRclone))
    throw new Error("Informe o caminho absoluto da configuração privada do rclone.");
  if (typeof senha !== "string" || senha.length < 32 || senha.length > 256)
    throw new Error("Configure uma chave de recuperação de 32 a 256 caracteres.");
  return { origem, destino, senha, configRclone };
}

function ambienteDoTransporte() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([nome]) =>
      /^(PATH|HOME|TMPDIR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS|RCLONE_CONFIG_PASS|RCLONE_PASSWORD_COMMAND)$/i.test(
        nome,
      ),
    ),
  );
}

/** A senha do pacote e as credenciais da aplicação não são repassadas ao processo de transporte. */
function transporte(configRclone, pasta) {
  return async function executar(argumentos, aoLer) {
    await new Promise((resolve, reject) => {
      const filho = spawn(
        "rclone",
        [
          ...argumentos,
          "--config",
          configRclone,
          "--cache-dir",
          path.join(pasta, "cache"),
          "--temp-dir",
          pasta,
          "--retries",
          "1",
          "--low-level-retries",
          "1",
          "--contimeout",
          "20s",
          "--timeout",
          "2m",
          "--log-level",
          "ERROR",
        ],
        {
          env: ambienteDoTransporte(),
          stdio: ["ignore", aoLer ? "pipe" : "ignore", "ignore"],
          signal: AbortSignal.timeout(10 * 60 * 1000),
        },
      );
      let falhou = false;
      filho.stdout?.on("data", (bytes) => {
        try {
          aoLer(bytes);
        } catch {
          falhou = true;
          filho.kill("SIGKILL");
        }
      });
      filho.on("error", () => reject(new Error("O transporte do backup não pôde ser executado.")));
      filho.on("close", (codigo) => {
        if (codigo !== 0 || falhou)
          reject(
            new Error(
              "O transporte do backup não foi confirmado. Confira a rotina antes de repetir.",
            ),
          );
        else resolve();
      });
    });
  };
}

/** O transporte é substituível; a rotina não conhece APIs, SDKs ou modelos de arquivos de provedores. */
export async function executarBackup(configuracao, executar) {
  const info = await lstat(configuracao.configRclone);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error("A configuração do rclone deve ser um arquivo privado, com permissão 600.");
  const pasta = await mkdtemp(path.join(tmpdir(), "frequenciapp-backup-"));
  try {
    const transferir = executar ?? transporte(configuracao.configRclone, pasta);
    const origem = path.join(pasta, "origem");
    await transferir(["copy", configuracao.origem, origem, "--max-transfer", "64M"]);
    const pacote = await criarPacote(origem, configuracao.senha);
    await conferirPacote(pacote.bytes, configuracao.senha);
    const resumo = sha256(pacote.bytes);
    const agora = new Date().toISOString();
    const arquivo = `frequenciapp-${agora.replace(/[:.]/g, "-")}-${randomUUID()}.zip`;
    const local = path.join(pasta, arquivo);
    await writeFile(local, pacote.bytes, { mode: 0o600 });
    const remoto = `${configuracao.destino.replace(/\/+$/, "")}/${arquivo}`;
    await transferir(["copyto", local, remoto, "--immutable"]);
    const hash = createHash("sha256");
    let recebidos = 0;
    await transferir(["cat", remoto], (bytes) => {
      recebidos += bytes.byteLength;
      if (recebidos > pacote.bytes.byteLength)
        throw new Error("Tamanho inesperado na conferência.");
      hash.update(bytes);
    });
    if (recebidos !== pacote.bytes.byteLength || hash.digest("hex") !== resumo) {
      throw new Error("A cópia enviada não passou na conferência de integridade.");
    }
    const resultado = {
      versao: 1,
      arquivo,
      exportadoEm: agora,
      sha256: resumo,
      bytes: recebidos,
      arquivos: pacote.arquivos,
    };
    const comprovante = path.join(pasta, "confirmacao.json");
    await writeFile(comprovante, JSON.stringify(resultado), { mode: 0o600 });
    await transferir(["copyto", comprovante, `${remoto}.confirmado.json`, "--immutable"]);
    return resultado;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === "--conferir" && process.argv.length === 4) {
      const arquivo = process.argv[3];
      if ((await lstat(arquivo)).size > 66 * 1024 * 1024) throw new Error("Cópia acima do limite.");
      const manifesto = await conferirPacote(await readFile(arquivo), process.env.BACKUP_CHAVE);
      console.log(JSON.stringify({ ok: true, arquivos: manifesto.arquivos.length }));
    } else if (process.argv.length === 2) {
      console.log(JSON.stringify(await executarBackup(configuracaoBackup())));
    } else {
      throw new Error("Argumentos fora do padrão.");
    }
  } catch {
    console.error(
      "Backup não confirmado. Confira configuração, chave, origem e destino. Cópias anteriores foram preservadas.",
    );
    process.exitCode = 1;
  }
}
