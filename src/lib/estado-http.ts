// Mapa de status HTTP para a variante visual de estado.
import type { VarianteEstado } from "@/components/ui/tela-estado";
import { ErroApi } from "@/lib/api-cliente";

export function estadoDeErro(excecao: unknown): VarianteEstado {
  if (!(excecao instanceof ErroApi)) return "offline";
  if (excecao.status === 401) return "sessao_expirada";
  if (excecao.status === 403) return "sem_permissao";
  if (excecao.status === 404) return "nao_encontrado";
  if (excecao.status === 409) return "conflito";
  if (excecao.status === 413 || excecao.status === 429) return "limite";
  if (excecao.status >= 500) return "indisponivel";
  return "dados_invalidos";
}
