// Confere a configuração e os cabeçalhos do mês, sem gravar nem reparar a planilha.
import { z } from "zod";
import { esquemaSalvo, lerIntegracaoAdmin } from "@/application/planilha";
import { lerLinha, modoCompletoAtivo } from "@/application/planilha-comum";
import { listarTodasTurmas } from "@/application/turmas";
import { assinarAba, detectarEsquema, type AbaEsquema } from "@/domain/planilha";
import {
  resumirDiagnostico,
  vinculosDoMes,
  type DiagnosticoPlanilha,
  type TurmaDiagnosticoPlanilha,
  type VinculoDiagnosticoPlanilha,
} from "@/domain/planilha-diagnostico";
import { mesValido } from "@/domain/planilha-mensal";
import { ErroHttp } from "@/infra/erros";
import { renovarAcesso } from "@/infra/google-oauth";
import {
  lerBlocosGoogle,
  lerDocumentoGoogle,
  mensalDaAbaGoogle,
  mesclagensDaAba,
  mesclagensDaAssinatura,
  type DocumentoGoogle,
} from "@/infra/google-planilhas-api";
import { comPausasDeLeituraGoogle } from "@/infra/google-planilhas-limites";

const esquemaMes = z.string().refine(mesValido, "Informe um mês válido.");
const LIMITE_COLUNAS = 400;
const LIMITE_LINHAS_CABECALHO = 12;

function mensagemSegura(erro: unknown): string {
  return erro instanceof ErroHttp ? erro.message : "Não foi possível conferir a planilha agora.";
}

async function conferirDestino(
  id: string,
  acesso: string,
  documento: DocumentoGoogle,
  vinculo: VinculoDiagnosticoPlanilha,
  salvo: AbaEsquema | undefined,
): Promise<Pick<TurmaDiagnosticoPlanilha, "situacao" | "mensagem">> {
  const aba = documento.sheets.find((item) => item.properties.title === vinculo.aba);
  if (!aba)
    return { situacao: "sem_aba", mensagem: "A aba vinculada não foi encontrada na planilha." };
  if (!salvo)
    return { situacao: "estrutura_alterada", mensagem: "Confira e salve a estrutura desta aba." };
  if (salvo.abaId !== undefined && salvo.abaId !== aba.properties.sheetId)
    return {
      situacao: "bloqueada",
      mensagem: "A aba foi substituída. Confira o vínculo antes de enviar.",
    };
  const mensal = mensalDaAbaGoogle(documento, aba);
  if (
    (vinculo.mes &&
      (!mensal ||
        mensal.mes !== vinculo.mes ||
        mensal.turmaOriginalId !== vinculo.turmaOriginalId ||
        mensal.destino !== vinculo.destino)) ||
    (!vinculo.mes && mensal)
  )
    return {
      situacao: "bloqueada",
      mensagem: "A identificação da turma ou do mês mudou. Confira o vínculo da aba.",
    };
  const largura = aba.properties.gridProperties?.columnCount ?? salvo.totalColunas;
  if (
    salvo.cabecalho < 1 ||
    salvo.cabecalho > LIMITE_LINHAS_CABECALHO ||
    salvo.colunas.length > LIMITE_COLUNAS ||
    largura > LIMITE_COLUNAS
  )
    return {
      situacao: "bloqueada",
      mensagem: "A estrutura excede o limite da conferência. Revise esta aba antes de enviar.",
    };
  const [bloco] = await lerBlocosGoogle(id, acesso, vinculo.aba, salvo.cabecalho, [
    { coluna: 1, colunas: Math.max(1, largura, salvo.colunas.length) },
  ]);
  const lida = bloco?.valores[salvo.cabecalho - 1] ?? [];
  const ultimaPreenchida = lida.findLastIndex((valor) => valor.trim() !== "") + 1;
  // O esquema salvo pode conter colunas vazias usadas apenas abaixo do cabeçalho.
  const cabecalho = lida.slice(0, Math.max(salvo.colunas.length, ultimaPreenchida));
  const valores = Array.from({ length: salvo.cabecalho }, (_, indice) =>
    indice === salvo.cabecalho - 1 ? cabecalho : [],
  );
  const estrutura = detectarEsquema(
    { nome: vinculo.aba, valores, mesclagens: mesclagensDaAba(aba) },
    Number(vinculo.mes?.slice(0, 4) ?? new Date().getFullYear()),
  );
  if (estrutura.bloqueio) return { situacao: "bloqueada", mensagem: estrutura.bloqueio };
  if (
    vinculo.mes &&
    estrutura.colunas.some((coluna) => coluna.data && !coluna.data.startsWith(vinculo.mes ?? ""))
  )
    return { situacao: "bloqueada", mensagem: "A aba mensal contém datas de outro mês." };
  if (assinarAba(vinculo.aba, cabecalho, mesclagensDaAssinatura(aba)) !== salvo.assinatura)
    return {
      situacao: "estrutura_alterada",
      mensagem: "O cabeçalho mudou. Confira a estrutura antes do próximo envio.",
    };
  return { situacao: "pronta", mensagem: null };
}

/** Somente leituras Google; funciona com a integração pausada e não habilita envios. */
export async function diagnosticarPlanilha(entradaMes: unknown): Promise<DiagnosticoPlanilha> {
  const entrada = esquemaMes.safeParse(entradaMes);
  if (!entrada.success) throw new ErroHttp("Informe um mês válido.", 400);
  const mes = entrada.data;
  const [linha, admin, turmas] = await Promise.all([
    lerLinha("FREQUENCIA"),
    lerIntegracaoAdmin(),
    listarTodasTurmas(),
  ]);
  const salvo = esquemaSalvo(linha);
  const conectada = Boolean(linha.googleRefreshToken && linha.googlePlanilhaId);
  const resultados: TurmaDiagnosticoPlanilha[] = turmas.map((turma) => {
    const vinculos = vinculosDoMes(salvo?.mapa ?? [], turma.id, mes);
    const vinculo = vinculos[0];
    return {
      id: turma.id,
      rotulo: turma.rotulo,
      tipo: vinculo ? (vinculo.mes ? "mensal" : "legado") : "ausente",
      aba: vinculo?.aba ?? null,
      situacao: vinculos.length > 1 ? "bloqueada" : vinculo ? "indisponivel" : "sem_aba",
      mensagem:
        vinculos.length > 1
          ? "Há mais de uma aba vinculada à turma neste período. Revise o mapa."
          : vinculo
            ? "Aguardando conferência da conexão."
            : "Prepare o mês ou vincule uma aba para esta turma.",
    };
  });
  let verificada = false;
  let erroConexao: string | null = conectada ? null : "Conecte o Google e escolha a planilha.";
  if (linha.googleRefreshToken && linha.googlePlanilhaId) {
    const id = linha.googlePlanilhaId;
    const token = linha.googleRefreshToken;
    await comPausasDeLeituraGoogle(async () => {
      try {
        const acesso = await renovarAcesso(token);
        const documento = await lerDocumentoGoogle(id, acesso);
        verificada = true;
        for (const turma of resultados) {
          if (!turma.aba || turma.situacao === "bloqueada") continue;
          const vinculo = vinculosDoMes(salvo?.mapa ?? [], turma.id, mes)[0];
          if (!vinculo) continue;
          try {
            Object.assign(
              turma,
              await conferirDestino(
                id,
                acesso,
                documento,
                vinculo,
                salvo?.abas.find((aba) => aba.nome === vinculo.aba),
              ),
            );
          } catch (erro) {
            turma.situacao = "indisponivel";
            turma.mensagem = mensagemSegura(erro);
          }
        }
      } catch (erro) {
        erroConexao = mensagemSegura(erro);
      }
    });
  }
  const atual = await lerLinha("FREQUENCIA");
  if (
    atual.googlePlanilhaId !== linha.googlePlanilhaId ||
    atual.googleRefreshToken !== linha.googleRefreshToken ||
    JSON.stringify(atual.esquema) !== JSON.stringify(linha.esquema)
  )
    throw new ErroHttp("A configuração mudou durante a conferência. Confira novamente.", 409);
  const resumo = resumirDiagnostico(resultados);
  return {
    mes,
    conferidoEm: new Date().toISOString(),
    conexao: { conectada, verificada, erro: erroConexao },
    ativa: atual.ativa,
    modo: modoCompletoAtivo(atual) ? "completo" : "conservador",
    envioAutomatico: atual.envioAutomatico,
    estruturaPronta: verificada && resumo.total > 0 && resumo.prontas === resumo.total,
    resumo,
    turmas: resultados,
    alteradasDepois: admin.alteradasDepois,
    ultimoErro: admin.ultimoErro,
  };
}
