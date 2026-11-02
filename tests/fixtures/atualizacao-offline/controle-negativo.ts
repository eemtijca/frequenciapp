const guarda =
  '      avisarInfo("Sem conexão. Os dados atuais continuam na tela.");\n      return;';

// Recebe e devolve texto em memória; falha fechado se a guarda mudar ou duplicar.
export function removerReturnDaCopia(codigo: string): string {
  if (codigo.split(guarda).length !== 2) {
    throw new Error("Guarda offline mudou: controle negativo recusado");
  }
  return codigo.replace(guarda, guarda.replace("\n      return;", ""));
}
