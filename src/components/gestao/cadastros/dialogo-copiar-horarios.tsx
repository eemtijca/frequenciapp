"use client";

// Cópia da grade entre turmas, com prévia e confirmação antes da gravação.
import { useMemo, useState } from "react";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Horario, Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";

interface Props {
  destino: Turma;
  turmas: Turma[];
  disabled: boolean;
  onOcupado: (ocupado: boolean) => void;
  onMudanca: () => Promise<void>;
}

export function DialogoCopiarHorarios({ destino, turmas, disabled, onOcupado, onMudanca }: Props) {
  const { avisarErro, avisarInfo, avisarSucesso } = useAvisosDaSessao();
  const [aberto, setAberto] = useState(false);
  const [origemId, setOrigemId] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const opcoes = useMemo(
    () =>
      turmas
        .filter((turma) => turma.id !== destino.id)
        .map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
    [destino.id, turmas],
  );
  const origem = turmas.find((turma) => turma.id === origemId);
  const aulas = useMemo(
    () => [...(origem?.horarios ?? [])].sort((a, b) => a.ordem - b.ordem),
    [origem],
  );

  const { executando, executar } = useAcaoUnica(async () => {
    if (!origem || aulas.length === 0 || disabled) return;
    setErro("");
    onOcupado(true);
    try {
      await pedir<{ horarios: Horario[] }>(
        "/api/horarios/copiar",
        corpoJson({ turmaOrigemId: origem.id, turmaDestinoId: destino.id }),
      );
      setConfirmando(false);
      setAberto(false);
      setOrigemId("");
      avisarSucesso("Grade copiada.");
      try {
        await onMudanca();
      } catch {
        avisarInfo(
          "Grade copiada.",
          "Recarregue a página para visualizar os horários atualizados.",
        );
      }
    } catch (excecao) {
      setConfirmando(false);
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível copiar a grade.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível copiar a grade." });
    } finally {
      onOcupado(false);
    }
  });

  if (!aberto) {
    return (
      <Botao
        variante="contorno"
        icone={<ContentCopyRoundedIcon />}
        disabled={disabled || opcoes.length === 0}
        onClick={() => setAberto(true)}
      >
        Copiar de outra turma
      </Botao>
    );
  }

  return (
    <Box
      component="section"
      aria-label="Copiar grade"
      sx={(tema) => ({
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
        p: 2,
        border: `1px solid ${tema.vars.palette.divider}`,
        borderRadius: 1,
      })}
    >
      <Campo id="horarios-turma-origem" rotulo="Turma de origem">
        <Selecionar
          buscavel
          valor={origemId}
          opcoes={opcoes}
          disabled={disabled || executando}
          onValor={(valor) => {
            setOrigemId(valor);
            setErro("");
          }}
          placeholder="Selecionar turma"
        />
      </Campo>
      <Typography variant="body2">
        Destino:{" "}
        <Box component="span" sx={{ fontWeight: 600 }}>
          {destino.rotulo}
        </Box>
      </Typography>
      {origem ? (
        aulas.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            A turma de origem não tem horários.
          </Typography>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {aulas.length} {aulas.length === 1 ? "aula" : "aulas"} de {origem.rotulo}
            </Typography>
            <List
              aria-label="Prévia da grade"
              disablePadding
              sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
            >
              {aulas.map((aula) => (
                <ListItem
                  key={aula.id}
                  sx={{
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 0.5,
                    borderBottom: 1,
                    borderColor: "divider",
                    "&:last-of-type": { borderBottom: 0 },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
                  >
                    Aula {aula.ordem}: {aula.inicio} às {aula.fim}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {aula.diasSemana
                      .map((dia) => {
                        const rotulo =
                          DIAS_DA_SEMANA.find((opcao) => opcao.valor === dia)?.abreviacao ?? dia;
                        return `${rotulo}: ${aula.disciplinas?.[String(dia)] || "sem disciplina"}`;
                      })
                      .join(" · ")}
                  </Typography>
                  {!aula.ativo ? (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Desativada
                    </Typography>
                  ) : null}
                </ListItem>
              ))}
            </List>
          </Stack>
        )
      ) : null}
      {erro ? <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" /> : null}
      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "flex-end" }}
      >
        <Botao
          variante="texto"
          disabled={disabled || executando}
          onClick={() => {
            setAberto(false);
            setErro("");
          }}
        >
          Cancelar cópia
        </Botao>
        <Botao
          variante="secundario"
          disabled={!origem || aulas.length === 0 || disabled}
          onClick={() => setConfirmando(true)}
        >
          Copiar grade
        </Botao>
      </Stack>
      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Copiar grade?"
        descricao={`Copia ${aulas.length} ${aulas.length === 1 ? "aula" : "aulas"} de ${origem?.rotulo ?? ""} para ${destino.rotulo}, incluindo ordem, horários, dias, disciplinas e estado de ativação. Aulas existentes e faltas são preservadas. Ordens repetidas impedem a cópia inteira.`}
        rotuloConfirmar="Confirmar cópia"
        operacaoEmAndamento={executando}
        onConfirmar={() => void executar()}
        onCancelar={() => setConfirmando(false)}
      />
    </Box>
  );
}
