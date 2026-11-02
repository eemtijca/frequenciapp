"use client";

// Campos comuns de Saídas e Entradas, mantendo rótulos e estados no chamador.
import { horaNoFuso } from "@/domain/frequencia";
import { cn } from "@/lib/utils";
import { Campo } from "@/components/ui/campo";
import { GrupoOpcoes } from "@/components/ui/grupo-opcoes";
import { Input } from "@/components/ui/input";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorHorario } from "@/components/ui/seletor-horario";

interface Opcao {
  valor: string;
  rotulo: string;
}

type FormaJustificativa = "texto" | "catalogo";

interface Props {
  tipo: "saida" | "entrada";
  turma: string;
  alunoId: string;
  momento: string;
  horario: string;
  responsavel: string;
  forma: FormaJustificativa;
  texto: string;
  justificativa: string;
  observacao: string;
  opcoesTurma: Opcao[];
  opcoesAluno: Opcao[];
  opcoesMomento: Opcao[];
  opcoesJustificativa: Opcao[];
  opcoesResponsavel: Opcao[];
  fuso: string;
  enviando: boolean;
  textoObrigatorio?: boolean;
  mostrarTextoCatalogo?: boolean;
  mostrarObservacao?: boolean;
  catalogoEmDuasColunas?: boolean;
  responsavelDepois?: boolean;
  descricaoTurma?: string;
  descricaoResponsavel?: string;
  onTurma: (valor: string) => void;
  onAluno: (valor: string) => void;
  onMomento: (valor: string) => void;
  onHorario: (valor: string) => void;
  onResponsavel: (valor: string) => void;
  onForma: (valor: FormaJustificativa) => void;
  onTexto: (valor: string) => void;
  onJustificativa: (valor: string) => void;
  onObservacao: (valor: string) => void;
}

export function CamposMovimentacao({
  tipo,
  turma,
  alunoId,
  momento,
  horario,
  responsavel,
  forma,
  texto,
  justificativa,
  observacao,
  opcoesTurma,
  opcoesAluno,
  opcoesMomento,
  opcoesJustificativa,
  opcoesResponsavel,
  fuso,
  enviando,
  textoObrigatorio = false,
  mostrarTextoCatalogo = false,
  mostrarObservacao = false,
  catalogoEmDuasColunas = false,
  responsavelDepois = false,
  descricaoTurma,
  descricaoResponsavel,
  onTurma,
  onAluno,
  onMomento,
  onHorario,
  onResponsavel,
  onForma,
  onTexto,
  onJustificativa,
  onObservacao,
}: Props) {
  const saida = tipo === "saida";
  const campoResponsavel = (
    <Campo
      id={`${tipo}-responsavel`}
      rotulo={saida ? "Responsável pela liberação" : "Responsável pelo registro"}
      descricao={descricaoResponsavel}
    >
      <Selecionar
        id={`${tipo}-responsavel`}
        value={responsavel}
        onValueChange={onResponsavel}
        disabled={enviando}
        placeholder={saida ? "Selecione quem liberou" : "Selecione quem registrou"}
        opcoes={opcoesResponsavel}
      />
    </Campo>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Campo id={`${tipo}-turma`} rotulo="Turma" descricao={descricaoTurma}>
        <Selecionar
          id={`${tipo}-turma`}
          value={turma || "todas"}
          disabled={enviando}
          onValueChange={(valor) => onTurma(valor === "todas" ? "" : valor)}
          placeholder="Todas as turmas"
          opcoes={opcoesTurma}
        />
      </Campo>
      <Campo id={`${tipo}-aluno`} rotulo="Aluno" className="md:col-span-1 xl:col-span-2">
        <Selecionar
          id={`${tipo}-aluno`}
          value={alunoId}
          onValueChange={onAluno}
          disabled={enviando}
          buscavel
          placeholder="Selecione o aluno"
          opcoes={opcoesAluno}
        />
      </Campo>
      <Campo id={`${tipo}-momento`} rotulo={saida ? "Momento da saída" : "Momento da entrada"}>
        <Selecionar
          id={`${tipo}-momento`}
          value={momento}
          onValueChange={onMomento}
          disabled={enviando}
          placeholder="Selecione a aula ou pausa"
          opcoes={opcoesMomento}
        />
      </Campo>
      <Campo id={`${tipo}-horario`} rotulo={saida ? "Horário da saída" : "Horário da chegada"}>
        <SeletorHorario
          id={`${tipo}-horario`}
          valor={horario}
          onValor={onHorario}
          rotuloAcessivel={saida ? "Horário da saída" : "Horário da chegada"}
          agora={horaNoFuso(new Date().toISOString(), fuso)}
          disabled={enviando}
        />
      </Campo>
      {responsavelDepois ? null : campoResponsavel}
      <fieldset className="flex flex-col gap-2 md:col-span-2 xl:col-span-3">
        <legend className="text-sm font-medium">Justificativa</legend>
        <GrupoOpcoes
          rotulo="Forma da justificativa"
          valor={forma}
          disabled={enviando}
          onValor={onForma}
          opcoes={[
            { valor: "texto", rotulo: "Escrever" },
            { valor: "catalogo", rotulo: "Selecionar tipo" },
          ]}
        />
        {forma === "texto" ? (
          <Campo id={`${tipo}-texto`} rotulo="Texto da justificativa">
            <Input
              id={`${tipo}-texto`}
              value={texto}
              required={textoObrigatorio}
              minLength={textoObrigatorio ? 2 : undefined}
              maxLength={100}
              disabled={enviando}
              onChange={(evento) => onTexto(evento.target.value)}
              placeholder="Descreva o motivo"
              className="h-11"
            />
          </Campo>
        ) : (
          <div className={cn("grid gap-3", catalogoEmDuasColunas && "sm:grid-cols-2")}>
            <Campo id={`${tipo}-justificativa`} rotulo="Tipo">
              <Selecionar
                id={`${tipo}-justificativa`}
                value={justificativa}
                onValueChange={onJustificativa}
                disabled={enviando}
                placeholder="Selecione a justificativa"
                opcoes={opcoesJustificativa}
              />
            </Campo>
            {mostrarTextoCatalogo ? (
              <Campo id={`${tipo}-texto`} rotulo="Texto da justificativa">
                <Input
                  id={`${tipo}-texto`}
                  value={texto}
                  maxLength={100}
                  disabled={enviando}
                  onChange={(evento) => onTexto(evento.target.value)}
                  placeholder="Opcional"
                  className="h-11"
                />
              </Campo>
            ) : null}
            {mostrarObservacao ? (
              <Campo id={`${tipo}-observacao`} rotulo="Observação">
                <Input
                  id={`${tipo}-observacao`}
                  value={observacao}
                  maxLength={100}
                  disabled={enviando}
                  onChange={(evento) => onObservacao(evento.target.value)}
                  placeholder="Opcional: descreva brevemente o motivo"
                  className="h-11"
                />
              </Campo>
            ) : null}
          </div>
        )}
      </fieldset>
      {responsavelDepois ? campoResponsavel : null}
    </div>
  );
}
