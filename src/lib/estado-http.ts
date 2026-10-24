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

/** Título específico para conflitos conhecidos, sem reutilizar o texto da Chamada. */
export function tituloDeConflito(excecao: unknown): string | undefined {
  if (!(excecao instanceof ErroApi) || excecao.status !== 409) return undefined;
  if (excecao.codigo === "JUSTIFICATIVA_EM_USO") return "Justificativa em uso";
  if (excecao.codigo === "LIBERADOR_EM_USO") return "Responsável em uso";
  if (excecao.codigo === "CONFIGURACOES_ALTERADAS")
    return "Configurações alteradas em outro acesso";
  return undefined;
}
