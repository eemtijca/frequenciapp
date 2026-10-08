// Google sintético com arquivos separados, metadados e respostas perdidas da criação e escrita.
import { createServer } from "node:http";
import type pg from "pg";
import { cifrarToken } from "../../src/infra/google-oauth";

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto => (v && typeof v === "object" ? (v as Objeto) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
interface Arquivo {
  doc: Objeto;
  valores: Map<number, unknown[][]>;
}
export async function criarGoogleIndicadoresFalso() {
  const arquivos = new Map<string, Arquivo>();
  const chamadas: string[] = [];
  let perderCriacao = false;
  let perderEscrita = false;
  let recusarCriacao = false;
  let recusarEscrita = false;
  let credencial = "";
  const servidor = createServer(async (req, res) => {
    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(Buffer.from(parte));
    const bruto = Buffer.concat(partes).toString();
    const caminho = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const responder = (corpo: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(corpo));
    };
    if (caminho === "/token") return responder({ access_token: credencial });
    if (req.headers.authorization !== `Bearer ${credencial}`) return responder({}, 401);
    chamadas.push(`${req.method} ${caminho}`);
    if (caminho === "/v4/spreadsheets" && req.method === "POST") {
      if (recusarCriacao) return responder({}, 403);
      const doc = objeto(JSON.parse(bruto));
      const id = `QA_indicadores_${arquivos.size + 1}`;
      doc.spreadsheetId = id;
      arquivos.set(id, { doc, valores: new Map() });
      if (perderCriacao) {
        perderCriacao = false;
        req.socket.destroy();
        return;
      }
      return responder(doc);
    }
    const match = /^\/v4\/spreadsheets\/([\w-]+)(:batchUpdate)?$/.exec(caminho);
    const id = match?.[1];
    const arquivo = id ? arquivos.get(id) : null;
    if (!arquivo) return responder({}, 404);
    if (req.method === "GET") return responder(arquivo.doc);
    if (match?.[2] && req.method === "POST") {
      if (recusarEscrita) return responder({}, 403);
      const corpo = objeto(JSON.parse(bruto));
      for (const pedido of lista(corpo.requests)) {
        const escrita = objeto(objeto(pedido).updateCells);
        if (!escrita.range) continue;
        const sheetId = Number(objeto(escrita.range).sheetId);
        arquivo.valores.set(
          sheetId,
          lista(escrita.rows).map((r) =>
            lista(objeto(r).values).map((c) => {
              const valor = objeto(objeto(c).userEnteredValue);
              return valor.stringValue ?? valor.numberValue ?? "";
            }),
          ),
        );
      }
      if (perderEscrita) {
        perderEscrita = false;
        req.socket.destroy();
        return;
      }
      return responder({});
    }
    responder({}, 400);
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const endereco = servidor.address();
  if (!endereco || typeof endereco === "string")
    throw new Error("Servidor sintético indisponível.");
  credencial = `frequenciapp-teste:${Buffer.from(`http://127.0.0.1:${endereco.port}`).toString("base64url")}`;
  arquivos.set("QA_operacional", {
    doc: { spreadsheetId: "QA_operacional", developerMetadata: [], sheets: [] },
    valores: new Map([[0, [["Dados operacionais preservados"]]]]),
  });
  return {
    async conectar(cliente: pg.Client) {
      await cliente.query(
        `insert into integracoes_planilha (id, ativa, google_refresh_token, google_planilha_id, atualizado_em)
        values ('principal', false, $1, 'QA_operacional', now()) on conflict (id) do update set
        google_refresh_token = $1, google_planilha_id = 'QA_operacional', ativa = false, envio_automatico = false, atualizado_em = now()`,
        [cifrarToken(credencial)],
      );
    },
    ids: () => [...arquivos.keys()].filter((id) => id !== "QA_operacional"),
    valores: (id: string, sheetId: number) => arquivos.get(id)?.valores.get(sheetId) ?? [],
    chamadas: () => chamadas.slice(),
    perderCriacao: () => {
      perderCriacao = true;
    },
    perderEscrita: () => {
      perderEscrita = true;
    },
    recusarCriacao: (valor: boolean) => {
      recusarCriacao = valor;
    },
    recusarEscrita: (valor: boolean) => {
      recusarEscrita = valor;
    },
    adulterarMarcador: (id: string) => {
      const a = arquivos.get(id);
      if (a) a.doc.developerMetadata = [];
    },
    fechar: () =>
      new Promise<void>((resolve, reject) =>
        servidor.close((erro) => (erro ? reject(erro) : resolve())),
      ),
  };
}
