// Sessões opacas: token aleatório em cookie HttpOnly, guardado só como hash
// SHA-256 e assinado por AUTH_SECRET. Conta desativada cai na hora.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { banco } from "@/infra/banco";
import type { Identidade } from "@/domain/usuarios";

export const NOME_COOKIE = "frequenciapp_sessao";
const DIAS_DE_VALIDADE = 30;

interface SessaoAtiva {
  id: string;
  usuario: Identidade;
}

/** Assinatura HMAC-SHA256 truncada: 128 bits bastam para o cookie. */
function assinaturaDe(token: string, segredo: string): string {
  return createHmac("sha256", segredo).update(token).digest("hex").slice(0, 32);
}

function valorAssinado(token: string, segredo: string): string {
  return `${token}.${assinaturaDe(token, segredo)}`;
}

function conferirValor(valor: string, segredo: string): string | null {
  const [token, assinatura] = valor.split(".");
  if (!token || !assinatura) return null;
  const esperada = assinaturaDe(token, segredo);
  const recebida = Buffer.from(assinatura, "utf8");
  const calculada = Buffer.from(esperada, "utf8");
  if (recebida.length !== calculada.length) return null;
  return timingSafeEqual(recebida, calculada) ? token : null;
}

function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria uma sessão nova e grava o cookie HttpOnly. */
export async function criarSessao(
  usuarioId: string,
  segredo: string,
  ehProducao: boolean,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + DIAS_DE_VALIDADE * 24 * 60 * 60 * 1000);
  await banco().sessao.create({ data: { tokenHash: hashDoToken(token), usuarioId, expiraEm } });
  const armazem = await cookies();
  armazem.set(NOME_COOKIE, valorAssinado(token, segredo), {
    httpOnly: true,
    sameSite: "lax",
    secure: ehProducao,
    path: "/",
    expires: expiraEm,
  });
}

/** Resolve a sessão ativa a partir do cookie, ou null. */
export async function sessaoAtual(segredo: string): Promise<SessaoAtiva | null> {
  const armazem = await cookies();
  const valor = armazem.get(NOME_COOKIE)?.value;
  if (!valor) return null;
  const token = conferirValor(valor, segredo);
  if (!token) return null;
  const registro = await banco().sessao.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: {
      id: true,
      expiraEm: true,
      usuario: { select: { id: true, nome: true, email: true, papel: true, ativo: true } },
    },
  });
  if (!registro) return null;
  if (registro.expiraEm.getTime() < Date.now() || !registro.usuario.ativo) {
    await banco()
      .sessao.delete({ where: { id: registro.id } })
      .catch(() => undefined);
    return null;
  }
  const { id, nome, email, papel, ativo } = registro.usuario;
  return { id: registro.id, usuario: { id, nome, email, papel, ativo } };
}

/** Encerra a sessão corrente e limpa o cookie. */
export async function encerrarSessao(segredo: string, ehProducao: boolean): Promise<void> {
  const armazem = await cookies();
  const valor = armazem.get(NOME_COOKIE)?.value;
  if (valor) {
    const token = conferirValor(valor, segredo);
    if (token) {
      await banco()
        .sessao.delete({ where: { tokenHash: hashDoToken(token) } })
        .catch(() => undefined);
    }
  }
  armazem.set(NOME_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: ehProducao,
    path: "/",
    maxAge: 0,
  });
}

/** Encerra todas as sessões do usuário, menos a corrente. */
export async function encerrarOutrasSessoes(segredo: string, usuarioId: string): Promise<void> {
  const armazem = await cookies();
  const valor = armazem.get(NOME_COOKIE)?.value;
  const token = valor ? conferirValor(valor, segredo) : null;
  const hashAtual = token ? hashDoToken(token) : null;
  const ativas = await banco().sessao.findMany({
    where: { usuarioId },
    select: { id: true, tokenHash: true },
  });
  const remover = ativas.filter((sessao) => sessao.tokenHash !== hashAtual);
  if (remover.length > 0) {
    await banco().sessao.deleteMany({ where: { id: { in: remover.map((s) => s.id) } } });
  }
}
