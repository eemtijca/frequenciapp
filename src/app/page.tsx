import { identidadeAtual } from "@/application/sessao";
import { alunosVisiveis } from "@/application/alunos";
import { escopoDeTurmas } from "@/application/turmas";
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
  const [escopo, series, alunos, frequencias] = await Promise.all([
    escopoDeTurmas(usuario),
    listarSeries(),
    alunosVisiveis(usuario),
    listarFrequenciasDoMes(usuario.id, mes),
  ]);
  return (
    <Aplicacao
      usuario={usuario}
      diaCorrente={dia}
      seriesIniciais={series}
      turmasIniciais={escopo.turmas}
      origensIniciais={escopo.origens}
      alunosIniciais={alunos}
      frequenciasIniciais={frequencias}
    />
  );
}
