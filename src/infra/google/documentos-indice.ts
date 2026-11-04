// Cliente restrito do Google Docs para criar e atualizar o índice sem repetir escritas incertas.
import { z } from "zod";
import { hashTexto } from "@/domain/planilha";
import { ErroHttp } from "@/infra/erros";

const BASE = "https://docs.googleapis.com/v1/documents";
const esquema = z.object({
  documentId: z.string().regex(/^[\w-]{1,200}$/),
  revisionId: z.string().min(1),
  body: z.object({
    content: z.array(
      z
        .object({
          endIndex: z.number().int().positive().optional(),
          paragraph: z
            .object({
              elements: z.array(
                z.object({ textRun: z.object({ content: z.string() }).optional() }),
              ),
            })
            .optional(),
          sectionBreak: z.unknown().optional(),
        })
        .passthrough(),
    ),
  }),
});

export class ErroCriacaoDocumento extends ErroHttp {
  constructor(public readonly recusado: boolean) {
    super(
      recusado
        ? "Não foi possível criar o índice. Confira se a Google Docs API está ativada e se a conta tem acesso."
        : "A criação do índice não foi confirmada. Confira o Google Drive antes de tentar novamente.",
      502,
    );
  }
}

async function solicitar(acesso: string, sufixo: string, corpo?: unknown) {
  return fetch(`${BASE}${sufixo}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${acesso}`,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

export async function criarDocumentoIndice(acesso: string, titulo: string): Promise<string> {
  let resposta: Response;
  try {
    resposta = await solicitar(acesso, "", { title: titulo });
  } catch {
    throw new ErroCriacaoDocumento(false);
  }
  // Somente uma recusa explícita comprova que nenhum documento foi criado.
  if (!resposta.ok) throw new ErroCriacaoDocumento(resposta.status >= 400 && resposta.status < 500);
  const dados = z
    .object({ documentId: z.string().regex(/^[\w-]{1,200}$/) })
    .safeParse(await resposta.json().catch(() => null));
  if (!dados.success) throw new ErroCriacaoDocumento(false);
  return dados.data.documentId;
}

export async function atualizarDocumentoIndice(
  acesso: string,
  id: string,
  indice: { texto: string; estilos: Record<string, unknown>[] },
  assinatura: string | null,
) {
  let resposta: Response;
  try {
    resposta = await solicitar(acesso, `/${encodeURIComponent(id)}`);
  } catch {
    throw new ErroHttp("Não foi possível consultar o índice agora.", 502);
  }
  if (!resposta.ok)
    throw new ErroHttp(
      "Não foi possível abrir o índice. Confira a conta Google e o acesso ao documento.",
      502,
    );
  const lido = esquema.safeParse(await resposta.json().catch(() => null));
  if (!lido.success || lido.data.documentId !== id)
    throw new ErroHttp("Não foi possível conferir o índice.", 502);
  const conteudo = lido.data.body.content;
  const incompleto = conteudo.some(
    (item) =>
      (!item.paragraph && !item.sectionBreak) ||
      item.paragraph?.elements.some((elemento) => !elemento.textRun),
  );
  const atual = conteudo
    .flatMap(
      (item) => item.paragraph?.elements.map((elemento) => elemento.textRun?.content ?? "") ?? [],
    )
    .join("");
  const desejado = `${indice.texto}\n`;
  const novaAssinatura = hashTexto(desejado);
  // Uma resposta perdida pode deixar o texto desejado pronto; a releitura permite recuperá-lo.
  if (!incompleto && atual === desejado) return novaAssinatura;
  if (incompleto || (assinatura ? hashTexto(atual) !== assinatura : atual !== "\n")) {
    throw new ErroHttp(
      "O índice foi editado no Google Docs. As alterações foram preservadas; confira o documento antes de atualizar.",
      409,
    );
  }
  const fim = conteudo.at(-1)?.endIndex;
  if (!fim || fim < 2) throw new ErroHttp("Não foi possível conferir o conteúdo do índice.", 502);
  const requests: Record<string, unknown>[] = [];
  if (fim > 2)
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: fim - 1 } } });
  const range = { startIndex: 1, endIndex: indice.texto.length + 1 };
  requests.push(
    { insertText: { location: { index: 1 }, text: indice.texto } },
    {
      updateParagraphStyle: {
        range,
        paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
        fields: "namedStyleType",
      },
    },
    { updateTextStyle: { range, textStyle: {}, fields: "link" } },
    ...indice.estilos,
  );
  try {
    resposta = await solicitar(acesso, `/${encodeURIComponent(id)}:batchUpdate`, {
      writeControl: { requiredRevisionId: lido.data.revisionId },
      requests,
    });
  } catch {
    throw new ErroHttp(
      "A atualização do índice não foi confirmada. Confira o documento antes de atualizar novamente.",
      502,
    );
  }
  if (!resposta.ok)
    throw new ErroHttp(
      "O índice não pôde ser atualizado. Confira o documento e tente novamente.",
      409,
    );
  return novaAssinatura;
}
