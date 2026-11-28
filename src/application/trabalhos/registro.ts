// Registro fechado dos manipuladores de trabalho. Nenhum tipo é carregado
// dinamicamente a partir do payload ou de entrada do cliente.
import type { RegistroDeManipuladores } from "@/application/fila-trabalhos";
import { executarExpurgo } from "./expurgo";
import { executarIndicadores } from "./indicadores";
import { executarPlanilhaMensal } from "./planilha-mensal";

export function criarRegistroDeManipuladores(): RegistroDeManipuladores {
  return {
    INDICADORES_ATUALIZAR: executarIndicadores,
    PLANILHA_MENSAL_PREPARAR: executarPlanilhaMensal,
    EXPURGO_TRABALHOS: executarExpurgo,
  };
}
