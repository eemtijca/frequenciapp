// Página autenticada: carrega o escopo e encaminha o retorno da conexão Google.
import { headers } from "next/headers";
import { sessaoParaInterface } from "@/application/sessao";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarSeries } from "@/application/series";
import { listarFrequenciasDoMes, resumoAcumulado } from "@/application/frequencias";
import { listarSaidas } from "@/application/saidas";
import { listarJustificativas } from "@/application/justificativas";
import { listarLiberadores } from "@/application/liberadores";
import { lerConfiguracoes } from "@/application/configuracoes";
import { ambiente } from "@/infra/ambiente";
import { urlDoIndiceDeAgentes } from "@/infra/documentacao";
import { diaLocal, diasDoMes } from "@/domain/frequencia";
import { temCapacidade } from "@/domain/usuarios";
import { DestinoSessao } from "@/components/entrada/transicao-sessao";
import TelaLogin from "@/components/entrada/tela-login";
import Aplicacao from "@/components/aplicacao";
import AplicacaoDiretor from "@/components/diretor/aplicacao-diretor";
import { contextoDoDiretor } from "@/application/diretor-visao";

export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{
    visao?: string;
    google?: string;
    googleFinalidade?: string;
    aba?: string;
  }>;
}) {
  const sessao = await sessaoParaInterface(ambiente.authSecret);
  const urlIndiceAgentes = urlDoIndiceDeAgentes(await headers());
  const entrada = (
    <DestinoSessao>
      <TelaLogin urlIndiceAgentes={urlIndiceAgentes} />
    </DestinoSessao>
  );
  if (!sessao) return entrada;
  const { usuario, referenciaSessao } = sessao;
  // Recusa por padrão: o aplicativo abre para quem opera a escola ou, reduzido ao Painel e aos
  // relatórios de leitura, para quem só consulta (Secretaria). O diretor de turma tem a própria
  // tela, só de leitura, e qualquer outro papel volta à entrada.
  const operaAEscola = temCapacidade(usuario.papel, "operar");
  const soConsulta = !operaAEscola && temCapacidade(usuario.papel, "consultar");
  if (!operaAEscola && !soConsulta) {
    if (temCapacidade(usuario.papel, "verEstatisticasDasTurmas")) {
      return (
        <DestinoSessao usuarioId={usuario.id} referenciaSessao={referenciaSessao}>
          <AplicacaoDiretor
            usuario={usuario}
            contexto={await contextoDoDiretor(usuario.id)}
            fuso={ambiente.fuso}
          />
        </DestinoSessao>
      );
    }
    return entrada;
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
    // Quem libera saídas é dado de operação: o modo consulta não o recebe.
    soConsulta
      ? Promise.resolve([] as Awaited<ReturnType<typeof listarLiberadores>>)
      : listarLiberadores(),
    lerConfiguracoes(),
    resumoAcumulado(dia),
  ]);
  const carregadoEm = new Date().toISOString();
  return (
    <DestinoSessao usuarioId={usuario.id} referenciaSessao={referenciaSessao}>
      <Aplicacao
        usuario={usuario}
        carregadoEm={carregadoEm}
        diaCorrente={dia}
        fuso={ambiente.fuso}
        visaoInicial={parametros.visao}
        abaMovimentacaoInicial={parametros.aba === "entradas" ? "entradas" : "saidas"}
        abaGestaoInicial={parametros.google ? "configuracoes" : undefined}
        planilhaInicial={
          parametros.google
            ? parametros.googleFinalidade === "SAIDAS" || parametros.googleFinalidade === "PARCIAL"
              ? parametros.googleFinalidade
              : "FREQUENCIA"
            : undefined
        }
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
    </DestinoSessao>
  );
}
