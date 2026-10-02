// Diagnóstico das operações de planilha, sem expor detalhes técnicos na interface.
import { ErroHttp } from "@/infra/erros";

/** Texto para o registro de sincronização: frase e detalhe, no limite da coluna. */
export function mensagemParaRegistro(erro: unknown, padrao: string): string {
  if (!(erro instanceof ErroHttp)) return padrao;
  const motivo = (erro as { detalhe?: unknown }).detalhe;
  const detalhe = typeof motivo === "string" && motivo ? ` Detalhe: ${motivo}` : "";
  return `${erro.message}${detalhe}`.slice(0, 300);
}
