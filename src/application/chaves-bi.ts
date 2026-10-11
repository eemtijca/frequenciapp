// Ciclo de vida das chaves: senha administrativa, segredo único e auditoria transacional.
import { hashChaveBi, novaChaveBi } from "@/infra/chave-bi";
export { hashChaveBi, novaChaveBi } from "@/infra/chave-bi";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { ErroHttp } from "@/infra/erros";
import { conferirSenhaDoAdmin } from "@/application/confirmacao-admin";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { ipDoPedido } from "@/infra/http";
import { esquemaAcaoChaveBi, esquemaEscopoBi, estadoChaveBi, type ChaveBi } from "@/domain/bi";
import type { ChaveBi as RegistroChaveBi } from "../../generated/prisma/client";

function paraChave(chave: RegistroChaveBi): ChaveBi {
  return {
    id: chave.id,
    rotulo: chave.rotulo,
    criadaEm: chave.criadaEm.toISOString(),
    expiraEm: chave.expiraEm?.toISOString() ?? null,
    revogadaEm: chave.revogadaEm?.toISOString() ?? null,
    primeiroUsoEm: chave.primeiroUsoEm?.toISOString() ?? null,
    ultimoUsoEm: chave.ultimoUsoEm?.toISOString() ?? null,
    usos: chave.usos,
    escopo: esquemaEscopoBi.parse(chave.escopo),
    estado: estadoChaveBi(chave),
    inativa: Date.now() - (chave.ultimoUsoEm ?? chave.criadaEm).getTime() > 90 * 86400000,
  };
}
export async function listarChavesBi(): Promise<ChaveBi[]> {
  return (await banco().chaveBi.findMany({ orderBy: { criadaEm: "desc" }, take: 1000 })).map(
    paraChave,
  );
}
export async function administrarChaveBi(admin: { id: string }, entrada: unknown) {
  const analise = esquemaAcaoChaveBi.safeParse(entrada);
  if (!analise.success)
    throw new ErroHttp("Confira a ação, o rótulo, o período e o escopo da chave.", 400);
  const dados = analise.data;
  if (
    (dados.acao === "criar" || dados.acao === "editar") &&
    dados.expiraEm &&
    new Date(dados.expiraEm) <= new Date()
  )
    throw new ErroHttp("A validade precisa ser uma data futura.", 400);
  await conferirSenhaDoAdmin(admin.id, dados.senha, "bi-administracao");
  const nova = dados.acao === "criar" || dados.acao === "rotacionar" ? novaChaveBi() : null;
  return comTransacao(async (tx) => {
    const agora = new Date();
    let chave: RegistroChaveBi | null = null;
    let quantidade = 1;
    if (dados.acao === "criar" && nova) {
      chave = await tx.chaveBi.create({
        data: {
          rotulo: dados.rotulo,
          escopo: dados.escopo,
          expiraEm: dados.expiraEm,
          segredoHash: nova.segredoHash,
        },
      });
    } else if (dados.acao === "revogar-todas") {
      quantidade = (
        await tx.chaveBi.updateMany({ where: { revogadaEm: null }, data: { revogadaEm: agora } })
      ).count;
    } else if (dados.acao === "limpar") {
      quantidade = (
        await tx.chaveBi.deleteMany({
          where: { OR: [{ revogadaEm: { not: null } }, { expiraEm: { lte: agora } }] },
        })
      ).count;
    } else if ("id" in dados) {
      const anterior = await tx.chaveBi.findUnique({ where: { id: dados.id } });
      if (!anterior) throw new ErroHttp("Chave não encontrada.", 404);
      if (estadoChaveBi(anterior, agora) !== "ativa")
        throw new ErroHttp("Esta chave não está ativa. Crie outra chave.", 409);
      if (dados.acao === "editar") {
        chave = await tx.chaveBi.update({
          where: { id: anterior.id },
          data: { rotulo: dados.rotulo, escopo: dados.escopo, expiraEm: dados.expiraEm },
        });
      } else {
        await tx.chaveBi.update({ where: { id: anterior.id }, data: { revogadaEm: agora } });
        if (dados.acao === "rotacionar" && nova)
          chave = await tx.chaveBi.create({
            data: {
              rotulo: anterior.rotulo,
              escopo: esquemaEscopoBi.parse(anterior.escopo),
              expiraEm: anterior.expiraEm,
              segredoHash: nova.segredoHash,
            },
          });
      }
    }
    await tx.auditoria.create({
      data: {
        usuarioId: admin.id,
        acao: `bi.chave.${dados.acao}`,
        alvo: "id" in dados ? dados.id : (chave?.id ?? `quantidade:${quantidade}`),
      },
    });
    return {
      chave: chave ? paraChave(chave) : null,
      quantidade,
      ...(nova ? { segredo: nova.segredo } : {}),
    };
  });
}

/** Porta independente: sessão, query string e cabeçalhos alternativos não autorizam a leitura. */
export async function exigirChaveBi(requisicao: Request): Promise<string> {
  const ip = hashChaveBi(ipDoPedido(requisicao));
  if (!(await limiteDeTentativas(`bi-origem:${ip}`, 600, 60000)))
    throw new ErroHttp("Muitas consultas. Aguarde um minuto.", 429);
  const cabecalho = requisicao.headers.get("authorization") ?? "";
  const segredo = /^Bearer (fbi_[A-Za-z0-9_-]{43})$/.exec(cabecalho)?.[1];
  if (!segredo) {
    await recusarChaveBi(ip);
  }
  // A conferência do registro e do escopo ocorre na mesma transação da leitura.
  return hashChaveBi(segredo ?? "");
}
export async function recusarChaveBi(ipHash: string): Promise<never> {
  if (!(await limiteDeTentativas(`bi-invalida:${ipHash}`, 30)))
    throw new ErroHttp("Muitas tentativas. Aguarde alguns minutos.", 429);
  throw new ErroHttp("Chave ausente, inválida ou indisponível. Solicite outra à Gestão.", 401);
}
