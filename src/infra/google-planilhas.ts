// Leitura inicial de planilhas escolhidas por OAuth, sem expor o token de
// atualização ou detalhes técnicos das respostas do Google.
import { z } from "zod";
import { ErroHttp } from "@/infra/erros";

const planilhaGoogle = z.object({
  spreadsheetId: z.string(),
  properties: z.object({ title: z.string(), timeZone: z.string().optional() }),
  sheets: z.array(z.object({ properties: z.object({ title: z.string(), sheetId: z.number() }) })),
});

export async function lerPlanilhaEscolhida(id: string, acesso: string) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`);
  url.searchParams.set(
    "fields",
    "spreadsheetId,properties(title,timeZone),sheets(properties(title,sheetId))",
  );
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${acesso}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ErroHttp("Não foi possível ler a planilha escolhida agora.", 502);
  }
  if (resposta.status === 403 || resposta.status === 404) {
    throw new ErroHttp("A conta Google não tem acesso à planilha escolhida.", 403);
  }
  if (!resposta.ok) throw new ErroHttp("Não foi possível ler a planilha escolhida agora.", 502);
  const dados = planilhaGoogle.safeParse(await resposta.json());
  if (!dados.success) throw new ErroHttp("A planilha respondeu em formato inesperado.", 502);
  return dados.data;
}
