// Lê o cabeçalho observado da aba sintética para as asserções de preparo.
export function cabecalhoDaFixture(
  google: { linha(aba: string, linha: number): string[] },
  aba: string,
): string[] {
  const valores = google.linha(aba, 1);
  while (valores.at(-1) === "") valores.pop();
  return valores;
}
