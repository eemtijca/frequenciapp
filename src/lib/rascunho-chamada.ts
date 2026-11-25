// Chaves e detecção dos rascunhos de Chamada guardados na aba.
function prefixo(usuarioId: string): string {
  return `frequencia:rascunho:${usuarioId}:`;
}

export function chaveRascunho(usuarioId: string, dia: string, turmaId: string): string {
  return `${prefixo(usuarioId)}${dia}:${turmaId}`;
}

export function temRascunhoChamada(usuarioId: string): boolean {
  try {
    const armazenamento = window.sessionStorage;
    const inicio = prefixo(usuarioId);
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
