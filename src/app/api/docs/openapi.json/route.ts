// Especificação OpenAPI 3.1 publicada pela aplicação.
import especificacao from "../../../../../docs/openapi.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(especificacao, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
