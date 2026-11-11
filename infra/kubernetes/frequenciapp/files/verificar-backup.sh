#!/usr/bin/env bash
# Bloqueia operações protegidas sem prova de origem; diagnóstico não autoriza upgrade.
set -Eeuo pipefail

falhar() {
  printf '[backup-gate] %s\n' "$*" >&2
  exit 1
}

if [ "$#" -eq 0 ]; then
  [ -n "${BACKUP_ORIGEM_POLICY:-}" ] || falhar "Adoção ausente: origem URL protegida exige policy independente e chave fora do PVC."
  exec node scripts/servidor/origem-backup.mjs verificar
fi
[ "$#" -eq 1 ] && [ "$1" = "--diagnosticar-integridade" ] ||
  falhar "Uso: verificar-backup.sh [--diagnosticar-integridade]"

estado_dir="${ESTADO_DIR:-/backups/estado}"
estado="$estado_dir/ultimo-backup.json"
backup_dir="${BACKUP_BANCO_DIR:-/backups/banco}"
idade_maxima="${BACKUP_GATE_IDADE_MAXIMA_HORAS:-36}"
exigir_remoto="${BACKUP_GATE_EXIGIR_REMOTO:-false}"

case "$idade_maxima" in
  '' | *[!0-9]*) falhar "BACKUP_GATE_IDADE_MAXIMA_HORAS deve ser um número inteiro." ;;
esac
case "$exigir_remoto" in
  true | false) ;;
  *) falhar "BACKUP_GATE_EXIGIR_REMOTO deve ser true ou false." ;;
esac
[ -f "$estado" ] ||
  falhar "Não há recibo de backup confirmado em $estado. Execute o backup do banco antes da migração."
[ -r "$estado" ] || falhar "O recibo de backup não pode ser lido."

# O diretório de trabalho é /app na imagem de backup, onde o Dockerfile da
# aplicação inclui scripts/servidor. O ConfigMap contém somente este script.
node --input-type=module - "$estado" "$backup_dir" "$idade_maxima" "$exigir_remoto" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

try {
  const [estado, diretorio, idadeMaxima, exigirRemoto] = process.argv.slice(2);
  const { validarRecibo } = await import(
    pathToFileURL(path.resolve("scripts/servidor/recibos.mjs")).href
  );
  const regular = (arquivo) => {
    const stat = fs.lstatSync(arquivo);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Arquivo não regular.");
  };
  regular(estado);
  const p = JSON.parse(fs.readFileSync(estado, "utf8"));
  if (typeof p.em !== "string" || !Number.isFinite(Date.parse(p.em))) {
    throw new Error("A data do recibo é inválida.");
  }
  const horas = Number(idadeMaxima);
  if (!Number.isSafeInteger(horas) || horas < 0 || horas > Number.MAX_SAFE_INTEGER / 3600000) {
    throw new Error("BACKUP_GATE_IDADE_MAXIMA_HORAS fora do intervalo permitido.");
  }
  const idade = Date.now() - Date.parse(p.em);
  if (idade < -300000) throw new Error("A data do recibo está no futuro.");
  if (idade > horas * 3600000) {
    throw new Error(`O último backup confirmado tem mais de ${idadeMaxima} horas.`);
  }
  if (typeof p.verificadoRemoto !== "boolean") throw new Error("Confirmação remota deve ser booleana.");
  if (exigirRemoto === "true" && p.verificadoRemoto !== true) {
    throw new Error("O recibo não confirma a verificação da cópia remota.");
  }
  if (typeof p.recibo !== "string" || !/^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$/.test(p.recibo)) {
    throw new Error("Ponteiro sem recibo individual válido.");
  }
  const caminhoRecibo = path.join(diretorio, p.recibo);
  regular(caminhoRecibo);
  const r = validarRecibo(JSON.parse(fs.readFileSync(caminhoRecibo, "utf8")));
  const dump = r.artefatos.find((a) => a.nome === `${r.base}.dump.${r.criptografia}`);
  const ambiente = r.artefatos.find((a) => a.nome === `${r.base}-ambiente.env.${r.criptografia}`);
  if (
    p.recibo !== `${r.base}.confirmado.json` || p.em !== r.em || p.modo !== "url" ||
    r.escopo.alvo !== "url-conservador" || p.schema !== r.escopo.schema ||
    p.criptografia !== r.criptografia || p.remoto !== r.remoto ||
    p.verificadoRemoto !== r.etapas.remotoVerificado ||
    p.arquivo !== dump?.nome || p.sha256 !== dump?.sha256 ||
    p.ambiente !== (ambiente?.nome ?? "") || p.ambienteSha256 !== (ambiente?.sha256 ?? "")
  ) throw new Error("Ponteiro diverge do recibo ou do escopo.");
  // validarRecibo mantém a lista fechada de nomes e hashes do produtor. Somente
  // a leitura dos artefatos é substituída por fluxo, sem carregar o dump inteiro.
  for (const a of r.artefatos) {
    const arquivo = path.join(diretorio, a.nome);
    regular(arquivo);
    const h = createHash("sha256");
    for await (const bloco of fs.createReadStream(arquivo)) h.update(bloco);
    if (h.digest("hex") !== a.sha256) throw new Error("Artefato local ausente ou divergente.");
  }
  for (const a of r.artefatos.filter((item) => !item.nome.endsWith(".sha256"))) {
    const arquivo = path.join(diretorio, `${a.nome}.sha256`);
    const esperado = `${a.sha256}  ${a.nome}\n`;
    // Limita a leitura também quando o checksum associado for malicioso.
    if (fs.statSync(arquivo).size !== Buffer.byteLength(esperado) || fs.readFileSync(arquivo, "utf8") !== esperado) {
      throw new Error("Checksum associado divergente.");
    }
  }
  process.stdout.write(`[backup-gate] Integridade local conferida em ${r.em}, arquivo ${dump.nome}; origem e recuperação não comprovadas. Diagnóstico não autoriza operações protegidas.\n`);
} catch (erro) {
  process.stderr.write(`[backup-gate] ${erro.message}\n`);
  process.exitCode = 1;
}
NODE
