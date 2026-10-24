"use client";

// Tipos de aviso oferecidos pela escola e horários de envio no rascunho,
// com as escolhas pessoais preservadas em cada conta.
import { Bell } from "lucide-react";
import { useState } from "react";
import {
  NOTIFICACOES_PADRAO,
  type ConfiguracaoNotificacoes,
  type TipoDeAviso,
} from "@/domain/notificacoes";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";

const CAMPOS: { tipo: TipoDeAviso; rotulo: string; descricao?: string }[] = [
  {
    tipo: "resumoDiario",
    rotulo: "Resumo diário para diretores",
    descricao: "Nos dias com chamada salva.",
  },
  {
    tipo: "novasChamadas",
    rotulo: "Novas chamadas para diretores",
  },
  {
    tipo: "chamadasPendentes",
    rotulo: "Chamadas pendentes para a coordenação",
    descricao:
      "Diariamente, para turmas com aula prevista e alunos ativos. A Gestão também recebe.",
  },
];

export default function SecaoNotificacoes({
  configuracao,
  onMudar,
}: {
  configuracao: ConfiguracaoNotificacoes;
  onMudar: (configuracao: ConfiguracaoNotificacoes) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <SecaoRecolhivel
      titulo="Notificações"
      descricao="Avisos automáticos enviados à equipe."
      icone={Bell}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="notificacoes"
    >
      <div className="flex flex-col gap-5">
        {CAMPOS.map(({ tipo, rotulo, descricao }) => (
          <div key={tipo} className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor={`aviso-${tipo}`}>{rotulo}</Label>
              {descricao && <p className="text-muted-foreground text-sm">{descricao}</p>}
            </div>
            <Switch
              id={`aviso-${tipo}`}
              checked={configuracao[tipo]}
              onCheckedChange={(valor) => onMudar({ ...configuracao, [tipo]: valor })}
            />
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="horario-resumo-notificacoes">Horário do resumo diário</Label>
            <SeletorHorario
              id="horario-resumo-notificacoes"
              valor={configuracao.horarioResumo ?? NOTIFICACOES_PADRAO.horarioResumo}
              rotuloAcessivel="Horário do resumo diário"
              disabled={!configuracao.resumoDiario}
              onValor={(valor) => onMudar({ ...configuracao, horarioResumo: valor })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="horario-pendencias-notificacoes">Horário do aviso de pendências</Label>
            <SeletorHorario
              id="horario-pendencias-notificacoes"
              valor={configuracao.horarioPendencias}
              rotuloAcessivel="Horário do aviso de pendências"
              disabled={!configuracao.chamadasPendentes}
              onValor={(valor) => onMudar({ ...configuracao, horarioPendencias: valor })}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Horários da escola. Ativação na conta, por dispositivo.
        </p>
        <p className="text-muted-foreground text-xs">
          As alterações entram no rascunho e valem ao salvar as configurações.
        </p>
      </div>
    </SecaoRecolhivel>
  );
}
