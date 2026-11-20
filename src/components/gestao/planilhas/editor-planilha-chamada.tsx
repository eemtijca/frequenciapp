"use client";

// Centraliza a revisão de linhas e valores da chamada por turma e mês na Gestão.
import { useState } from "react";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import { diasDoMes, rotuloMes } from "@/domain/frequencia";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import DialogoEnvio, { type ObjetivoEdicaoPlanilha } from "@/components/grade/dialogo-envio";

const ACOES: readonly {
  acao: ObjetivoEdicaoPlanilha;
  titulo: string;
  icone: SvgIconComponent;
}[] = [
  { acao: "adicionar", titulo: "Adicionar alunos", icone: PersonAddAlt1RoundedIcon },
  { acao: "corrigir", titulo: "Corrigir dados", icone: EditNoteRoundedIcon },
  {
    acao: "remover",
    titulo: "Retirar linhas ou colunas",
    icone: DeleteOutlineRoundedIcon,
  },
];

export function EditorPlanilhaChamada({
  turmas,
  mapa,
  diaCorrente,
  modoCompleto,
  disponivel,
  aoConcluir,
}: {
  turmas: { id: string; rotulo: string }[];
  mapa: { turmaOriginalId: string; aba: string; mes?: string }[];
  diaCorrente: string;
  modoCompleto: boolean;
  disponivel: boolean;
  aoConcluir: () => void;
}) {
  const [turmaId, setTurmaId] = useState("");
  const [mes, setMes] = useState(diaCorrente.slice(0, 7));
  const [objetivo, setObjetivo] = useState<ObjetivoEdicaoPlanilha | null>(null);
  const turma = turmas.find((item) => item.id === turmaId);
  const vinculos = mapa.filter(
    (item) => item.turmaOriginalId === turmaId && (!item.mes || item.mes === mes),
  );
  const habilitado = disponivel && Boolean(turma) && vinculos.length > 0;
  const dias = diasDoMes(mes);

  return (
    <Box
      component="section"
      aria-label="Editar planilhas de chamada"
      sx={(tema) => ({
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 2,
        border: `1px solid ${tema.vars.palette.divider}`,
        borderRadius: 2,
        minWidth: 0,
      })}
    >
      <Typography component="h3" variant="subtitle1">
        Editar chamada
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { sm: "1fr 1fr" } }}>
        <Campo id="editor-planilha-turma" rotulo="Turma da planilha para editar">
          <Selecionar
            id="editor-planilha-turma"
            buscavel
            valor={turmaId}
            onValor={setTurmaId}
            placeholder="Escolha a turma"
            ariaLabel="Turma da planilha para editar"
            opcoes={turmas.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
          />
        </Campo>
        <Campo id="editor-planilha-mes" rotulo="Mês da planilha para editar">
          <SeletorPeriodo
            id="editor-planilha-mes"
            modo="mes"
            valor={mes}
            max={diaCorrente.slice(0, 7)}
            rotuloAcessivel="Mês da planilha para editar"
            rotulo={rotuloMes(mes)}
            onValor={setMes}
          />
        </Campo>
      </Box>
      <Stack
        role="status"
        direction="row"
        spacing={1}
        sx={{ alignItems: "flex-start", color: "text.secondary" }}
      >
        <DescriptionRoundedIcon fontSize="small" aria-hidden="true" sx={{ marginTop: 0.25 }} />
        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
          {!disponivel
            ? "Conecte e configure a planilha para editar."
            : !turma
              ? "Escolha a turma e o mês."
              : vinculos.length === 0
                ? "Sem aba neste mês. Prepare o mês ou revise a estrutura."
                : `Destino: ${vinculos.map((item) => item.aba).join(", ")}.`}
        </Typography>
      </Stack>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {ACOES.map(({ acao, titulo, icone: Icone }) => {
          const protegida = acao !== "adicionar" && !modoCompleto;
          return (
            <Botao
              key={acao}
              type="button"
              variante="contorno"
              disabled={!habilitado || protegida}
              onClick={() => setObjetivo(acao)}
              icone={<Icone />}
              sx={{
                position: "relative",
                minHeight: 112,
                height: "auto",
                flexDirection: "column",
                gap: 1,
                paddingX: 1,
                textAlign: "center",
                whiteSpace: "normal",
              }}
            >
              {titulo}
              {protegida ? (
                <LockRoundedIcon
                  aria-hidden="true"
                  sx={{ position: "absolute", top: 8, right: 8, fontSize: 14 }}
                />
              ) : null}
            </Botao>
          );
        })}
      </Box>
      <Acordeao
        titulo="Ajuda"
        nivelTitulo="h4"
        resumo={
          <Typography
            component="span"
            variant="body2"
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <HelpOutlineRoundedIcon fontSize="inherit" aria-hidden="true" />O que cada ação altera
          </Typography>
        }
      >
        <Box component="ul" sx={{ margin: 0, paddingLeft: 2, color: "text.secondary" }}>
          <Typography component="li" variant="body2">
            Adicionar alunos cria as linhas que faltam e preenche as chamadas do mês.
          </Typography>
          <Typography component="li" variant="body2">
            Corrigir dados atualiza nomes, turmas e chamadas com os dados do aplicativo.
          </Typography>
          <Typography component="li" variant="body2">
            Retirar linhas ou colunas abre a seleção de exclusões.
          </Typography>
          <Typography component="li" variant="body2">
            Cada ação abre uma prévia antes de gravar. O cadastro e as chamadas no aplicativo são
            preservados.
          </Typography>
        </Box>
      </Acordeao>
      {objetivo && turma ? (
        <DialogoEnvio
          key={`${turmaId}-${mes}-${objetivo}`}
          objetivo={objetivo}
          aberto
          onAbrir={(aberto) => {
            if (!aberto) setObjetivo(null);
          }}
          turmaOriginalId={turmaId}
          rotulo={turma.rotulo}
          de={dias[0] ?? diaCorrente}
          ate={dias[dias.length - 1] ?? diaCorrente}
          modoCompleto={modoCompleto}
          aoConcluir={aoConcluir}
        />
      ) : null}
    </Box>
  );
}
