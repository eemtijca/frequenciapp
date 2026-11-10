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
function lerRegistroSegredoBi(): RegistroSegredoBi | null {
  const bruto = localStorage.getItem(CHAVE_SEGREDO_BI);
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
export async function expurgarBiNoLogout() {
  const registro = lerRegistroSegredoBi();
  if (!registro) return;
  let falhou = false;
  try {
    removerRegistroSegredoBi(registro);
  } catch {
    falhou = true;
  }
  try {
    await expurgarRetratosDaChave(registro.chave);
  } catch {
    falhou = true;
  }
  if (falhou)
    throw new Error(
      "Não foi possível remover todos os dados locais do BI. Confira as permissões do navegador.",
    );
}
function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore("retratos");
    pedido.onerror = () =>
      reject(new Error("O navegador não permitiu abrir o armazenamento local."));
    pedido.onblocked = () =>
      reject(new Error("Feche outras abas do BI para limpar o armazenamento."));
    pedido.onsuccess = () => {
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
): Promise<T | undefined> {
  const db = await abrirBanco();
  if (aindaValido && !aindaValido()) {
    db.close();
    return undefined;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("retratos", acao === "ler" ? "readonly" : "readwrite");
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
        const c = cursor.result;
        if (c) {
          if (String(c.key).startsWith(id)) c.delete();
          c.continue();
        }
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("Não foi possível guardar os dados. Confira o espaço do dispositivo."));
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("O armazenamento local foi interrompido."));
    };
  });
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
