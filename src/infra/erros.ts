// Tradução de erros para português claro. Nenhum stack trace, código
// interno ou termo técnico chega ao usuário: cada falha conhecida vira
// uma mensagem curta e acionável, com status adequado.
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/client";

/** Erro com mensagem amigável e status HTTP, controlado pela aplicação. */
export class ErroHttp extends Error {
  status: number;

  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroHttp";
    this.status = status;
  }
}

/** Traduções de campos para mensagens de duplicidade. */
const NOMES_DE_CAMPO: Record<string, string> = {
  email: "e-mail",
  nome: "nome",
  usuarios_email_unico: "e-mail",
  series_nome_unico: "série",
  turmas_serie_id_nome_key: "turma",
  turmas_serie_nome_unico: "turma",
  sessoes_token_hash_key: "sessão",
  frequencias_professor_id_turma_id_dia_key: "frequencia",
  atribuicoes_pkey: "atribuição",
};

function nomeAmigavel(alvos: string[] | undefined): string {
  for (const alvo of alvos ?? []) {
    const nome = NOMES_DE_CAMPO[alvo];
    if (nome) return nome;
  }
  return "registro";
}

/** Traduções de tabelas para mensagens de registro em uso (P2003). */
const TABELAS_EM_USO: Record<string, string> = {
  turmas_turma_id_fkey: "Esta turma ainda tem alunos ou frequencias registradas.",
  turmas_serie_id_fkey: "A série informada não existe mais.",
  alunos_turma_id_fkey: "A turma informada não existe mais.",
  alunos_turma_original_id_fkey: "A turma de origem informada não existe mais.",
  frequencias_professor_id_fkey: "Este professor tem frequencias registradas.",
  frequencias_turma_id_fkey: "Esta turma tem frequencias registradas.",
  series_id_fkey: "Esta série ainda tem turmas.",
  faltas_frequencia_id_fkey: "A frequencia não existe mais.",
  faltas_aluno_id_fkey: "O aluno não existe mais.",
  sessoes_usuario_id_fkey: "A conta não existe mais.",
  atribuicoes_professor_id_fkey: "O professor não existe mais.",
  atribuicoes_turma_id_fkey: "A turma não existe mais.",
};

interface ErroConhecido {
  code: string;
  meta?: Record<string, unknown>;
}

function traduzirConhecido(erro: ErroConhecido): { mensagem: string; status: number } | null {
  switch (erro.code) {
    case "P2002": {
      const alvos = Array.isArray(erro.meta?.target)
        ? (erro.meta?.target as string[])
        : typeof erro.meta?.target === "string"
          ? [erro.meta.target as string]
          : undefined;
      const campo = nomeAmigavel(alvos);
      return {
        mensagem:
          campo === "frequencia"
            ? "Esta frequencia já foi salva. Recarregue para ver a versão mais recente."
            : campo === "registro"
              ? "Já existe um registro igual. Confira os dados e tente de novo."
              : `Já existe um registro com este ${campo}. Use outro valor.`,
        status: 409,
      };
    }
    case "P2003": {
      const chave = typeof erro.meta?.field_name === "string" ? erro.meta.field_name : "";
      const mensagem = TABELAS_EM_USO[chave];
      if (mensagem) return { mensagem, status: 409 };
      return {
        mensagem: "Este registro está em uso por outros dados e não pode ser removido agora.",
        status: 409,
      };
    }
    case "P2025":
      return {
        mensagem: "Registro não encontrado. Talvez tenha sido removido por outra pessoa.",
        status: 404,
      };
    case "P2021":
      return {
        mensagem: "O banco de dados está incompleto. Contate o suporte técnico.",
        status: 503,
      };
    case "P2024":
      return {
        mensagem: "O banco está ocupado neste momento. Aguarde alguns segundos e tente de novo.",
        status: 503,
      };
    case "P2034":
      return {
        mensagem: "Outra pessoa salvou os mesmos dados agora. Tente novamente.",
        status: 409,
      };
    default:
      return null;
  }
}

/**
 * Converte qualquer exceção em mensagem amigável e status HTTP.
 * Erros desconhecidos viram mensagem genérica: detalhes ficam no log
 * do servidor, nunca na resposta.
 */
export function traduzirErro(erro: unknown): { mensagem: string; status: number } {
  if (erro instanceof ErroHttp) return { mensagem: erro.message, status: erro.status };

  if (erro instanceof PrismaClientKnownRequestError) {
    const traduzido = traduzirConhecido({
      code: erro.code,
      meta: erro.meta as Record<string, unknown> | undefined,
    });
    if (traduzido) return traduzido;
  }

  if (erro instanceof PrismaClientValidationError) {
    return { mensagem: "Os dados enviados não estão no formato esperado.", status: 400 };
  }
  if (
    erro instanceof PrismaClientInitializationError ||
    erro instanceof PrismaClientUnknownRequestError ||
    erro instanceof PrismaClientRustPanicError
  ) {
    console.error("[banco] falha de conexão:", erro);
    return {
      mensagem: "Não foi possível falar com o banco de dados. Tente novamente em instantes.",
      status: 503,
    };
  }
  if (erro instanceof Error && erro.message.includes("ECONNREFUSED")) {
    console.error("[banco] conexão recusada:", erro.message);
    return {
      mensagem: "Não foi possível falar com o banco de dados. Tente novamente em instantes.",
      status: 503,
    };
  }
  if (erro instanceof AggregateError) {
    console.error("[banco] falha agregada:", erro);
    return {
      mensagem: "Não foi possível falar com o banco de dados. Tente novamente em instantes.",
      status: 503,
    };
  }

  console.error("[erro inesperado]:", erro);
  return {
    mensagem: "Algo inesperado aconteceu. Tente novamente; se persistir, avise o suporte.",
    status: 500,
  };
}

/** Verdadeiro quando o erro é o conflito de serialização (P2034). */
export function ehConflitoDeSerializacao(erro: unknown): boolean {
  return erro instanceof PrismaClientKnownRequestError && erro.code === "P2034";
}

/** Verdadeiro quando o erro é duplicidade de índice único (P2002). */
export function ehDuplicidade(erro: unknown): boolean {
  return erro instanceof PrismaClientKnownRequestError && erro.code === "P2002";
}
