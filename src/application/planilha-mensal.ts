// Prepara o destino mensal da frequência e preserva vínculos já salvos de outras turmas.
import { z } from "zod";
import { createHmac } from "node:crypto";
import { ambiente } from "@/infra/ambiente";
import { diasDoMes } from "@/domain/frequencia";
import { ErroHttp } from "@/infra/erros";
import { auditar } from "@/infra/auditoria";
import { comTransacao } from "@/infra/transacoes";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { comPausasDeLeituraGoogle } from "@/infra/google-planilhas-limites";
import { comTravaPlanilhaFrequencia } from "@/infra/trava-planilha-frequencia";
import { mesValido, type AbaMensalPlanilha } from "@/domain/planilha-mensal";
import { hashTexto } from "@/domain/planilha";
import { listarTodasTurmas } from "./turmas";
import { listarTodosAlunos } from "./alunos";
import { listarFeriados } from "./calendario-letivo";
import { chamarIntegracao, idDaIntegracao, lerLinha } from "./planilha-comum";
import { detectarAba, esquemaSalvo, sabadosComChamadaSalva, type EsquemaSalvo } from "./planilha";

const entradaMensal = z.object({
  turmaOriginalId: z.string().uuid(),
  mes: z.string().refine(mesValido, "Mês inválido."),
});

/** Uma turma por requisição; a confirmação da Gestão percorre todas em sequência. */
export async function prepararMesDaFrequencia(admin: { id: string }, entrada: unknown) {
  const dados = entradaMensal.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe uma turma e um mês válidos.", 400);
  if (!(await limiteDeTentativas(`planilha:mensal:${admin.id}`, 60))) {
    throw new ErroHttp("Muitos preparos em sequência. Aguarde alguns minutos.", 429);
  }
  return comTravaPlanilhaFrequencia(() =>
    comPausasDeLeituraGoogle(async () => {
      const linha = await lerLinha("FREQUENCIA");
      const [turmas, alunos] = await Promise.all([listarTodasTurmas(), listarTodosAlunos()]);
      const turma = turmas.find((item) => item.id === dados.data.turmaOriginalId);
      if (!turma) throw new ErroHttp("Turma de origem não encontrada.", 404);
      const dias = diasDoMes(dados.data.mes);
      const sabadosLetivos = await sabadosComChamadaSalva(
        turma.id,
        dias[0] ?? `${dados.data.mes}-01`,
        dias.at(-1) ?? `${dados.data.mes}-01`,
      );
      const feriados = (await listarFeriados(Number(dados.data.mes.slice(0, 4))))
        .map((feriado) => feriado.dia)
        .filter((dia) => dia.startsWith(`${dados.data.mes}-`));
      const preparada = await chamarIntegracao<
        AbaMensalPlanilha & { criada: boolean; atualizada: boolean }
      >(linha, {
        acao: "prepararMes",
        turmaOriginalId: turma.id,
        rotulo: turma.rotulo,
        mes: dados.data.mes,
        sabadosLetivos,
        feriados,
        alunos: alunos
          .filter((aluno) => aluno.ativo && aluno.turmaOriginalId === turma.id)
          .map((aluno) => ({
            alunoId: aluno.id,
            nome: aluno.desistenteEm ? "DESISTENTE" : aluno.nome,
            turmaAtual: turmas.find((atual) => atual.id === aluno.turmaId)?.rotulo ?? "",
          })),
      });
      const aba = await detectarAba(linha, preparada.aba);
      if (aba.mensal?.destino !== preparada.destino) {
        throw new ErroHttp("Não foi possível conferir a identificação da aba mensal.", 409);
      }
      // O efeito no Google fica fora da transação. Apenas o vínculo local pode
      // repetir após conflito, sempre combinando com o esquema mais recente.
      await comTransacao(async (tx) => {
        const atual = await tx.integracaoPlanilha.findUnique({
          where: { id: idDaIntegracao("FREQUENCIA") },
        });
        if (
          !atual ||
          atual.googlePlanilhaId !== linha.googlePlanilhaId ||
          atual.googleRefreshToken !== linha.googleRefreshToken
        ) {
          throw new ErroHttp(
            "A conexão mudou durante o preparo. Confira a aba antes de continuar.",
            409,
          );
        }
        const anterior = esquemaSalvo(atual);
        const mapa = (anterior?.mapa ?? []).filter(
          (item) =>
            item.aba !== preparada.aba &&
            !(item.turmaOriginalId === turma.id && item.mes === preparada.mes),
        );
        mapa.push({
          aba: preparada.aba,
          turmaOriginalId: turma.id,
          mes: preparada.mes,
          destino: preparada.destino,
        });
        const abas = (anterior?.abas ?? []).filter(
          (item) => item.nome !== aba.nome && item.mensal?.destino !== preparada.destino,
        );
        abas.push(aba);
        const esquema: EsquemaSalvo = {
          planilha: anterior?.planilha ?? {
            nome: linha.googlePlanilhaNome ?? "Planilha de frequência",
            url: `https://docs.google.com/spreadsheets/d/${linha.googlePlanilhaId}/edit`,
            fuso: ambiente.fuso,
          },
          mapa,
          abas,
          atualizadoEm: new Date().toISOString(),
        };
        await tx.integracaoPlanilha.update({
          where: { id: atual.id },
          data: {
            esquema: esquema as unknown as object,
            assinaturaEsquema: hashTexto(JSON.stringify(abas.map((item) => item.assinatura))),
            esquemaEm: new Date(),
            atualizadoPorId: admin.id,
          },
        });
        await auditar(
          tx,
          admin.id,
          "planilha.preparar_mes",
          `turma:${turma.id}:mes:${preparada.mes}`,
        );
      });
      return preparada;
    }),
  );
}

/** Revela o histórico mensal sem esconder as outras datas já preparadas. */
export async function mostrarMesDaFrequencia(admin: { id: string }, entrada: unknown) {
  const dados = z
    .object({ mes: z.string().refine(mesValido) })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe um mês válido.", 400);
  if (!(await limiteDeTentativas(`planilha:mostrar_mes:${admin.id}`, 60)))
    throw new ErroHttp("Muitas alterações em sequência. Aguarde alguns minutos.", 429);
  return comTravaPlanilhaFrequencia(() =>
    comPausasDeLeituraGoogle(async () => {
      const linha = await lerLinha("FREQUENCIA");
      const resultado = await chamarIntegracao<{
        mes: string;
        visiveis: string[];
        ocultadas: string[];
      }>(linha, {
        acao: "mostrarMes",
        mes: dados.data.mes,
        legadas: (esquemaSalvo(linha)?.mapa ?? []).filter((aba) => !aba.mes),
      });
      await comTransacao(async (tx) => {
        await auditar(tx, admin.id, "planilha.mostrar_mes", `mes:${dados.data.mes}`);
      });
      return resultado;
    }),
  );
}

/** Catálogo leve com links diretos; abrir o seletor não escreve na planilha. */
export async function listarMesesDaFrequencia() {
  const linha = await lerLinha("FREQUENCIA");
  const resultado = await chamarIntegracao<{ abas: (AbaMensalPlanilha & { oculta: boolean })[] }>(
    linha,
    { acao: "abasMensais" },
  );
  return {
    abas: resultado.abas
      .sort(
        (a, b) =>
          b.mes.localeCompare(a.mes) || a.aba.localeCompare(b.aba, "pt-BR", { numeric: true }),
      )
      .map((aba) => ({
        ...aba,
        url: `https://docs.google.com/spreadsheets/d/${linha.googlePlanilhaId}/edit#gid=${aba.destino.split(":")[1]}`,
      })),
    legadas: (esquemaSalvo(linha)?.mapa ?? []).filter((aba) => !aba.mes),
  };
}

/** Prévia assinada por aba e conexão; a confirmação relê antes de copiar e excluir. */
export async function organizarAbaAntiga(admin: { id: string }, entrada: unknown) {
  const dados = z
    .object({ aba: z.string().min(1).max(200), planoHash: z.string().length(64).optional() })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Escolha uma aba antiga e confira a prévia.", 400);
  if (!(await limiteDeTentativas(`planilha:antigas:${admin.id}`, 60)))
    throw new ErroHttp("Muitas conferências em sequência. Aguarde alguns minutos.", 429);
  return comTravaPlanilhaFrequencia(() =>
    comPausasDeLeituraGoogle(async () => {
      const linha = await lerLinha("FREQUENCIA");
      const esquema = esquemaSalvo(linha);
      const vinculo = esquema?.mapa.find((aba) => aba.aba === dados.data.aba && !aba.mes);
      if (!vinculo) throw new ErroHttp("Escolha uma aba antiga vinculada à turma na Gestão.", 409);
      const previa = await chamarIntegracao<{
        aba: string;
        impressao: string;
        preenchidas: number;
        conferidas: number;
        destinos: { mes: string; aba: string }[];
        removida: boolean;
      }>(linha, {
        acao: "preverAbaAntiga",
        aba: vinculo.aba,
        turmaOriginalId: vinculo.turmaOriginalId,
      });
      const planoHash = createHmac("sha256", ambiente.authSecret)
        .update(
          JSON.stringify([
            admin.id,
            linha.googlePlanilhaId,
            linha.googleRefreshToken,
            vinculo,
            previa.impressao,
          ]),
        )
        .digest("hex");
      if (!dados.data.planoHash) return { previa: { ...previa, planoHash } };
      if (dados.data.planoHash !== planoHash)
        throw new ErroHttp("A planilha ou a conexão mudou. Confira uma nova prévia.", 409);
      await chamarIntegracao(linha, {
        acao: "moverAbaAntiga",
        aba: vinculo.aba,
        turmaOriginalId: vinculo.turmaOriginalId,
        impressao: previa.impressao,
      });
      await comTransacao(async (tx) => {
        const atual = await tx.integracaoPlanilha.findUnique({
          where: { id: idDaIntegracao("FREQUENCIA") },
        });
        const salvo = atual && esquemaSalvo(atual);
        if (
          !atual ||
          !salvo ||
          atual.googlePlanilhaId !== linha.googlePlanilhaId ||
          atual.googleRefreshToken !== linha.googleRefreshToken
        )
          throw new ErroHttp(
            "A conexão mudou. Confira a planilha e atualize a estrutura na Gestão.",
            409,
          );
        const abas = salvo.abas.filter((aba) => aba.nome !== vinculo.aba);
        await tx.integracaoPlanilha.update({
          where: { id: atual.id },
          data: {
            esquema: {
              ...salvo,
              abas,
              mapa: salvo.mapa.filter((aba) => aba.aba !== vinculo.aba),
              atualizadoEm: new Date().toISOString(),
            } as unknown as object,
            assinaturaEsquema: hashTexto(JSON.stringify(abas.map((aba) => aba.assinatura))),
            esquemaEm: new Date(),
            atualizadoPorId: admin.id,
          },
        });
        await auditar(tx, admin.id, "planilha.organizar_aba_antiga", `aba:${vinculo.aba}`);
      });
      return { removida: true, aba: vinculo.aba };
    }),
  );
}
