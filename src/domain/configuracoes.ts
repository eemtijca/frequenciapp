// Contrato compartilhado do rascunho único de configurações.
import type { ConfiguracaoNotificacoes } from "@/domain/notificacoes";
import type { ParametrosAcesso } from "@/domain/diretores";
import type { OrdemAlmocoDoDia } from "@/domain/ordem-almoco";
import type { RegraFrequenciaBeneficio } from "@/domain/beneficios-frequencia";
import type { Feriado } from "@/domain/calendario-letivo";
import type { ChaveBi } from "@/domain/bi";
import type {
  Configuracoes,
  JustificativaConfigurada,
  LiberadorConfigurado,
} from "@/domain/frequencia";

/** Chave do BI com as marcas locais do rascunho, enviadas no lote. */
export interface ChaveBiDesejada extends ChaveBi {
  rotacionar?: boolean;
  revogada?: boolean;
}

export type SecaoConfiguracao =
  | "configuracao"
  | "notificacoes"
  | "acesso"
  | "ordemAlmoco"
  | "beneficios"
  | "justificativas"
  | "liberadores"
  | "feriados"
  | "chavesBi";

export interface ConfiguracoesCompletas {
  configuracoes: Configuracoes;
  notificacoes: ConfiguracaoNotificacoes;
  acesso: ParametrosAcesso;
  ordemAlmoco: OrdemAlmocoDoDia[];
  beneficios: RegraFrequenciaBeneficio[];
  justificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  feriados: Feriado[];
  chavesBi: ChaveBiDesejada[];
  revisoes: Record<SecaoConfiguracao, string>;
}

export interface ResultadoLote {
  completo: ConfiguracoesCompletas;
  segredosBi: { id: string; rotulo: string; segredo: string }[];
}
