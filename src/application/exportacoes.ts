// Exportações: confirmação de senha na cópia completa e registro mínimo
// de preparação, sem nomes, conteúdos ou senha do ZIP na auditoria.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ErroHttp } from "@/infra/erros";
import { temCapacidade, type Identidade } from "@/domain/usuarios";
import { conferirSenhaDoAdmin } from "@/application/confirmacao-admin";
import { exportarCopia } from "@/application/backup";

const esquemaExportacaoCopia = z.object({ senha: z.string().min(1).max(200) }).strict();
const esquemaRegistro = z
  .object({
    tipo: z.enum(["grade", "relacao", "relatorio"]),
    formato: z.enum(["original", "zip"]),
    retrato: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "Retrato inválido.")
      .optional(),
  })
  .strict()
  .superRefine((dados, contexto) => {
    if (dados.tipo === "relatorio" && !dados.retrato) {
      contexto.addIssue({
        code: "custom",
        path: ["retrato"],
        message: "Informe o retrato do relatório.",
      });
    }
    if (dados.tipo !== "relatorio" && dados.retrato) {
      contexto.addIssue({
        code: "custom",
        path: ["retrato"],
        message: "O retrato vale apenas para o relatório.",
      });
    }
  });

export async function exportarCopiaConfirmada(admin: Identidade, entrada: unknown) {
  const dados = esquemaExportacaoCopia.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a senha atual do administrador.", 400);
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, "backup:exportar");
  return exportarCopia(admin);
}

export async function registrarPreparacaoDownload(usuario: Identidade, entrada: unknown) {
  const dados = esquemaRegistro.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira o tipo de exportação.", 400);
  if (dados.data.tipo === "relacao" && !temCapacidade(usuario.papel, "administrar")) {
    throw new ErroHttp("Apenas a administração pode exportar a relação de alunos.", 403);
  }
  await banco().auditoria.create({
    data: {
      usuarioId: usuario.id,
      acao: "download.preparar",
      alvo:
        dados.data.tipo === "relatorio"
          ? `${dados.data.tipo}:${dados.data.formato}:${dados.data.retrato}`
          : `${dados.data.tipo}:${dados.data.formato}`,
    },
  });
}
