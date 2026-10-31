"use client";

// Tipos de aviso oferecidos pela escola e horários de envio no rascunho,
// com as escolhas pessoais preservadas em cada conta.
import { Bell, ClipboardCheck, Clock, HelpCircle, ListChecks, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  NOTIFICACOES_PADRAO,
  type ConfiguracaoNotificacoes,
  type TipoDeAviso,
} from "@/domain/notificacoes";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { Selo } from "@/components/ui/selo";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";

const CAMPOS = [
  {
    tipo: "resumoDiario",
    titulo: "Resumo diário",
    rotulo: "Resumo diário para diretores",
    destinatarios: "Diretores",
    icone: ListChecks,
  },
  {
    tipo: "novasChamadas",
    titulo: "Novas chamadas",
    rotulo: "Novas chamadas para diretores",
    destinatarios: "Diretores",
    icone: ClipboardCheck,
  },
  {
    tipo: "chamadasPendentes",
    titulo: "Chamadas pendentes",
    rotulo: "Chamadas pendentes para a coordenação",
    destinatarios: "Coordenação e Gestão",
    icone: TriangleAlert,
  },
] as const satisfies readonly {
  tipo: TipoDeAviso;
  titulo: string;
  rotulo: string;
  destinatarios: string;
  icone: typeof Bell;
}[];

export default function SecaoNotificacoes({
  configuracao,
  onMudar,
}: {
  configuracao: ConfiguracaoNotificacoes;
  onMudar: (configuracao: ConfiguracaoNotificacoes) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ativos = CAMPOS.filter(({ tipo }) => configuracao[tipo]).length;
  return (
    <SecaoRecolhivel
      titulo="Notificações"
      icone={Bell}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="notificacoes"
      resumo={
        <Selo>
          {ativos} {ativos === 1 ? "aviso ativo" : "avisos ativos"}
        </Selo>
      }
    >
      <div className="grid gap-3">
        {CAMPOS.map(({ tipo, titulo, rotulo, destinatarios, icone: Icone }) => (
          <div key={tipo} className="flex min-w-0 flex-col gap-3 rounded-xl border p-3">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-2xl">
                <Icone size={18} aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor={`aviso-${tipo}`}>{titulo}</Label>
                <p className="text-muted-foreground text-xs">{destinatarios}</p>
              </div>
              <Switch
                id={`aviso-${tipo}`}
                aria-label={rotulo}
                checked={configuracao[tipo]}
                onCheckedChange={(valor) => onMudar({ ...configuracao, [tipo]: valor })}
              />
            </div>
            {tipo === "resumoDiario" && (
              <div className="grid items-center gap-2 border-t pt-3 sm:grid-cols-[1fr_auto]">
                <Label htmlFor="horario-resumo-notificacoes" className="flex items-center gap-2">
                  <Clock size={16} aria-hidden="true" /> Horário do resumo diário
                </Label>
                <SeletorHorario
                  id="horario-resumo-notificacoes"
                  valor={configuracao.horarioResumo ?? NOTIFICACOES_PADRAO.horarioResumo}
                  rotuloAcessivel="Horário do resumo diário"
                  disabled={!configuracao.resumoDiario}
                  onValor={(valor) => onMudar({ ...configuracao, horarioResumo: valor })}
                />
              </div>
            )}
            {tipo === "chamadasPendentes" && (
              <div className="grid items-center gap-2 border-t pt-3 sm:grid-cols-[1fr_auto]">
                <Label
                  htmlFor="horario-pendencias-notificacoes"
                  className="flex items-center gap-2"
                >
                  <Clock size={16} aria-hidden="true" /> Horário do aviso de pendências
                </Label>
                <SeletorHorario
                  id="horario-pendencias-notificacoes"
                  valor={configuracao.horarioPendencias}
                  rotuloAcessivel="Horário do aviso de pendências"
                  disabled={!configuracao.chamadasPendentes}
                  onValor={(valor) => onMudar({ ...configuracao, horarioPendencias: valor })}
                />
              </div>
            )}
          </div>
        ))}
        <details className="text-muted-foreground text-xs">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
            <HelpCircle size={16} aria-hidden="true" /> Sobre os avisos
          </summary>
          <div className="flex flex-col gap-2 pt-2">
            <p>Resumo diário nos dias com chamada salva.</p>
            <p>Pendências diárias para turmas com aula prevista e alunos ativos.</p>
            <p>Horários da escola. Ativação na conta, por dispositivo.</p>
          </div>
        </details>
      </div>
    </SecaoRecolhivel>
  );
}
