"use client";

// Calendário anual de feriados, com sincronização, remoção confirmada e releitura.
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ehAnoLetivoValido, type Feriado } from "@/domain/calendario-letivo";
import { ehDiaValido, rotuloData } from "@/domain/frequencia";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import ControleSincronizarFeriados from "@/components/gestao/controle-sincronizar-feriados";
import { Selo } from "@/components/ui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";

interface Props {
  feriados: Feriado[];
  diaCorrente: string;
  onAtualizar: () => Promise<void>;
}

export default function SecaoCalendarioLetivo({ feriados, diaCorrente, onAtualizar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(diaCorrente.slice(0, 4));
  const [dia, setDia] = useState(diaCorrente);
  const [nome, setNome] = useState("");
  const [paraRemover, setParaRemover] = useState<Feriado | null>(null);
  const [erro, setErro] = useState("");
  const [varianteErro, setVarianteErro] = useState<VarianteEstado>("dados_invalidos");
  const [precisaAtualizar, setPrecisaAtualizar] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const anoValido = /^\d{4}$/.test(ano) && ehAnoLetivoValido(Number(ano));
  const feriadosDoAno = anoValido
    ? feriados
        .filter((feriado) => feriado.dia.startsWith(`${ano}-`))
        .sort((a, b) => a.dia.localeCompare(b.dia))
    : [];

  function mudarAno(proximo: string) {
    setAno(proximo);
    if (!/^\d{4}$/.test(proximo) || !ehAnoLetivoValido(Number(proximo))) return;
    const mesmaData = `${proximo}-${dia.slice(5)}`;
    setDia(ehDiaValido(mesmaData) ? mesmaData : `${proximo}-02-28`);
  }

  function escolherDia(proximo: string) {
    if (!ehDiaValido(proximo) || !ehAnoLetivoValido(Number(proximo.slice(0, 4)))) {
      setVarianteErro("dados_invalidos");
      setErro("Informe uma data entre 1900 e 2199.");
      return;
    }
    setDia(proximo);
    setAno(proximo.slice(0, 4));
  }

  const { executando, executar } = useAcaoUnica(async () => {
    setErro("");
    if (precisaAtualizar) {
      try {
        await onAtualizar();
        setPrecisaAtualizar(false);
      } catch (excecao) {
        setVarianteErro("indisponivel");
        setErro("Não foi possível atualizar o calendário. Tente novamente.");
        avisarErro(excecao, { contexto: "Não foi possível atualizar o calendário." });
      }
      return;
    }

    const removendo = paraRemover !== null;
    if (!removendo && (!anoValido || !ehDiaValido(dia) || !nome.trim())) {
      setVarianteErro("dados_invalidos");
      setErro("Confira o ano, a data e o nome do feriado.");
      return;
    }
    try {
      if (paraRemover) {
        await pedir<{ ok: boolean }>(
          `/api/calendario-letivo/${paraRemover.dia}`,
          corpoAlteracao("DELETE"),
        );
        setParaRemover(null);
      } else {
        await pedir<{ feriado: Feriado }>(
          "/api/calendario-letivo",
          corpoJson({ dia, nome: nome.trim() }),
        );
        setNome("");
      }
    } catch (excecao) {
      const contexto = removendo
        ? "Não foi possível remover o feriado."
        : "Não foi possível salvar o feriado.";
      setVarianteErro(
        excecao instanceof ErroApi && excecao.status < 500 ? "dados_invalidos" : "indisponivel",
      );
      setErro(excecao instanceof ErroApi ? excecao.message : contexto);
      avisarErro(excecao, { contexto });
      return;
    }

    try {
      await onAtualizar();
      avisarSucesso(removendo ? "Feriado removido." : "Feriado salvo.");
    } catch {
      // A alteração foi confirmada. Repetir esta ação deve consultar, sem gravar de novo.
      const mensagem = removendo
        ? "Feriado removido. Atualize o calendário para conferir."
        : "Feriado salvo. Atualize o calendário para conferir.";
      setPrecisaAtualizar(true);
      setVarianteErro("indisponivel");
      setErro(mensagem);
      avisarInfo(mensagem);
    }
  });
  const bloqueado = executando || precisaAtualizar || sincronizando;
  const revisaoFeriados = feriadosDoAno.map((feriado) => feriado.dia).join("|");

  return (
    <SecaoRecolhivel
      titulo="Calendário letivo"
      icone={CalendarDays}
      aberto={aberto}
      onAbertoChange={(valor) => {
        if (!bloqueado) setAberto(valor);
      }}
      dataSecao="config-calendario"
      resumo={
        <Selo>
          {anoValido
            ? `${ano} · ${feriadosDoAno.length} ${feriadosDoAno.length === 1 ? "feriado" : "feriados"}`
            : "Selecione o ano"}
        </Selo>
      }
    >
      <p className="text-muted-foreground text-sm">Feriados valem para todas as turmas.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="calendario-letivo-ano">Ano do calendário</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Ano anterior"
            disabled={bloqueado || !anoValido || Number(ano) <= 1900}
            onClick={() => mudarAno(String(Number(ano) - 1))}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
          <Input
            id="calendario-letivo-ano"
            type="number"
            inputMode="numeric"
            min={1900}
            max={2199}
            step={1}
            value={ano}
            disabled={bloqueado}
            onChange={(evento) => mudarAno(evento.target.value)}
            className="numerais-tabulares text-center"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Ano seguinte"
            disabled={bloqueado || !anoValido || Number(ano) >= 2199}
            onClick={() => mudarAno(String(Number(ano) + 1))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <ControleSincronizarFeriados
        ano={ano}
        anoValido={anoValido}
        revisao={revisaoFeriados}
        desabilitado={bloqueado}
        onExecutandoChange={setSincronizando}
        onAtualizar={onAtualizar}
      />
      <form
        className="flex flex-col gap-3"
        aria-busy={executando}
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!bloqueado) void executar();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="calendario-feriado-data">Data do feriado</Label>
          <SeletorPeriodo
            id="calendario-feriado-data"
            modo="dia"
            valor={dia}
            max="2199-12-31"
            mostrarSelo={false}
            rotuloAcessivel="Data do feriado"
            rotulo={rotuloData(dia)}
            disabled={bloqueado || !anoValido}
            onValor={escolherDia}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="calendario-feriado-nome">Nome do feriado</Label>
          <Input
            id="calendario-feriado-nome"
            value={nome}
            maxLength={120}
            required
            disabled={bloqueado}
            onChange={(evento) => setNome(evento.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={bloqueado || !anoValido || !nome.trim()}
          className="self-start"
        >
          {executando && !paraRemover ? (
            <LoaderCircle
              size={16}
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : null}
          Adicionar feriado
        </Button>
      </form>
      {erro && (
        <AvisoCompacto
          variante={varianteErro}
          titulo={precisaAtualizar ? "Atualização pendente" : "Confira o calendário"}
          descricao={erro}
          tamanho="linha"
        />
      )}
      {precisaAtualizar && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={executando}
          onClick={() => void executar()}
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={executando ? "animate-spin motion-reduce:animate-none" : ""}
          />
          Recarregar calendário
        </Button>
      )}
      {anoValido &&
        (feriadosDoAno.length ? (
          <ul
            aria-label={`Feriados de ${ano}`}
            className="flex flex-col divide-y rounded-2xl border"
          >
            {feriadosDoAno.map((feriado) => (
              <li key={feriado.dia} className="flex items-center gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium break-words">{feriado.nome}</span>
                  <time
                    dateTime={feriado.dia}
                    className="numerais-tabulares text-muted-foreground text-xs"
                  >
                    {rotuloData(feriado.dia)}
                  </time>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover feriado ${feriado.nome}`}
                  disabled={bloqueado}
                  onClick={() => {
                    setErro("");
                    setParaRemover(feriado);
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nenhum feriado em {ano}.</p>
        ))}
      <AlertDialog
        open={paraRemover !== null}
        onOpenChange={(valor) => {
          if (!valor && !executando) setParaRemover(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover feriado?</AlertDialogTitle>
            <AlertDialogDescription>
              {paraRemover ? `${paraRemover.nome} (${rotuloData(paraRemover.dia)}). ` : ""}A data
              voltará a seguir a grade semanal. As frequências salvas serão preservadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {erro && (
            <AvisoCompacto
              variante={varianteErro}
              titulo="Confira o calendário"
              descricao={erro}
              tamanho="linha"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={executando}
              onClick={(evento) => {
                evento.preventDefault();
                void executar();
              }}
            >
              {executando && (
                <LoaderCircle
                  size={16}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SecaoRecolhivel>
  );
}
