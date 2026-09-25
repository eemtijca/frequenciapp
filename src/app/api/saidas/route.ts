// Saídas antecipadas: consulta por dia, período ou aluno e registro pela
// direção ou coordenação.
import { criarSaida, listarSaidas } from "@/application/saidas";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";
import { diaValidoOuParametro } from "@/application/frequencias";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const parametros = new URL(requisicao.url).searchParams;

    const alunoId = parametros.get("alunoId")?.trim() ?? "";
    const turmaId = parametros.get("turmaId")?.trim() ?? "";
    if (alunoId && !ehUuid(alunoId)) return erroApi("Aluno inválido.", 400);
    if (turmaId && !ehUuid(turmaId)) return erroApi("Turma inválida.", 400);

    const diaBruto = parametros.get("dia");
    const deBruto = parametros.get("de");
    const ateBruto = parametros.get("ate");
    if (!diaBruto && !deBruto && !ateBruto && !alunoId && !turmaId) {
      return erroApi("Informe o dia, o período, o aluno ou a turma.", 400);
    }

    const dia = diaBruto ? diaValidoOuParametro(diaBruto) : null;
    const de = deBruto ? diaValidoOuParametro(deBruto) : null;
    const ate = ateBruto ? diaValidoOuParametro(ateBruto) : null;
    if (diaBruto && !dia) return erroApi("Data inválida.", 400);
    if (deBruto && !de) return erroApi("Data inicial inválida.", 400);
    if (ateBruto && !ate) return erroApi("Data final inválida.", 400);
    if (de && ate && ate < de) {
      return erroApi("A data final deve ser igual ou posterior à inicial.", 400);
    }

    return json({
      saidas: await listarSaidas({
        ...(dia ? { dia } : {}),
        ...(de ? { de } : {}),
        ...(ate ? { ate } : {}),
        ...(alunoId ? { alunoId } : {}),
        ...(turmaId ? { turmaId } : {}),
      }),
    });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const saida = await criarSaida(sessao.usuario, await corpoJson(requisicao));
    return json({ saida }, 201);
  });
}
