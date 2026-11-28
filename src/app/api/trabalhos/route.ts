// Lista administrativa de trabalhos genéricos, sem payload e sem dado de aluno.
import { listarTrabalhos } from "@/application/fila-trabalhos";
import {
  ESTADOS_TRABALHO,
  TIPOS_TRABALHO,
  type EstadoTrabalho,
  type TipoTrabalho,
} from "@/domain/trabalho";
import { erroApi, executarRota, exigirAdmin, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const parametros = new URL(requisicao.url).searchParams;
    const tipo = parametros.get("tipo");
    const estado = parametros.get("estado");
    if (tipo && !(TIPOS_TRABALHO as readonly string[]).includes(tipo)) {
      return erroApi("Tipo de trabalho inválido.", 400);
    }
    if (estado && !(ESTADOS_TRABALHO as readonly string[]).includes(estado)) {
      return erroApi("Estado de trabalho inválido.", 400);
    }
    const pagina = Number(parametros.get("pagina") ?? "0");
    const limite = Number(parametros.get("limite") ?? "50");
    return json(
      await listarTrabalhos({
        ...(tipo ? { tipo: tipo as TipoTrabalho } : {}),
        ...(estado ? { estado: estado as EstadoTrabalho } : {}),
        pagina: Number.isInteger(pagina) ? pagina : 0,
        limite: Number.isInteger(limite) ? limite : 50,
      }),
    );
  });
}
