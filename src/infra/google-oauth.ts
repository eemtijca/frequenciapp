// Autorização Google da planilha: estado assinado, PKCE, tokens cifrados e
// renovação de acesso somente no servidor.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";

const ESCOPO = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DURACAO_ESTADO_MS = 10 * 60 * 1000;
export type FinalidadeGoogle = "FREQUENCIA" | "SAIDAS" | "PARCIAL";

function configuracao() {
  const { clientId, clientSecret, redirectUri, pickerApiKey, projectNumber } = ambiente.google;
  if (!clientId || !clientSecret || !redirectUri || !pickerApiKey || !projectNumber) {
    throw new ErroHttp("A conexão Google ainda não foi configurada no servidor.", 503);
  }
  return { clientId, clientSecret, redirectUri, pickerApiKey, projectNumber };
}

function chave(finalidade: string): Buffer {
  return createHash("sha256").update(`${finalidade}:${ambiente.authSecret}`).digest();
}

function assinar(valor: string): string {
  return createHmac("sha256", chave("oauth-estado")).update(valor).digest("base64url");
}

/** Estado de curta duração, vinculado ao administrador e ao verificador PKCE. */
export function iniciarAutorizacao(
  adminId: string,
  finalidade: FinalidadeGoogle = "FREQUENCIA",
): { url: string; cookie: string } {
  const { clientId, redirectUri } = configuracao();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const dados = Buffer.from(
    JSON.stringify({
      adminId,
      finalidade,
      state,
      verifier,
      expiraEm: Date.now() + DURACAO_ESTADO_MS,
    }),
  ).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ESCOPO);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), cookie: `${dados}.${assinar(dados)}` };
}

export function conferirEstado(
  cookie: string | undefined,
  state: string,
  adminId: string,
): { verifier: string; finalidade: FinalidadeGoogle } {
  if (!cookie) throw new ErroHttp("A conexão Google expirou. Comece de novo.", 400);
  const [dados, assinatura] = cookie.split(".");
  if (!dados || !assinatura) throw new ErroHttp("A conexão Google expirou. Comece de novo.", 400);
  const recebida = Buffer.from(assinatura);
  const esperada = Buffer.from(assinar(dados));
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
    throw new ErroHttp("A conexão Google não pôde ser confirmada.", 400);
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new ErroHttp("A conexão Google não pôde ser confirmada.", 400);
  }
  const conteudo = z
    .object({
      adminId: z.string().uuid(),
      finalidade: z.enum(["FREQUENCIA", "SAIDAS", "PARCIAL"]),
      state: z.string(),
      verifier: z.string(),
      expiraEm: z.number(),
    })
    .safeParse(bruto);
  if (
    !conteudo.success ||
    conteudo.data.adminId !== adminId ||
    conteudo.data.state !== state ||
    conteudo.data.expiraEm < Date.now()
  ) {
    throw new ErroHttp("A conexão Google expirou. Comece de novo.", 400);
  }
  return { verifier: conteudo.data.verifier, finalidade: conteudo.data.finalidade };
}

/** Cifra o token persistente. Alterar AUTH_SECRET exige reconectar a conta. */
export function cifrarToken(valor: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave("oauth-token"), iv);
  const texto = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), texto].map((item) => item.toString("base64url")).join(".");
}

export function decifrarToken(valor: string): string {
  try {
    const partes = valor.split(".").map((item) => Buffer.from(item, "base64url"));
    const [iv, tag, texto] = partes;
    if (!iv || !tag || !texto || iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", chave("oauth-token"), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(texto), decipher.final()]).toString("utf8");
  } catch {
    throw new ErroHttp("A conexão Google precisa ser refeita.", 409);
  }
}

const respostaToken = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
});

async function pedirToken(corpo: URLSearchParams) {
  let resposta: Response;
  try {
    resposta = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ErroHttp("Não foi possível falar com o Google agora.", 502);
  }
  if (!resposta.ok) {
    throw new ErroHttp("O Google recusou a autorização. Conecte a conta novamente.", 401);
  }
  const dados = respostaToken.safeParse(await resposta.json());
  if (!dados.success) throw new ErroHttp("O Google respondeu em formato inesperado.", 502);
  return dados.data;
}

export async function trocarCodigo(codigo: string, verifier: string) {
  const { clientId, clientSecret, redirectUri } = configuracao();
  const dados = await pedirToken(
    new URLSearchParams({
      code: codigo,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      grant_type: "authorization_code",
    }),
  );
  if (!dados.refresh_token) {
    throw new ErroHttp("O Google não autorizou acesso contínuo. Conecte a conta novamente.", 400);
  }
  return dados.refresh_token;
}

export async function renovarAcesso(tokenCifrado: string): Promise<string> {
  const { clientId, clientSecret } = configuracao();
  const dados = await pedirToken(
    new URLSearchParams({
      refresh_token: decifrarToken(tokenCifrado),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  );
  return dados.access_token;
}

export function dadosDoPicker() {
  const { clientId, pickerApiKey, projectNumber } = configuracao();
  return { clientId, pickerApiKey, projectNumber };
}
