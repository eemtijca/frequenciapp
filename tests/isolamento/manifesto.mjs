// Materializa a prova com o usuário efetivo do runner, sem preservar UID do host.
export async function prepararManifesto(prova, pasta = "/run/frequenciapp-isolamento") {
  const fs = await import("node:fs");
  fs.mkdirSync(pasta, { mode: 0o700, recursive: true });
  const dir = fs.lstatSync(pasta);
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== process.getuid() ||
    (dir.mode & 0o777) !== 0o700
  )
    throw new Error("Diretório privado da prova sem ownership do runner.");
  const arquivo = `${pasta}/manifesto.json`;
  fs.writeFileSync(arquivo, JSON.stringify(prova), { mode: 0o600, flag: "wx" });
  const stat = fs.lstatSync(arquivo);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o777) !== 0o600
  )
    throw new Error("Manifesto sem ownership efetivo do runner.");
}
