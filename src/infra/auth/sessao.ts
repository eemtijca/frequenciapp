// Sessões opacas: token aleatório em cookie HttpOnly, guardado no
// banco apenas como hash SHA-256. O segredo AUTH_SECRET assina o
// cookie para impedir forja do valor trafegado. A identidade inclui o
// papel e a conta precisa seguir ativa: desativar um professor derruba
// a sessão na próxima requisição.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { banco } from "@/infra/banco";
import type { Identidade } from "@/domain/usuarios";

export const NOME_COOKIE = "frequenciapp_sessao";
const DIAS_DE_VALIDADE = 30;

interface SessaoAtiva {
  id: string;
  usuario: Identidade;
}

function valorAssinado(token: string, segredo: string): string {
  const assinatura = createHash("sha256").update(`${token}.${segredo}`).digest("hex").slice(0, 32);
  return `${token}.${assinatura}`;
}

function conferirValor(valor: string, segredo: string): string | null {
  const [token, assinatura] = valor.split(".");
  if (!token || !assinatura) return null;
  const esperada = createHash("sha256").update(`${token}.${segredo}`).digest("hex").slice(0, 32);
  return assinatura === esperada ? token : null;
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

/** Purga sessões vencidas. Frequência pontual pelo operador. */
export async function purgarSessoesVencidas(): Promise<number> {
  const resultado = await banco().sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } });
  return resultado.count;
}
