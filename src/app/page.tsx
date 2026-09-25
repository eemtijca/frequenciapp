import { identidadeAtual } from "@/application/sessao";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarSeries } from "@/application/series";
import { listarFrequenciasDoMes } from "@/application/frequencias";
import { ambiente } from "@/infra/ambiente";
import { diaLocal } from "@/domain/frequencia";
import TelaLogin from "@/components/auth/tela-login";
import Aplicacao from "@/components/aplicacao";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const usuario = await identidadeAtual(ambiente.authSecret);
  if (!usuario) {
    return <TelaLogin />;
  }
  const dia = diaLocal(new Date(), ambiente.fuso);
  const mes = dia.slice(0, 7);
  const [turmas, series, alunos, frequencias] = await Promise.all([
    listarTodasTurmas(),
    listarSeries(),
    listarTodosAlunos(),
    listarFrequenciasDoMes(mes),
  ]);
  return (
    <Aplicacao
      usuario={usuario}
      diaCorrente={dia}
      fuso={ambiente.fuso}
      seriesIniciais={series}
      turmasIniciais={turmas}
      alunosIniciais={alunos}
      frequenciasIniciais={frequencias}
    />
  );
}
