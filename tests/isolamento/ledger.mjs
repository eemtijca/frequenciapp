// Persiste somente identidades próprias, fases e resíduos, sem ambientes ou segredos.
import { openSync, closeSync, writeFileSync, fsyncSync, renameSync } from "node:fs";
import path from "node:path";
export function criarLedger(arquivo, rodada) {
  const estado = {
    versao: 1,
    rodada,
    containers: [],
    redes: [],
    imagens: [],
    problemas: [],
    incertos: [],
    sinal: null,
    status: 0,
  };
  let sequencia = 0;
  function salvar() {
    const temporario = `${arquivo}.${++sequencia}.novo`;
    const fd = openSync(temporario, "wx", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(estado));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporario, arquivo);
    const diretorio = openSync(path.dirname(arquivo), "r");
    try {
      fsyncSync(diretorio);
    } finally {
      closeSync(diretorio);
    }
  }
  salvar();
  return {
    estado,
    salvar,
    registrar(grupo, recurso) {
      estado[grupo].push({ ...recurso, estado: "criado" });
      salvar();
    },
    removido(grupo, id) {
      const r = estado[grupo].find((r) => r.id === id);
      if (!r) throw new Error("ID ausente no ledger próprio.");
      r.estado = "removido";
      salvar();
    },
    problema(fase, id) {
      estado.problemas.push({ fase, id });
      salvar();
    },
    incerto(tipo) {
      estado.incertos.push({ tipo, recuperacaoAutomatica: false });
      salvar();
    },
  };
}
