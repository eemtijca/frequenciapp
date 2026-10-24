// Leitura agregada das configurações, catálogos e revisões para o rascunho único.
import { lerConfiguracoesCompletas } from "@/application/configuracoes-completo";
import { executarRota, exigirAdmin, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await lerConfiguracoesCompletas());
  });
}
