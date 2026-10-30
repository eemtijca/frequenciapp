"use client";

// Limites percentuais do card de Infrequência do Painel, no rascunho da Gestão.
import { useState } from "react";
import { CheckCircle2, CircleAlert, HelpCircle, Percent, TriangleAlert } from "lucide-react";
import type { Configuracoes } from "@/domain/frequencia";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selo } from "@/components/ui/selo";

interface Props {
  configuracoes: Configuracoes;
  onMudar: (entrada: Partial<Configuracoes>) => void;
}

function inteiroValido(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const valor = Number(texto);
  return valor >= 0 && valor <= 100 ? valor : null;
}

export default function SecaoInfrequencia({ configuracoes, onMudar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [atencaoTexto, setAtencaoTexto] = useState(
    String(configuracoes.infrequenciaAtencaoPercentual),
  );
  const [criticaTexto, setCriticaTexto] = useState(
    String(configuracoes.infrequenciaCriticaPercentual),
  );
  const [erro, setErro] = useState("");
  const [base, setBase] = useState([
    configuracoes.infrequenciaAtencaoPercentual,
    configuracoes.infrequenciaCriticaPercentual,
  ]);

  if (
    base[0] !== configuracoes.infrequenciaAtencaoPercentual ||
    base[1] !== configuracoes.infrequenciaCriticaPercentual
  ) {
    setBase([
      configuracoes.infrequenciaAtencaoPercentual,
      configuracoes.infrequenciaCriticaPercentual,
    ]);
    setAtencaoTexto(String(configuracoes.infrequenciaAtencaoPercentual));
    setCriticaTexto(String(configuracoes.infrequenciaCriticaPercentual));
  }

  function aplicar(proximoAtencao: string, proximaCritica: string) {
    const valorAtencao = inteiroValido(proximoAtencao);
    const valorCritica = inteiroValido(proximaCritica);
    if (valorAtencao === null || valorCritica === null) {
      setErro("Informe números inteiros de 0 a 100.");
      return;
    }
    if (valorAtencao >= valorCritica) {
      setErro("O limite de atenção deve ser menor que o limite crítico.");
      return;
    }
    setErro("");
    onMudar({
      infrequenciaAtencaoPercentual: valorAtencao,
      infrequenciaCriticaPercentual: valorCritica,
    });
  }

  return (
    <SecaoRecolhivel
      dataSecao="config-infrequencia"
      titulo="Infrequência do Painel"
      icone={Percent}
      aberto={aberto}
      onAbertoChange={setAberto}
      resumo={
        <>
          <Selo>Esperado até {configuracoes.infrequenciaAtencaoPercentual}%</Selo>
          <Selo>Atenção até {configuracoes.infrequenciaCriticaPercentual}%</Selo>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="infrequencia-atencao">Dentro do esperado até</Label>
          <div className="relative">
            <Input
              id="infrequencia-atencao"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={atencaoTexto}
              onChange={(evento) => {
                setAtencaoTexto(evento.target.value);
                aplicar(evento.target.value, criticaTexto);
              }}
              className="h-11 pr-8"
            />
            <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
              %
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="infrequencia-critica">Atenção até</Label>
          <div className="relative">
            <Input
              id="infrequencia-critica"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={criticaTexto}
              onChange={(evento) => {
                setCriticaTexto(evento.target.value);
                aplicar(atencaoTexto, evento.target.value);
              }}
              className="h-11 pr-8"
            />
            <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
              %
            </span>
          </div>
        </div>
      </div>
      {erro && (
        <p role="alert" className="text-falta-texto text-sm">
          {erro}
        </p>
      )}
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="bg-primary/10 text-primary rounded-xl border px-3 py-2">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={16} aria-hidden="true" /> Dentro do esperado
          </p>
          <p>até {configuracoes.infrequenciaAtencaoPercentual}%</p>
        </div>
        <div className="bg-alerta-fraca text-alerta-texto rounded-xl border px-3 py-2">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert size={16} aria-hidden="true" /> Atenção
          </p>
          <p>
            acima de {configuracoes.infrequenciaAtencaoPercentual}% até{" "}
            {configuracoes.infrequenciaCriticaPercentual}%
          </p>
        </div>
        <div className="bg-falta-fraca text-falta-texto rounded-xl border px-3 py-2">
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert size={16} aria-hidden="true" /> Acima do limite
          </p>
          <p>acima de {configuracoes.infrequenciaCriticaPercentual}%</p>
        </div>
      </div>
      <details className="text-muted-foreground text-xs">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
          <HelpCircle size={16} aria-hidden="true" /> Como ler as faixas
        </summary>
        <p className="mt-1 leading-relaxed">
          Os percentuais representam faltas nos dias de segunda a sábado. O primeiro limite deve ser
          menor que o segundo.
        </p>
      </details>
    </SecaoRecolhivel>
  );
}
