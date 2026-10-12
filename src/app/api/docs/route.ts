// Página da documentação interativa (Swagger UI) com o nonce da CSP.
import { headers } from "next/headers";
import { paginaDocumentacao } from "@/infra/documentacao";

export const dynamic = "force-dynamic";

export async function GET() {
  const nonce = (await headers()).get("x-nonce") ?? "";
  return new Response(paginaDocumentacao(nonce), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      Link: '</api/docs/api.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"',
    },
  });
}
