"use client";

// Volta dos alunos remanejados de uma série às turmas de origem, com prévia por turma e confirmação.
import { useMemo, useState } from "react";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Aluno, Turma } from "@/domain/frequencia";
import { alunosForaDaOrigem, resumoDaRestauracao } from "@/domain/restauracao-origens";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";

function contarAlunos(quantidade: number): string {
  return quantidade === 1 ? "1 aluno" : `${quantidade} alunos`;
}

export default function DialogoRestaurarOrigens({
  turmas,
  alunos,
  onMudanca,
}: {
  turmas: Turma[];
  alunos: Aluno[];
  onMudanca: () => Promise<void>;
}) {
  const { avisarErro, avisarInfo, avisarSucesso } = useAvisosDaSessao();
  const [aberto, setAberto] = useState(false);
  const [serieEscolhida, setSerieEscolhida] = useState("");

  // Só entram as séries com alguém fora da origem, na ordem das turmas cadastradas.
  const series = useMemo(() => {
    const vistas = new Map<string, { id: string; nome: string; movidos: Aluno[] }>();
    for (const turma of turmas) {
      if (vistas.has(turma.serieId)) continue;
      const daSerie = new Set(
        turmas.filter((item) => item.serieId === turma.serieId).map((item) => item.id),
      );
      const movidos = alunosForaDaOrigem(alunos, daSerie);
      if (movidos.length > 0) {
        vistas.set(turma.serieId, { id: turma.serieId, nome: turma.serieNome, movidos });
      }
    }
    return [...vistas.values()];
  }, [alunos, turmas]);

  const rotulo = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Turma";
  }, [turmas]);

  const serie = series.find((item) => item.id === serieEscolhida) ?? series[0];
  const resumo = useMemo(() => (serie ? resumoDaRestauracao(serie.movidos) : []), [serie]);

  const { executando, executar } = useAcaoUnica(async () => {
    if (!serie) return;
    try {
      const resultado = await pedir<{ alunos: number; turmas: number; jaAplicado: boolean }>(
        "/api/alunos/restaurar-origens",
        corpoJson({
          serieId: serie.id,
          // A prévia vai inteira: o servidor recusa se qualquer aluno mudou desde então.
          previa: serie.movidos.map(({ id, turmaId, turmaOriginalId }) => ({
            id,
            turmaId,
            turmaOriginalId,
          })),
          confirmar: true,
        }),
      );
      setAberto(false);
      setSerieEscolhida("");
      try {
        await onMudanca();
      } catch {
        avisarInfo(
          "Turmas de origem restauradas.",
          "Recarregue a página para ver os alunos nas novas turmas.",
        );
        return;
      }
      if (resultado.jaAplicado) {
        avisarInfo(
          "Os alunos já estavam nas turmas de origem.",
          "A restauração anterior tinha sido concluída.",
        );
        return;
      }
      avisarSucesso(
        `${contarAlunos(resultado.alunos)} de volta às turmas de origem.`,
        "A chamada das turmas afetadas foi renumerada em ordem alfabética.",
      );
    } catch (erro) {
      avisarErro(erro, { contexto: "Não foi possível restaurar as turmas de origem." });
      // Relação mudou: recarrega os alunos para a prévia mostrar o estado atual.
      if (erro instanceof ErroApi && erro.status === 409) await onMudanca().catch(() => undefined);
    }
  });

  return (
    <>
      <Botao
        variante="contorno"
        icone={<UndoRoundedIcon />}
        disabled={series.length === 0 || executando}
        title={series.length === 0 ? "Todos os alunos já estão nas turmas de origem." : undefined}
        sx={{ whiteSpace: "nowrap" }}
        onClick={() => setAberto(true)}
      >
        Restaurar origens
      </Botao>
      <Dialogo
        aberto={aberto}
        onFechar={() => {
          if (!executando) setAberto(false);
        }}
        titulo="Restaurar as turmas de origem?"
        papel="alertdialog"
        descricao="Os alunos remanejados dentro da série, ativos e inativos, voltam para a turma de origem. Quem mudou de série não é alterado."
        tamanho="grande"
        acoes={
          <>
            <Botao variante="texto" disabled={executando} onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="secundario"
              carregando={executando}
              disabled={!serie}
              onClick={() => void executar()}
            >
              {serie ? `Restaurar ${contarAlunos(serie.movidos.length)}` : "Restaurar"}
            </Botao>
          </>
        }
      >
        {serie ? (
          <Stack spacing={2}>
            {series.length > 1 ? (
              <Campo id="restaurar-origens-serie" rotulo="Série">
                <Selecionar
                  valor={serie.id}
                  onValor={setSerieEscolhida}
                  disabled={executando}
                  opcoes={series.map((item) => ({
                    valor: item.id,
                    rotulo: `${item.nome} (${contarAlunos(item.movidos.length)})`,
                  }))}
                />
              </Campo>
            ) : null}
            <List
              aria-label="Prévia da restauração"
              disablePadding
              sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
            >
              {resumo.map((item) => (
                <ListItem
                  key={item.turmaId}
                  sx={{
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 0.5,
                    borderBottom: 1,
                    borderColor: "divider",
                    "&:last-of-type": { borderBottom: 0 },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {rotulo(item.turmaId)}: {contarAlunos(item.quantidade)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Voltam de {item.de.map(rotulo).join(", ")}
                  </Typography>
                </ListItem>
              ))}
            </List>
            <Stack spacing={1} sx={{ color: "text.secondary" }}>
              <Typography variant="body2">
                As turmas que perdem ou recebem alunos são reorganizadas em ordem alfabética, com
                inativos no fim, pela mesma regra de Reorganizar turmas. As demais turmas mantêm a
                numeração.
              </Typography>
              <Typography variant="body2">
                Saídas já registradas desses alunos passam a aparecer na turma de origem no
                relatório de saídas e entradas e na planilha de saídas. Faltas, chamadas salvas,
                entradas e registros parciais continuam como estão.
              </Typography>
            </Stack>
          </Stack>
        ) : null}
      </Dialogo>
    </>
  );
}
