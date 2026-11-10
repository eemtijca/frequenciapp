// Valida saída GPG por fingerprint independente e seleciona uma chave de cifra.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function destinatarioGpg(
  texto,
  esperado,
  configurado,
  agora = Math.floor(Date.now() / 1000),
) {
  if (
    ![esperado, configurado].every(
      (v) => typeof v === "string" && /^(?:[A-F0-9]{40}|[A-F0-9]{64})$/.test(v),
    )
  ) {
    throw new Error("Fingerprint completo obrigatório para pin e destinatário GPG.");
  }
  const chaves = [];
  let atual;
  for (const linha of texto.split("\n")) {
    const c = linha.split(":");
    if (c[0] === "pub" || c[0] === "sub") {
      atual = {
        tipo: c[0],
        validade: c[1],
        expira: Number(c[6] || 0),
        cifra: c[11]?.includes("e"),
        fingerprint: "",
      };
      chaves.push(atual);
    } else if (c[0] === "fpr" && atual && !atual.fingerprint) atual.fingerprint = c[9];
  }
  const primarias = chaves.filter((c) => c.tipo === "pub");
  const valida = (c) =>
    !["r", "e", "d", "i"].includes(c.validade) &&
    Number.isFinite(c.expira) &&
    (c.expira === 0 || c.expira > agora);
  if (primarias.length !== 1 || primarias[0].fingerprint !== esperado || !valida(primarias[0])) {
    throw new Error("Chave primária diverge do pin, está inválida ou é ambígua.");
  }
  const elegiveis = chaves.filter(
    (c) => c.cifra && valida(c) && (configurado === esperado || c.fingerprint === configurado),
  );
  if (elegiveis.length !== 1 || !/^(?:[A-F0-9]{40}|[A-F0-9]{64})$/.test(elegiveis[0].fingerprint)) {
    throw new Error(
      "Destinatário de cifra ausente, expirado ou ambíguo; selecionar fingerprint exato.",
    );
  }
  return elegiveis[0].fingerprint;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(
      destinatarioGpg(
        readFileSync(0, "utf8"),
        process.env.BACKUP_GPG_FINGERPRINT,
        process.env.BACKUP_GPG_DESTINATARIO,
      ),
    );
  } catch {
    console.error(
      "[cifra] Destinatário GPG não conferido; revisar pin e chave pública por canal independente.",
    );
    process.exitCode = 1;
  }
}
