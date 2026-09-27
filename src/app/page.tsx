import { identidadeAtual } from "@/application/sessao";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarSeries } from "@/application/series";
import { listarFrequenciasDoMes, resumoAcumulado } from "@/application/frequencias";
import { listarSaidas } from "@/application/saidas";
import { listarJustificativas } from "@/application/justificativas";
import { listarLiberadores } from "@/application/liberadores";
import { lerConfiguracoes } from "@/application/configuracoes";
import { ambiente } from "@/infra/ambiente";
import { diaLocal, diasDoMes } from "@/domain/frequencia";
import { temCapacidade } from "@/domain/usuarios";
import TelaLogin from "@/components/auth/tela-login";
import Aplicacao from "@/components/aplicacao";

export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string }>;
}) {
  const usuario = await identidadeAtual(ambiente.authSecret);
  // Recusa por padrão: o aplicativo completo só abre para quem opera a
  // escola. Nenhum papel atual cai aqui; um papel só de leitura terá tela própria.
  if (!usuario || !temCapacidade(usuario.papel, "operar")) {
    return <TelaLogin />;
  }
  const parametros = await searchParams;
  const dia = diaLocal(new Date(), ambiente.fuso);
  const mes = dia.slice(0, 7);
  const dias = diasDoMes(mes);
  const [
    turmas,
    series,
    alunos,
    frequencias,
    saidas,
    justificativas,
    liberadores,
    configuracoes,
    resumo,
  ] = await Promise.all([
    listarTodasTurmas(),
    listarSeries(),
    listarTodosAlunos(),
    listarFrequenciasDoMes(mes),
    listarSaidas({ de: dias[0] ?? `${mes}-01`, ate: dias[dias.length - 1] ?? `${mes}-28` }),
    listarJustificativas(),
    listarLiberadores(),
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
      justificativasIniciais={justificativas}
      liberadoresIniciais={liberadores}
      configuracoesIniciais={configuracoes}
      resumoInicial={resumo}
    />
  );
}
