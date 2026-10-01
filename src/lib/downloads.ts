// Downloads locais: empacotamento AES-256 sem envio da senha ao servidor
// e liberação da URL temporária depois de iniciar o download.
import { erroSenhaZip } from "@/domain/downloads";

export interface ArquivoDownload {
  blob: Blob;
  nome: string;
  /** Nome genérico: o diretório de um ZIP não é criptografado. */
  nomeNoZip: string;
  nomeZip: string;
  registro?: "grade" | "relacao";
}

export async function protegerArquivo(arquivo: ArquivoDownload, senha: string): Promise<Blob> {
  if (erroSenhaZip(senha)) throw new Error("Senha do ZIP fora do padrão.");
  const { BlobReader, BlobWriter, ZipWriter } =
    await import("@zip.js/zip.js/lib/zip-core-native.js");
  // Sem worker, WASM ou codec externo. O conteúdo é armazenado com AES-256.
  const escritor = new ZipWriter(new BlobWriter("application/zip"), {
    password: senha,
    encryptionStrength: 3,
    zipCrypto: false,
    level: 0,
    useWebWorkers: false,
  });
  try {
    await escritor.add(arquivo.nomeNoZip, new BlobReader(arquivo.blob));
    return await escritor.close();
  } catch (erro) {
    await escritor.close().catch(() => undefined);
    throw erro;
  }
}

export function baixarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = nome;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // O navegador precisa consumir o Blob antes de liberar a URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
