"use client";

// Presenças personalizadas e justificativas por intervalo, com conferência das datas.
// O diálogo usa as primitivas MUI e mantém a confirmação em duas etapas.
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Aluno, JustificativaConfigurada, Turma } from "@/domain/frequencia";
import type { FrequenciaParcial, TipoFrequenciaParcial } from "@/domain/frequencia-parcial";
import {
  limiteAgendamentoParcial,
  LIMITE_AULAS_PARCIAL,
  LIMITE_OBSERVACAO_PARCIAL,
  normalizarAulas,
} from "@/domain/frequencia-parcial";
import { diasEntre, ehDiaValido, ehDomingo, JUSTIFICATIVA_OUTROS } from "@/domain/frequencia";
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { GrupoOpcoes } from "@/components/ui/mui/grupo-opcoes";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

export interface EdicaoParcial {
  alunoId: string;
  tipo: TipoFrequenciaParcial;
  turno: "MANHA" | "TARDE";
  aulas: number[];
  observacao: string;
  justificativa: string;
  de: string;
  ate: string;
}

export function edicaoDoRegistro(registro?: FrequenciaParcial): EdicaoParcial {
  return {
    alunoId: registro?.alunoId ?? "",
    tipo: registro?.tipo ?? "TURNO",
    turno: registro?.turno ?? "MANHA",
    aulas: registro?.aulas ?? [],
    observacao: registro?.observacao ?? "",
    justificativa: registro?.justificativa ?? "",
    de: registro?.dia ?? "",
    ate: registro?.dia ?? "",
  };
}

export function assinaturaDaEdicao(edicao: EdicaoParcial): string {
  return JSON.stringify({
    alunoId: edicao.alunoId,
    tipo: edicao.tipo,
    turno: edicao.tipo === "TURNO" ? edicao.turno : null,
    aulas: edicao.tipo === "AULAS" ? normalizarAulas(edicao.aulas) : [],
    observacao: edicao.observacao.trim(),
    justificativa: edicao.tipo === "JUSTIFICADA" ? edicao.justificativa : null,
    de: edicao.tipo === "JUSTIFICADA" ? edicao.de : null,
    ate: edicao.tipo === "JUSTIFICADA" ? edicao.ate : null,
  });
}

interface Props {
  aberto: boolean;
  edicao: EdicaoParcial;
  registro: FrequenciaParcial | null;
  turma: Turma | undefined;
  alunos: Aluno[];
  dia: string;
  hoje: string;
  justificativas: JustificativaConfigurada[];
  feriados: Feriado[];
  sujo: boolean;
  salvando: boolean;
  bloqueado?: boolean;
  erro: string;
  conflito: boolean;
  onEdicao: (edicao: EdicaoParcial) => void;
  onFechar: () => void;
  onSalvar: () => void;
  onRecarregar: () => void;
}

function dataCurta(dia: string): string {
  return dia.split("-").reverse().join("/");
}

function ItemResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 7rem) minmax(0, 1fr)",
        gap: 2,
      }}
    >
      <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
        {rotulo}
      </Typography>
      <Typography
        component="dd"
        variant="body2"
        sx={{ m: 0, minWidth: 0, overflowWrap: "anywhere" }}
      >
        {valor}
      </Typography>
    </Box>
  );
}

export function DialogoFrequenciaParcial({
  aberto,
  edicao,
  registro,
  turma,
  alunos,
  dia,
  hoje,
  justificativas,
  feriados,
  sujo,
  salvando,
  bloqueado = false,
  erro,
  conflito,
  onEdicao,
  onFechar,
  onSalvar,
  onRecarregar,
}: Props) {
  const [aulaInicial, setAulaInicial] = useState("1");
  const [aulaFinal, setAulaFinal] = useState("9");
  const [limiteAulas, setLimiteAulas] = useState(9);
  const [confirmando, setConfirmando] = useState(false);
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (!aberto) setConfirmando(false);
  }
  const aulasVisiveis = useMemo(() => {
    const maiorOrdem = Math.max(0, ...(turma?.horarios ?? []).map((aula) => aula.ordem));
    const maiorSelecionada = Math.max(0, ...edicao.aulas);
    const total = Math.min(
      LIMITE_AULAS_PARCIAL,
      Math.max(9, limiteAulas, maiorOrdem, maiorSelecionada),
    );
    return Array.from({ length: total }, (_, indice) => indice + 1);
  }, [edicao.aulas, limiteAulas, turma]);

  const justificando = edicao.tipo === "JUSTIFICADA";
  const intervaloValido =
    ehDiaValido(edicao.de) &&
    ehDiaValido(edicao.ate) &&
    edicao.ate >= edicao.de &&
    (Date.parse(edicao.ate) - Date.parse(edicao.de)) / 86_400_000 <= 30;
  const dias = intervaloValido
    ? diasEntre(edicao.de, edicao.ate).filter((d) => !ehDomingo(d) && !feriadoNaData(feriados, d))
    : [];
  const futuro = dia > hoje;
  const limite = limiteAgendamentoParcial(hoje);
  const podeSalvar =
    !salvando &&
    !bloqueado &&
    Boolean(edicao.alunoId) &&
    !(justificando && (!edicao.justificativa || !intervaloValido || !dias.length)) &&
    !(edicao.tipo === "AULAS" && edicao.aulas.length === 0) &&
    !conflito &&
    !(registro !== null && !sujo);
  const alunoSelecionado = alunos.find((aluno) => aluno.id === edicao.alunoId);
  const justificativaSelecionada =
    justificativas.find((item) => item.codigo === edicao.justificativa)?.rotulo ??
    edicao.justificativa;
  const tipoRotulo =
    edicao.tipo === "DIA_INTEIRO"
      ? "Dia inteiro"
      : edicao.tipo === "TURNO"
        ? "Turno inteiro"
        : edicao.tipo === "AULAS"
          ? "Por aulas"
          : "Justificativa";
  const turnoRotulo = edicao.turno === "TARDE" ? "Tarde" : "Manhã";

  function fechar() {
    if (salvando) return;
    setConfirmando(false);
    onFechar();
  }

  function alternarAula(aula: number) {
    const marcadas = edicao.aulas.includes(aula)
      ? edicao.aulas.filter((valor) => valor !== aula)
      : [...edicao.aulas, aula];
    onEdicao({ ...edicao, aulas: normalizarAulas(marcadas) });
  }

  function marcarAPartir() {
    const inicio = Number(aulaInicial);
    const fim = Number(aulaFinal);
    if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio > fim) return;
    onEdicao({
      ...edicao,
      aulas: Array.from({ length: fim - inicio + 1 }, (_, indice) => inicio + indice),
    });
    setLimiteAulas((atual) => Math.max(atual, fim));
  }

  const titulo = confirmando
    ? justificando
      ? "Confirmar justificativa"
      : "Confirmar frequência parcial"
    : registro
      ? "Editar frequência parcial"
      : "Registrar frequência parcial";

  const acoes = confirmando ? (
    <>
      <Botao
        type="button"
        variante="contorno"
        onClick={() => setConfirmando(false)}
        disabled={salvando}
      >
        Voltar
      </Botao>
      <Botao
        type="button"
        variante="secundario"
        onClick={onSalvar}
        disabled={!podeSalvar}
        carregando={salvando}
      >
        {justificando ? "Confirmar e salvar justificativa" : "Confirmar e salvar frequência"}
      </Botao>
    </>
  ) : (
    <>
      <Botao type="button" variante="contorno" onClick={fechar} disabled={salvando}>
        Cancelar
      </Botao>
      <Botao
        type="submit"
        form="form-frequencia-parcial"
        variante="secundario"
        disabled={!podeSalvar}
        carregando={salvando}
      >
        {justificando ? "Salvar justificativa" : "Salvar frequência parcial"}
      </Botao>
    </>
  );

  return (
    <Dialogo
      aberto={aberto}
      onFechar={fechar}
      titulo={titulo}
      descricao={turma ? `${turma.rotulo} · ${dataCurta(dia)}` : dataCurta(dia)}
      acoes={acoes}
      tamanho="grande"
    >
      {confirmando ? (
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Confira os dados antes de salvar. A alteração passa a valer imediatamente.
          </Typography>
          <Box component="dl" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <ItemResumo rotulo="Aluno" valor={alunoSelecionado?.nome ?? ""} />
            <ItemResumo rotulo="Turma" valor={turma?.rotulo ?? ""} />
            <ItemResumo rotulo="Dia" valor={dataCurta(dia)} />
            {justificando ? (
              <>
                <ItemResumo
                  rotulo="Período"
                  valor={`${dataCurta(edicao.de)} a ${dataCurta(edicao.ate)}`}
                />
                <ItemResumo rotulo="Justificativa" valor={justificativaSelecionada} />
              </>
            ) : (
              <>
                <ItemResumo rotulo="Tipo" valor={tipoRotulo} />
                {edicao.tipo === "TURNO" ? <ItemResumo rotulo="Turno" valor={turnoRotulo} /> : null}
                {edicao.tipo === "AULAS" ? (
                  <ItemResumo rotulo="Aulas" valor={edicao.aulas.join(", ")} />
                ) : null}
              </>
            )}
            {edicao.observacao.trim() ? (
              <ItemResumo rotulo="Observação" valor={edicao.observacao.trim()} />
            ) : null}
          </Box>
          {registro?.registradoSeduc && sujo ? (
            <AlertaCompacto
              variante="conflito"
              titulo="Confirmação na Seduc"
              descricao="A alteração deixará este registro pendente de conferência na Seduc."
              tamanho="linha"
            />
          ) : null}
          {erro ? (
            <AlertaCompacto
              variante={conflito ? "conflito" : "indisponivel"}
              descricao={erro}
              tamanho="linha"
            />
          ) : null}
        </Stack>
      ) : (
        <Box
          component="form"
          id="form-frequencia-parcial"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (podeSalvar) setConfirmando(true);
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Box>
            <Typography component="p" variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Aluno
            </Typography>
            <Typography
              id="parcial-aluno"
              component="p"
              variant="body2"
              sx={{
                m: 0,
                px: 1.5,
                py: 1,
                borderRadius: 1,
                backgroundColor: "action.hover",
                overflowWrap: "anywhere",
              }}
            >
              {alunoSelecionado?.nome ?? ""}
            </Typography>
          </Box>

          <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
            <Typography component="legend" variant="body2" sx={{ p: 0, mb: 1, fontWeight: 600 }}>
              Registro da frequência
            </Typography>
            <GrupoOpcoes<TipoFrequenciaParcial>
              rotulo="Forma da frequência parcial"
              valor={edicao.tipo}
              onValor={(tipo) => onEdicao({ ...edicao, tipo })}
              disabled={salvando}
              opcoes={[
                { valor: "DIA_INTEIRO", rotulo: "Dia inteiro", disabled: futuro },
                { valor: "TURNO", rotulo: "Turno inteiro", disabled: futuro },
                { valor: "AULAS", rotulo: "Por aulas", disabled: futuro },
                { valor: "JUSTIFICADA", rotulo: "Justificativa" },
              ]}
            />
          </Box>

          {justificando ? (
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
                  gap: 2,
                }}
              >
                <Campo id="parcial-justificativa-de" rotulo="Data inicial">
                  <SeletorPeriodo
                    id="parcial-justificativa-de"
                    modo="dia"
                    valor={edicao.de || dia}
                    max={limite}
                    atual={hoje}
                    semDomingo
                    mostrarSelo={false}
                    rotulo={dataCurta(edicao.de || dia)}
                    rotuloAcessivel="Data inicial da justificativa"
                    onValor={(de) =>
                      onEdicao({ ...edicao, de, ate: edicao.ate < de ? de : edicao.ate })
                    }
                    disabled={salvando || registro !== null}
                  />
                </Campo>
                <Campo id="parcial-justificativa-ate" rotulo="Data final">
                  <SeletorPeriodo
                    id="parcial-justificativa-ate"
                    modo="dia"
                    valor={edicao.ate || dia}
                    max={limite}
                    atual={hoje}
                    semDomingo
                    mostrarSelo={false}
                    rotulo={dataCurta(edicao.ate || dia)}
                    rotuloAcessivel="Data final da justificativa"
                    onValor={(ate) => onEdicao({ ...edicao, ate })}
                    disabled={salvando || registro !== null}
                  />
                </Campo>
              </Box>
              <Campo id="parcial-justificativa" rotulo="Justificativa">
                <Selecionar
                  valor={edicao.justificativa}
                  onValor={(justificativa) =>
                    onEdicao({
                      ...edicao,
                      justificativa,
                      observacao: justificativa === JUSTIFICATIVA_OUTROS ? edicao.observacao : "",
                    })
                  }
                  opcoes={justificativas
                    .filter((j) => j.ativo || j.codigo === edicao.justificativa)
                    .map((j) => ({ valor: j.codigo, rotulo: j.rotulo }))}
                  disabled={salvando}
                  placeholder="Selecione"
                />
              </Campo>
              <Typography
                component="p"
                variant="body2"
                role="status"
                sx={{ color: "text.secondary" }}
              >
                {intervaloValido
                  ? `${dias.length} ${dias.length === 1 ? "dia incluído" : "dias incluídos"}. Domingos e feriados ficam fora.`
                  : "Escolha um período de até 31 dias, em ordem de data."}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Dia inteiro. Em chamadas salvas, altera apenas a justificativa deste aluno.
              </Typography>
            </Stack>
          ) : edicao.tipo === "TURNO" ? (
            <Campo id="parcial-turno" rotulo="Turno frequentado">
              <Selecionar
                valor={edicao.turno}
                onValor={(valor) =>
                  onEdicao({ ...edicao, turno: valor === "TARDE" ? "TARDE" : "MANHA" })
                }
                opcoes={[
                  { valor: "MANHA", rotulo: "Manhã" },
                  { valor: "TARDE", rotulo: "Tarde" },
                ]}
                disabled={salvando}
              />
            </Campo>
          ) : edicao.tipo === "AULAS" ? (
            <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
              <Typography component="legend" variant="body2" sx={{ p: 0, mb: 1, fontWeight: 600 }}>
                Aulas frequentadas
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    sm: "repeat(5, minmax(0, 1fr))",
                  },
                  gap: 1,
                }}
              >
                {aulasVisiveis.map((aula) => (
                  <FormControlLabel
                    key={aula}
                    control={
                      <Checkbox
                        checked={edicao.aulas.includes(aula)}
                        onChange={() => alternarAula(aula)}
                        disabled={salvando}
                        slotProps={{ input: { "aria-label": `${aula}ª aula frequentada` } }}
                      />
                    }
                    label={`${aula}ª aula`}
                    sx={{
                      m: 0,
                      minHeight: 48,
                      px: 1,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1,
                      justifyContent: "flex-start",
                    }}
                  />
                ))}
              </Box>
              {aulasVisiveis.length < LIMITE_AULAS_PARCIAL ? (
                <Botao
                  type="button"
                  variante="contorno"
                  onClick={() => setLimiteAulas(LIMITE_AULAS_PARCIAL)}
                  disabled={salvando}
                  sx={{ mt: 1 }}
                >
                  Mostrar mais aulas
                </Botao>
              ) : null}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 2,
                  mt: 2,
                }}
              >
                <Campo id="parcial-aula-inicial" rotulo="A partir da aula">
                  <Selecionar
                    valor={aulaInicial}
                    onValor={setAulaInicial}
                    disabled={salvando}
                    opcoes={Array.from({ length: LIMITE_AULAS_PARCIAL }, (_, indice) => ({
                      valor: String(indice + 1),
                      rotulo: `${indice + 1}ª aula`,
                    }))}
                  />
                </Campo>
                <Campo id="parcial-aula-final" rotulo="Até a aula">
                  <Selecionar
                    valor={aulaFinal}
                    onValor={setAulaFinal}
                    disabled={salvando}
                    opcoes={Array.from({ length: LIMITE_AULAS_PARCIAL }, (_, indice) => ({
                      valor: String(indice + 1),
                      rotulo: `${indice + 1}ª aula`,
                    }))}
                  />
                </Campo>
              </Box>
              <Botao
                type="button"
                variante="contorno"
                onClick={marcarAPartir}
                disabled={salvando || Number(aulaInicial) > Number(aulaFinal)}
                sx={{ mt: 1 }}
              >
                Marcar intervalo de aulas
              </Botao>
              <Typography
                variant="caption"
                sx={{ mt: 1, display: "block", color: "text.secondary" }}
              >
                {edicao.aulas.length === 0
                  ? "Selecione as aulas em que houve presença."
                  : `${edicao.aulas.length} ${edicao.aulas.length === 1 ? "aula selecionada" : "aulas selecionadas"}.`}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Presença em todas as aulas do dia.
            </Typography>
          )}

          {(!justificando || edicao.justificativa === JUSTIFICATIVA_OUTROS) && (
            <Campo id="parcial-observacao" rotulo="Observação">
              <CampoTexto
                valor={edicao.observacao}
                onValor={(observacao) => onEdicao({ ...edicao, observacao })}
                maxLength={justificando ? 200 : LIMITE_OBSERVACAO_PARCIAL}
                disabled={salvando}
                placeholder="Opcional"
              />
            </Campo>
          )}

          {registro?.registradoSeduc && sujo ? (
            <AlertaCompacto
              variante="conflito"
              titulo="Confirmação na Seduc"
              descricao="A alteração deixará este registro pendente de conferência na Seduc."
              tamanho="linha"
            />
          ) : null}
          {erro ? (
            <AlertaCompacto
              variante={conflito ? "conflito" : "indisponivel"}
              descricao={erro}
              tamanho="linha"
            />
          ) : null}
          {conflito ? (
            <Botao type="button" variante="contorno" onClick={onRecarregar} disabled={salvando}>
              Carregar versão salva
            </Botao>
          ) : null}
        </Box>
      )}
    </Dialogo>
  );
}
