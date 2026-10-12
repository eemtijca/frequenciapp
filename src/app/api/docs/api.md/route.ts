// Versão em Markdown da referência da API, pensada para agentes de IA.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const texto = await readFile(path.join(process.cwd(), "docs", "api.md"), "utf8");
  return new Response(texto, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
