// Quem pode ler ou gravar uma prova específica: operação, consulta ou diretor com aluno da prova.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";
import { vinculoVigente } from "@/domain/diretores";
import { diaLocal } from "@/domain/frequencia";
import { temCapacidade, type Identidade } from "@/domain/usuarios";
import { listarProvasEspecificas } from "@/application/provas-especificas";
import type { ProvaEspecifica } from "@/domain/provas-especificas";

function diaDe(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function exigirId(id: string): void {
  if (!z.uuid().safeParse(id).success) throw new ErroHttp("Prova não encontrada.", 404);
}

async function exigirDiretorLiberado(usuarioId: string): Promise<void> {
  const credencial = await banco().credencialDiretor.findUnique({
    where: { usuarioId },
    select: { trocaObrigatoria: true },
  });
  if (credencial?.trocaObrigatoria !== false) {
    throw new ErroHttp("Troque a palavra-chave para acompanhar a prova.", 403);
  }
}

/** Turmas vigentes do diretor no dia de hoje, no fuso da escola. */
export async function turmasVigentesDoDiretor(usuarioId: string): Promise<string[]> {
  const hoje = diaLocal(new Date(), ambiente.fuso);
  const vinculos = await banco().vinculoDiretor.findMany({
    where: { usuarioId },
    select: { turmaId: true, inicio: true, fim: true },
  });
  return vinculos
    .filter((vinculo) =>
      vinculoVigente(
        { inicio: diaDe(vinculo.inicio), fim: vinculo.fim ? diaDe(vinculo.fim) : null },
        hoje,
      ),
    )
    .map((vinculo) => vinculo.turmaId);
}

async function diretorTemAlunoNaProva(usuarioId: string, id: string): Promise<boolean> {
  const turmas = await turmasVigentesDoDiretor(usuarioId);
  if (turmas.length === 0) return false;
  const prova = await banco().provaEspecifica.findFirst({
    where: { id, participantes: { some: { aluno: { turmaId: { in: turmas } } } } },
    select: { id: true },
  });
  return prova !== null;
}

/**
 * Leitura: administração, coordenação, secretaria e diretor com aluno da prova.
 * Gravação: administração, coordenação e esse diretor. A secretaria fica na leitura.
 */
export async function exigirAcessoAProva(
  usuario: Identidade,
  id: string,
  nivel: "ler" | "gravar",
): Promise<void> {
  exigirId(id);
  if (usuario.papel === "DIRETOR_TURMA") {
    await exigirDiretorLiberado(usuario.id);
    if (!(await diretorTemAlunoNaProva(usuario.id, id))) {
      throw new ErroHttp("Prova não encontrada.", 404);
    }
    return;
  }
  const podeLer =
    temCapacidade(usuario.papel, "operar") || temCapacidade(usuario.papel, "consultar");
  const podeGravar = temCapacidade(usuario.papel, "operar");
  if (nivel === "gravar" ? !podeGravar : !podeLer) {
    throw new ErroHttp(
      nivel === "gravar"
        ? "Seu acesso não permite esta operação."
        : "Seu acesso não permite consultar estes dados.",
      403,
    );
  }
  const prova = await banco().provaEspecifica.findUnique({ where: { id }, select: { id: true } });
  if (!prova) throw new ErroHttp("Prova não encontrada.", 404);
}

/** Lista completa para quem opera ou consulta; o diretor vê só provas com aluno das turmas vigentes. */
export async function listarProvasVisiveis(usuario: Identidade): Promise<ProvaEspecifica[]> {
  await exigirQuemConsultaRota(usuario);
  if (usuario.papel === "DIRETOR_TURMA") {
    return listarProvasEspecificas(await turmasVigentesDoDiretor(usuario.id));
  }
  return listarProvasEspecificas();
}

/** Busca de endereço e lista: quem opera, quem consulta ou o diretor já liberado. */
export async function exigirQuemConsultaRota(usuario: Identidade): Promise<void> {
  if (temCapacidade(usuario.papel, "operar") || temCapacidade(usuario.papel, "consultar")) return;
  if (usuario.papel === "DIRETOR_TURMA") {
    await exigirDiretorLiberado(usuario.id);
    return;
  }
  throw new ErroHttp("Seu acesso não permite consultar estes dados.", 403);
}
