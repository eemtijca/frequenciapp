// Estado privado do dispositivo e cache IndexedDB por chave, período e versão do contrato.
import {
  migrarPersonalizacaoBi,
  personalizacaoVaziaBi,
  type PersonalizacaoBi,
} from "@/domain/bi-personalizacao";
import type { PaginaBi } from "@/domain/bi";
const PREFIXO = "frequencibi:";
const BANCO = "frequencibi-dados-v1";
export const CHAVE_SEGREDO_BI = `${PREFIXO}chave`;
export const TTL_SEGREDO_BI_MS = 7 * 24 * 60 * 60 * 1000;
interface RegistroSegredoBi {
  chave: string;
  guardadoEm: number;
}
function lerRegistroSegredoBi(
  bruto = localStorage.getItem(CHAVE_SEGREDO_BI),
): RegistroSegredoBi | null {
  if (!bruto) return null;
  // O formato anterior guardava só o segredo, sem opt-in nem validade.
  if (!bruto.startsWith("{")) return { chave: bruto, guardadoEm: 0 };
  try {
    const valor = JSON.parse(bruto) as { chave?: unknown; guardadoEm?: unknown };
    if (typeof valor.chave !== "string" || !valor.chave) return null;
    if (typeof valor.guardadoEm !== "number" || !Number.isFinite(valor.guardadoEm)) return null;
    return { chave: valor.chave, guardadoEm: valor.guardadoEm };
  } catch {
    return null;
  }
}
function removerRegistroSegredoBi(registro: RegistroSegredoBi) {
  const atual = lerRegistroSegredoBi();
  if (!atual || atual.chave !== registro.chave || atual.guardadoEm !== registro.guardadoEm)
    return false;
  localStorage.removeItem(CHAVE_SEGREDO_BI);
  return true;
}
export function chaveDoValorSegredoBi(valor: string | null) {
  if (!valor) return "";
  if (!valor.startsWith("{")) return valor;
  try {
    const registro = JSON.parse(valor) as { chave?: unknown };
    return typeof registro.chave === "string" ? registro.chave : "";
  } catch {
    return "";
  }
}
export function lerPersonalizacaoBi() {
  const texto = localStorage.getItem(`${PREFIXO}personalizacao`);
  return texto ? migrarPersonalizacaoBi(JSON.parse(texto)) : personalizacaoVaziaBi();
}
export function guardarPersonalizacaoBi(p: PersonalizacaoBi) {
  localStorage.setItem(`${PREFIXO}personalizacao`, JSON.stringify(p));
}
export function lerSegredoBi() {
  const registro = lerRegistroSegredoBi();
  if (!registro) return "";
  if (Date.now() - registro.guardadoEm > TTL_SEGREDO_BI_MS) return "";
  return registro.chave;
}
export function consumirSegredoBiExpirado() {
  const registro = lerRegistroSegredoBi();
  if (!registro || Date.now() - registro.guardadoEm <= TTL_SEGREDO_BI_MS) return null;
  removerRegistroSegredoBi(registro);
  return registro.chave;
}
export function guardarSegredoBi(chave: string) {
  localStorage.setItem(
    CHAVE_SEGREDO_BI,
    JSON.stringify({ chave, guardadoEm: Date.now() } satisfies RegistroSegredoBi),
  );
}
export function esquecerSegredoBi(chaveEsperada?: string) {
  const registro = lerRegistroSegredoBi();
  if (!registro) {
    // Remove também um valor corrompido que nunca seria recuperado.
    if (chaveEsperada === undefined) localStorage.removeItem(CHAVE_SEGREDO_BI);
    return;
  }
  if (chaveEsperada !== undefined && registro.chave !== chaveEsperada) return;
  removerRegistroSegredoBi(registro);
}
export async function identificadorCacheBi(chave: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chave));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function expurgarRetratosDaChave(chave: string) {
  const id = await identificadorCacheBi(chave);
  await cacheBi("limpar", `${id}:`);
}
/** Mantém apenas o alvo original para uma nova tentativa após falha. */
export function prepararExpurgoBiNoLogout() {
  let registro: RegistroSegredoBi | null | undefined;
  try {
    const bruto = localStorage.getItem(CHAVE_SEGREDO_BI);
    registro = bruto === null ? null : (lerRegistroSegredoBi(bruto) ?? undefined);
  } catch {
    // O alvo continua desconhecido. Uma leitura posterior não identifica a sessão original.
  }
  return async (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (registro === null) return;
    if (registro === undefined) {
      // Sem captura, só é seguro prosseguir quando não restam chave nem retratos.
      if (
        localStorage.getItem(CHAVE_SEGREDO_BI) !== null ||
        (await contarRetratosBi(signal)) !== 0 ||
        localStorage.getItem(CHAVE_SEGREDO_BI) !== null
      ) {
        throw new Error("Não foi possível identificar os dados locais do BI.");
      }
      registro = null;
      return;
    }
    const alvo = registro;
    let falhou = false;
    try {
      removerRegistroSegredoBi(alvo);
    } catch {
      falhou = true;
    }
    const aindaValido = () => {
      try {
        const bruto = localStorage.getItem(CHAVE_SEGREDO_BI);
        if (bruto === null) return true;
        const atual = lerRegistroSegredoBi(bruto);
        return !!atual && (atual.chave !== alvo.chave || atual.guardadoEm === alvo.guardadoEm);
      } catch {
        return false;
      }
    };
    try {
      const calculo = identificadorCacheBi(alvo.chave);
      const id = await aguardarComSinal(calculo, signal);
      await cacheBi("limpar", `${id}:`, undefined, aindaValido, signal);
      if (!aindaValido()) falhou = true;
    } catch {
      falhou = true;
    }
    if (falhou)
      throw new Error(
        "Não foi possível remover todos os dados locais do BI. Confira as permissões do navegador.",
      );
    registro = null;
  };
}

function aguardarComSinal<T>(tarefa: Promise<T>, signal?: AbortSignal) {
  if (!signal) return tarefa;
  return new Promise<T>((resolve, reject) => {
    const cancelar = () => reject(signal.reason);
    signal.addEventListener("abort", cancelar, { once: true });
    if (signal.aborted) cancelar();
    tarefa.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancelar));
  });
}

async function contarRetratosBi(signal?: AbortSignal) {
  const db = await abrirBanco(signal);
  try {
    signal?.throwIfAborted();
    const pedido = db.transaction("retratos").objectStore("retratos").count();
    return await aguardarComSinal(
      new Promise<number>((resolve, reject) => {
        pedido.onsuccess = () => resolve(pedido.result);
        pedido.onerror = () => reject(pedido.error);
      }),
      signal,
    );
  } finally {
    db.close();
  }
}

export async function expurgarBiNoLogout() {
  await prepararExpurgoBiNoLogout()();
}

function abrirBanco(signal?: AbortSignal): Promise<IDBDatabase> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1);
    let bloqueado = false;
    const cancelar = () => reject(signal?.reason);
    const encerrar = () => signal?.removeEventListener("abort", cancelar);
    signal?.addEventListener("abort", cancelar, { once: true });
    pedido.onupgradeneeded = () => {
      if (bloqueado || signal?.aborted) pedido.transaction?.abort();
      else pedido.result.createObjectStore("retratos");
    };
    pedido.onerror = () => {
      encerrar();
      reject(new Error("O navegador não permitiu abrir o armazenamento local."));
    };
    pedido.onblocked = () => {
      bloqueado = true;
      encerrar();
      reject(new Error("Feche outras abas do BI para limpar o armazenamento."));
    };
    pedido.onsuccess = () => {
      encerrar();
      if (bloqueado || signal?.aborted) {
        pedido.result.close();
        return;
      }
      pedido.result.onversionchange = () => pedido.result.close();
      resolve(pedido.result);
    };
  });
}

export async function cacheBi<T>(
  acao: "ler" | "gravar" | "limpar",
  id: string,
  valor?: T,
  aindaValido?: () => boolean,
  signal?: AbortSignal,
): Promise<T | undefined> {
  const db = await abrirBanco(signal);
  try {
    signal?.throwIfAborted();
    if (aindaValido && !aindaValido()) return undefined;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("retratos", acao === "ler" ? "readonly" : "readwrite");
      const cancelar = () => {
        try {
          tx.abort();
        } catch {
          // Se o commit terminou, resta aguardar o evento terminal da transação.
        }
      };
      const encerrar = () => signal?.removeEventListener("abort", cancelar);
      const store = tx.objectStore("retratos");
      let resultado: T | undefined;
      if (acao === "ler") {
        const pedido = store.get(id);
        pedido.onsuccess = () => {
          resultado = pedido.result as T | undefined;
        };
      } else if (acao === "gravar") store.put(valor, id);
      else {
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          if (signal?.aborted || (aindaValido && !aindaValido())) {
            cancelar();
            return;
          }
          const c = cursor.result;
          if (c) {
            if (String(c.key).startsWith(id)) c.delete();
            c.continue();
          }
        };
      }
      tx.oncomplete = () => {
        encerrar();
        if (signal?.aborted) reject(signal.reason);
        else resolve(resultado);
      };
      // A falha de um pedido aborta a transação; só o evento terminal libera a recuperação.
      tx.onabort = () => {
        encerrar();
        reject(new Error("O armazenamento local foi interrompido."));
      };
      signal?.addEventListener("abort", cancelar, { once: true });
    });
  } finally {
    db.close();
  }
}
export async function limparTudoBi() {
  let falhou = false;
  try {
    for (const chave of Object.keys(localStorage)) {
      if (!chave.startsWith(PREFIXO)) continue;
      try {
        localStorage.removeItem(chave);
      } catch {
        falhou = true;
      }
    }
  } catch {
    falhou = true;
  }
  try {
    await cacheBi("limpar", "");
  } catch {
    falhou = true;
  }
  if (falhou)
    throw new Error(
      "Não foi possível remover todos os dados locais. Confira as permissões do navegador e tente novamente.",
    );
}
export interface RetratoBi extends PaginaBi {
  completo: true;
  datasCompletas?: boolean;
  falhaAtualizacao?: boolean;
}
