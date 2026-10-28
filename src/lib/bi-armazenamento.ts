// Estado privado do dispositivo e cache IndexedDB por chave, período e versão do contrato.
import {
  migrarPersonalizacaoBi,
  personalizacaoVaziaBi,
  type PersonalizacaoBi,
} from "@/domain/bi-personalizacao";
import type { PaginaBi } from "@/domain/bi";
const PREFIXO = "frequencibi:";
const BANCO = "frequencibi-dados-v1";
export function lerPersonalizacaoBi() {
  const texto = localStorage.getItem(`${PREFIXO}personalizacao`);
  return texto ? migrarPersonalizacaoBi(JSON.parse(texto)) : personalizacaoVaziaBi();
}
export function guardarPersonalizacaoBi(p: PersonalizacaoBi) {
  localStorage.setItem(`${PREFIXO}personalizacao`, JSON.stringify(p));
}
export function lerSegredoBi() {
  return localStorage.getItem(`${PREFIXO}chave`) ?? "";
}
export function guardarSegredoBi(chave: string) {
  localStorage.setItem(`${PREFIXO}chave`, chave);
}
export function esquecerSegredoBi() {
  localStorage.removeItem(`${PREFIXO}chave`);
}
export async function identificadorCacheBi(chave: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chave));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
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
  for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIXO)) localStorage.removeItem(k);
  await cacheBi("limpar", "");
}
export interface RetratoBi extends PaginaBi {
  completo: true;
  datasCompletas?: boolean;
  falhaAtualizacao?: boolean;
}
