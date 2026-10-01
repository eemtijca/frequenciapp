"use client";

// Tipos de aviso oferecidos pela escola e horários de envio, editáveis
// pela Gestão com escolhas pessoais preservadas em cada conta.
import { useEffect, useState } from "react";
import { Bell, LoaderCircle } from "lucide-react";
import { pedir, corpoAlteracao } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import {
  NOTIFICACOES_PADRAO,
  type ConfiguracaoNotificacoes,
  type TipoDeAviso,
} from "@/domain/notificacoes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";

const CAMPOS: { tipo: TipoDeAviso; rotulo: string; descricao: string }[] = [
  {
    tipo: "resumoDiario",
    rotulo: "Resumo diário para diretores",
    descricao: "Um aviso por dia quando há chamada nas turmas acompanhadas.",
  },
  {
    tipo: "novasChamadas",
    rotulo: "Novas chamadas para diretores",
    descricao: "Um aviso por nova chamada salva nas turmas acompanhadas.",
  },
  {
    tipo: "chamadasPendentes",
    rotulo: "Chamadas pendentes para a coordenação",
    descricao:
      "Um aviso por dia se ainda há turmas com aula prevista e alunos ativos sem chamada salva. Disponível também para a administração.",
  },
];

export default function SecaoNotificacoes() {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<ConfiguracaoNotificacoes | null>(null);
  const [erro, setErro] = useState("");
  const { executando: carregando, executar: carregar } = useAcaoUnica(async () => {
    setErro("");
    try {
      const dados = await pedir<{ configuracao: ConfiguracaoNotificacoes }>(
        "/api/notificacoes/configuracao",
      );
      setRascunho(dados.configuracao);
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "Não foi possível consultar as notificações.",
      );
    }
  });
  useEffect(() => {
    if (aberto && !rascunho) void carregar();
  }, [aberto, rascunho, carregar]);
  const { executando: salvando, executar: salvar } = useAcaoUnica(async () => {
    if (!rascunho) return;
    setErro("");
    try {
      const dados = await pedir<{ configuracao: ConfiguracaoNotificacoes }>(
        "/api/notificacoes/configuracao",
        corpoAlteracao("PATCH", rascunho),
      );
      setRascunho(dados.configuracao);
      avisarSucesso("Configuração de notificações salva.");
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "Não foi possível salvar as notificações.",
      );
      avisarErro(excecao, { contexto: "Não foi possível salvar as notificações." });
    }
  });
  return (
    <SecaoRecolhivel
      titulo="Notificações"
      descricao="Avisos disponíveis e horários de envio da escola."
      icone={Bell}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="notificacoes"
    >
      {!rascunho ? (
        <div className="flex flex-col gap-3">
          {carregando ? (
            <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircle size={16} className="animate-spin" />
              Consultando notificações...
            </p>
          ) : (
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          )}
        </div>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(evento) => {
            evento.preventDefault();
            void salvar();
          }}
        >
          {CAMPOS.map(({ tipo, rotulo, descricao }) => (
            <div key={tipo} className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor={`aviso-${tipo}`}>{rotulo}</Label>
                <p className="text-muted-foreground text-sm">{descricao}</p>
              </div>
              <Switch
                id={`aviso-${tipo}`}
                checked={rascunho[tipo]}
                disabled={salvando}
                onCheckedChange={(valor) => setRascunho({ ...rascunho, [tipo]: valor })}
              />
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="horario-resumo-notificacoes">Horário do resumo diário</Label>
              <SeletorHorario
                id="horario-resumo-notificacoes"
                valor={rascunho.horarioResumo ?? NOTIFICACOES_PADRAO.horarioResumo}
                rotuloAcessivel="Horário do resumo diário"
                disabled={salvando || !rascunho.resumoDiario}
                onValor={(valor) => setRascunho({ ...rascunho, horarioResumo: valor })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="horario-pendencias-notificacoes">
                Horário do aviso de pendências
              </Label>
              <SeletorHorario
                id="horario-pendencias-notificacoes"
                valor={rascunho.horarioPendencias}
                rotuloAcessivel="Horário do aviso de pendências"
                disabled={salvando || !rascunho.chamadasPendentes}
                onValor={(valor) => setRascunho({ ...rascunho, horarioPendencias: valor })}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            Os avisos são enviados a partir do horário escolhido, no horário da escola. Cada pessoa
            escolhe seus avisos na conta e ativa as notificações em cada dispositivo.
          </p>
          <Button type="submit" disabled={salvando} className="self-start">
            {salvando ? <LoaderCircle size={16} className="animate-spin" /> : null}Salvar
            notificações
          </Button>
        </form>
      )}
      {erro ? (
        <p role="alert" className="text-falta-texto mt-3 text-sm">
          {erro}
        </p>
      ) : null}
    </SecaoRecolhivel>
  );
}
