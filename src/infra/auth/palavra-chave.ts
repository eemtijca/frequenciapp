// Geração da palavra-chave do diretor: sorteio uniforme com crypto.randomInt
// sobre um alfabeto sem caracteres ambíguos, sempre com letra e número.
import { randomInt } from "node:crypto";
import {
  ALFABETO_PALAVRA_CHAVE,
  TAMANHO_PALAVRA_CHAVE,
  formatarPalavraChave,
} from "@/domain/diretores";

/** Palavra-chave nova, em blocos de quatro (ex.: k7m2-p9qd-x4ht). */
export function gerarPalavraChave(): string {
  for (;;) {
    let bruta = "";
    for (let indice = 0; indice < TAMANHO_PALAVRA_CHAVE; indice += 1) {
      bruta += ALFABETO_PALAVRA_CHAVE[randomInt(ALFABETO_PALAVRA_CHAVE.length)] ?? "";
    }
    if (/[a-z]/.test(bruta) && /[0-9]/.test(bruta)) return formatarPalavraChave(bruta);
  }
}
