// Chaves e detecção dos rascunhos de Chamada guardados na aba.
function prefixo(usuarioId: string, referenciaSessao: string): string {
  return `frequencia:rascunho:sessao:${usuarioId}:${referenciaSessao}:`;
}

export function chaveRascunho(
  usuarioId: string,
  referenciaSessao: string | undefined,
  dia: string,
  turmaId: string,
): string | null {
  return referenciaSessao ? `${prefixo(usuarioId, referenciaSessao)}${dia}:${turmaId}` : null;
}

export function temRascunhoChamada(
  usuarioId: string,
  referenciaSessao: string | undefined,
): boolean {
  if (!referenciaSessao) return false;
  try {
    const armazenamento = window.sessionStorage;
    const inicio = prefixo(usuarioId, referenciaSessao);
    for (let indice = 0; indice < armazenamento.length; indice++) {
      const chave = armazenamento.key(indice);
      if (!chave?.startsWith(inicio)) continue;
      const bruto = armazenamento.getItem(chave);
      if (!bruto) continue;
      try {
        const rascunho: unknown = JSON.parse(bruto);
        if (
          typeof rascunho === "object" &&
          rascunho !== null &&
          "versao" in rascunho &&
          rascunho.versao === 3 &&
          "faltas" in rascunho &&
          Array.isArray(rascunho.faltas)
        )
          return true;
      } catch {
        // A própria Chamada informa e descarta a cópia ilegível ao tentar recuperá-la.
      }
    }
  } catch {
    // A pendência em memória ainda protege a sessão com armazenamento indisponível.
  }
  return false;
}
