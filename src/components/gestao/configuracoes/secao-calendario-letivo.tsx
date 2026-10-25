"use client";

// Calendário anual de feriados no rascunho das configurações, com
// sincronização externa imediata e remoção confirmada.
import { useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { ehAnoLetivoValido, type Feriado } from "@/domain/calendario-letivo";
import { ehDiaValido, rotuloData } from "@/domain/frequencia";
import { avisarSucesso } from "@/lib/avisos";
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
import ControleSincronizarFeriados from "@/components/gestao/configuracoes/controle-sincronizar-feriados";
import { Selo } from "@/components/ui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { SeletorAno } from "@/components/ui/seletor-ano";
import { AvisoCompacto } from "@/components/ui/tela-estado";

interface Props {
  feriados: Feriado[];
  diaCorrente: string;
  onAdicionar: (feriado: Feriado) => void;
  onRemover: (dia: string) => void;
  onSincronizar: () => Promise<void>;
}

export default function SecaoCalendarioLetivo({
  feriados,
  diaCorrente,
  onAdicionar,
  onRemover,
  onSincronizar,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(diaCorrente.slice(0, 4));
  const [dia, setDia] = useState(diaCorrente);
  const [nome, setNome] = useState("");
  const [paraRemover, setParaRemover] = useState<Feriado | null>(null);
  const [erro, setErro] = useState("");
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
      setErro("Informe uma data entre 1900 e 2199.");
      return;
    }
    setErro("");
    setDia(proximo);
    setAno(proximo.slice(0, 4));
  }

  function adicionar() {
    setErro("");
    if (!anoValido || !ehDiaValido(dia) || !nome.trim()) {
      setErro("Confira o ano, a data e o nome do feriado.");
      return;
    }
    if (feriados.some((feriado) => feriado.dia === dia)) {
      setErro("Já existe um feriado nesta data. Remova o atual para trocar o nome.");
      return;
    }
    onAdicionar({ dia, nome: nome.trim() });
    setNome("");
    avisarSucesso("Feriado adicionado ao rascunho.", "Salve as configurações para aplicar.");
  }

  function remover() {
    if (!paraRemover) return;
    onRemover(paraRemover.dia);
    setParaRemover(null);
    setErro("");
    avisarSucesso("Feriado removido do rascunho.", "Salve as configurações para aplicar.");
  }

  const bloqueado = sincronizando;
  const revisaoFeriados = feriadosDoAno.map((feriado) => feriado.dia).join("|");

  return (
    <SecaoRecolhivel
      titulo="Calendário letivo"
      descricao="Feriados e recessos que suspendem a chamada."
      icone={CalendarDays}
      aberto={aberto}
      onAbertoChange={setAberto}
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
        <span className="text-sm font-medium">Ano do calendário</span>
        <SeletorAno
          id="calendario-letivo-ano"
          valor={ano}
          min={1900}
          max={2199}
          disabled={bloqueado}
          rotuloAcessivel="Ano do calendário"
          onValor={mudarAno}
        />
      </div>
      <ControleSincronizarFeriados
        ano={ano}
        anoValido={anoValido}
        revisao={revisaoFeriados}
        desabilitado={bloqueado}
        onExecutandoChange={setSincronizando}
        onAtualizar={onSincronizar}
      />
      <form
        className="flex flex-col gap-3"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!bloqueado) adicionar();
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
          Adicionar feriado
        </Button>
      </form>
      {erro && <AvisoCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />}
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
          if (!valor) setParaRemover(null);
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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remover}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SecaoRecolhivel>
  );
}
