// Escrita revisada da chamada parcial: preserva linhas manuais e reconfere as células.
import { ABA_PARCIAL, CABECALHO_PARCIAL } from "@/domain/planilha-parcial";
import { hashTexto } from "@/domain/planilha";
import { ErroHttp } from "./erros";
import type { ControleTravaParcial } from "./trava-planilha-parcial";
import {
  exigirAbaGoogle,
  lerDocumentoGoogle,
  lerGoogle,
  marcadoresDaAba,
} from "./google-planilhas-api";
import { enviarLotesGoogle, planejarEscritaGoogle } from "./google-planilhas-escrita";

type Celula = { coluna: number; valor: string };
export interface EscritaParcial {
  criar: { linha: number; celulas: Celula[] }[];
  atualizar: { linha: number; codigo: string; anteriores: string[]; celulas: Celula[] }[];
}

export async function aplicarParciaisGoogle(
  id: string,
  acesso: string,
  assinatura: string,
  leituraHash: string,
  alteracoes: EscritaParcial,
  controle?: ControleTravaParcial,
) {
  controle?.conferir();
  const doc = await lerDocumentoGoogle(id, acesso);
  const leitura = await lerGoogle(id, acesso, ABA_PARCIAL, undefined, 1, doc);
  if (hashTexto(JSON.stringify(leitura)) !== leituraHash)
    throw new ErroHttp("A planilha mudou antes do envio. Faça outra prévia.", 409);
  const aba = exigirAbaGoogle(doc, ABA_PARCIAL);
  const linhasProprias = new Set(marcadoresDaAba(doc, aba, "frequenciapp.linha", "ROWS"));
  const codigos = new Map<string, number>();
  for (const valores of leitura.valores.slice(1)) {
    const codigo = valores[7]?.trim();
    if (codigo) codigos.set(codigo, (codigos.get(codigo) ?? 0) + 1);
  }
  for (const item of alteracoes.atualizar) {
    const indice = item.linha - 1;
    const valores = leitura.valores[indice] ?? [];
    if (
      item.linha <= 1 ||
      !linhasProprias.has(item.linha) ||
      valores[7] !== item.codigo ||
      codigos.get(item.codigo) !== 1 ||
      item.anteriores.length !== CABECALHO_PARCIAL.length ||
      item.anteriores.some((valor, coluna) => (valores[coluna] ?? "") !== valor) ||
      leitura.formula[indice]?.slice(0, CABECALHO_PARCIAL.length).some(Boolean) ||
      item.celulas.some(
        (celula) =>
          celula.coluna < 1 || celula.coluna > CABECALHO_PARCIAL.length || celula.coluna === 8,
      )
    )
      throw new ErroHttp(
        "Um registro mudou ou não pertence à integração. Confira a planilha.",
        409,
      );
  }
  // A autorização de substituição fica limitada a estas linhas reconhecidas e revisadas.
  const operacoes = [
    ...(alteracoes.criar.length ? [{ tipo: "criarLinhas", itens: alteracoes.criar }] : []),
    ...alteracoes.atualizar.flatMap((item) =>
      item.celulas.map((celula) => ({
        tipo: "substituir",
        linha: item.linha,
        coluna: celula.coluna,
        valor: celula.valor,
        anterior: item.anteriores[celula.coluna - 1] ?? "",
      })),
    ),
  ];
  const plano = planejarEscritaGoogle(
    doc,
    ABA_PARCIAL,
    leitura.valores,
    leitura.formula,
    1,
    assinatura,
    operacoes,
    true,
  );
  if ((plano.contagens.puladasOcupadas ?? 0) > 0 || (plano.contagens.puladasFormula ?? 0) > 0)
    throw new ErroHttp("Uma linha mudou antes do envio. Faça outra prévia.", 409);
  controle?.conferir();
  await enviarLotesGoogle(id, acesso, plano.requests, controle);
  return {
    linhasCriadas: plano.contagens.linhasCriadas ?? 0,
    linhasAtualizadas: alteracoes.atualizar.length,
  };
}
