import { identidadeAtual } from "@/application/sessao";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarSeries } from "@/application/series";
import { listarFrequenciasDoMes, resumoAcumulado } from "@/application/frequencias";
import { listarSaidas } from "@/application/saidas";
import { listarResponsaveis } from "@/application/usuarios";
import { lerConfiguracoes } from "@/application/configuracoes";
import { ambiente } from "@/infra/ambiente";
import { diaLocal, diasDoMes } from "@/domain/frequencia";
import TelaLogin from "@/components/auth/tela-login";
import Aplicacao from "@/components/aplicacao";

export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string }>;
}) {
  const usuario = await identidadeAtual(ambiente.authSecret);
  if (!usuario) {
    return <TelaLogin />;
  }
  const parametros = await searchParams;
  const dia = diaLocal(new Date(), ambiente.fuso);
  const mes = dia.slice(0, 7);
  const dias = diasDoMes(mes);
  const [turmas, series, alunos, frequencias, saidas, responsaveis, configuracoes, resumo] =
    await Promise.all([
      listarTodasTurmas(),
      listarSeries(),
      listarTodosAlunos(),
      listarFrequenciasDoMes(mes),
      listarSaidas({ de: dias[0] ?? `${mes}-01`, ate: dias[dias.length - 1] ?? `${mes}-28` }),
      listarResponsaveis(),
      lerConfiguracoes(),
      resumoAcumulado(dia),
    ]);
  return (
    <Aplicacao
      usuario={usuario}
      diaCorrente={dia}
      fuso={ambiente.fuso}
      visaoInicial={parametros.visao}
      seriesIniciais={series}
      turmasIniciais={turmas}
      alunosIniciais={alunos}
      frequenciasIniciais={frequencias}
      saidasIniciais={saidas}
      responsaveisIniciais={responsaveis}
      configuracoesIniciais={configuracoes}
      resumoInicial={resumo}
    />
  );
}
