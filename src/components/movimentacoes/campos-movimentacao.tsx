"use client";

// Campos comuns de Saídas e Entradas, mantendo rótulos e estados no chamador.
import { horaNoFuso } from "@/domain/frequencia";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { GrupoOpcoes } from "@/components/ui/mui/grupo-opcoes";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorHorario } from "@/components/ui/mui/seletor-horario";

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
  const idTexto = saida ? "saida-texto" : "entrada-motivo";
  const idObservacao = saida ? "saida-observacao" : "entrada-observacao";
  const contador = saida ? `${texto.length}/100` : undefined;
  const campoResponsavel = (
    <Campo
      id={`${tipo}-responsavel`}
      rotulo={saida ? "Responsável pela liberação" : "Responsável pelo registro"}
      descricao={descricaoResponsavel}
    >
      <Selecionar
        id={`${tipo}-responsavel`}
        valor={responsavel}
        onValor={onResponsavel}
        disabled={enviando}
        placeholder={saida ? "Selecione quem liberou" : "Selecione quem registrou"}
        opcoes={opcoesResponsavel}
      />
    </Campo>
  );

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Campo id={`${tipo}-turma`} rotulo="Turma" descricao={descricaoTurma}>
          <Selecionar
            id={`${tipo}-turma`}
            valor={turma || "todas"}
            disabled={enviando}
            onValor={(valor) => onTurma(valor === "todas" ? "" : valor)}
            placeholder="Todas as turmas"
            opcoes={opcoesTurma}
          />
        </Campo>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Campo id={`${tipo}-aluno`} rotulo="Aluno">
          <Selecionar
            id={`${tipo}-aluno`}
            valor={alunoId}
            onValor={onAluno}
            disabled={enviando}
            buscavel
            placeholder="Selecione o aluno"
            opcoes={opcoesAluno}
          />
        </Campo>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Campo id={`${tipo}-momento`} rotulo={saida ? "Momento da saída" : "Momento da entrada"}>
          <Selecionar
            id={`${tipo}-momento`}
            valor={momento}
            onValor={onMomento}
            disabled={enviando}
            placeholder="Selecione a aula ou pausa"
            opcoes={opcoesMomento}
          />
        </Campo>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
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
      </Grid>
      {responsavelDepois ? null : <Grid size={{ xs: 12, md: 6 }}>{campoResponsavel}</Grid>}
      <Grid size={12}>
        <FormControl
          component="fieldset"
          disabled={enviando}
          sx={{ border: 0, m: 0, p: 0, minWidth: 0, width: "100%" }}
        >
          <FormLabel component="legend" sx={{ mb: 1 }}>
            Justificativa
          </FormLabel>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
              <Campo id={idTexto} rotulo="Texto da justificativa" contador={contador}>
                <CampoTexto
                  id={idTexto}
                  valor={texto}
                  onValor={onTexto}
                  required={textoObrigatorio}
                  maxLength={100}
                  disabled={enviando}
                  placeholder="Descreva o motivo"
                />
              </Campo>
            ) : (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: catalogoEmDuasColunas ? 6 : 12 }}>
                  <Campo id={`${tipo}-justificativa`} rotulo="Tipo">
                    <Selecionar
                      id={`${tipo}-justificativa`}
                      valor={justificativa}
                      onValor={onJustificativa}
                      disabled={enviando}
                      placeholder="Selecione a justificativa"
                      opcoes={opcoesJustificativa}
                    />
                  </Campo>
                </Grid>
                {mostrarTextoCatalogo ? (
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Campo id={idTexto} rotulo="Texto da justificativa" contador={contador}>
                      <CampoTexto
                        id={idTexto}
                        valor={texto}
                        onValor={onTexto}
                        maxLength={100}
                        disabled={enviando}
                        placeholder="Opcional"
                      />
                    </Campo>
                  </Grid>
                ) : null}
                {mostrarObservacao ? (
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Campo id={idObservacao} rotulo="Observação">
                      <CampoTexto
                        id={idObservacao}
                        valor={observacao}
                        onValor={onObservacao}
                        maxLength={100}
                        disabled={enviando}
                        placeholder="Opcional: descreva brevemente o motivo"
                      />
                    </Campo>
                  </Grid>
                ) : null}
              </Grid>
            )}
          </Box>
        </FormControl>
      </Grid>
      {responsavelDepois ? <Grid size={{ xs: 12, md: 6 }}>{campoResponsavel}</Grid> : null}
    </Grid>
  );
}
