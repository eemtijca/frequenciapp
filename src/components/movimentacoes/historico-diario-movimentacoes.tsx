// Apresenta apenas o histórico diário de movimentações, com estados distintos de leitura.
import type { ReactNode } from "react";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import type { FalhaDeLeitura } from "./use-historico-movimentacoes";

const ESTILO_LEITOR = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

interface Linha {
  id: string;
  nome: string;
  itens: string[];
  rodape: ReactNode;
  acao?: ReactNode;
}

interface Props {
  titulo: string;
  rotuloRegiao?: string;
  registros: Linha[];
  carregando: boolean;
  falha?: FalhaDeLeitura;
  onTentarNovamente: () => void;
  textoCarregando: string;
  textoVazio: string;
  acao?: ReactNode;
}

export function HistoricoDiarioMovimentacoes({
  titulo,
  rotuloRegiao = titulo,
  registros,
  carregando,
  falha,
  onTentarNovamente,
  textoCarregando,
  textoVazio,
  acao,
}: Props) {
  const leituraConcluida = !carregando && !falha;
  const total = registros.length;
  const rotuloTotal = total === 1 ? "1 registro" : `${total} registros`;
  return (
    <SecaoConteudo
      rotuloAcessivel={rotuloRegiao}
      titulo={
        <>
          {titulo}
          {leituraConcluida && (
            <Box
              component="span"
              sx={{ color: "text.secondary", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}
            >
              {` (${total})`}
            </Box>
          )}
        </>
      }
      acoes={leituraConcluida && total > 0 ? acao : undefined}
    >
      <Box>
        <Typography
          component="p"
          variant="body2"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          sx={carregando ? { color: "text.secondary", mb: 1 } : ESTILO_LEITOR}
        >
          {carregando ? textoCarregando : leituraConcluida ? `${titulo}: ${rotuloTotal}.` : ""}
        </Typography>
        {carregando ? (
          <Stack spacing={0.5} aria-hidden="true">
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="75%" />
          </Stack>
        ) : falha ? (
          <AlertaCompacto
            variante={falha.variante}
            descricao={falha.mensagem}
            tamanho="linha"
            acao={{ rotulo: "Tentar novamente", onClick: onTentarNovamente }}
          />
        ) : total === 0 ? (
          <EstadoVazio
            icone={<EventNoteOutlinedIcon />}
            titulo="Nenhum registro"
            nivelTitulo="h3"
            descricao={textoVazio}
          />
        ) : (
          <List aria-label={titulo} disablePadding>
            {registros.map(({ id, nome, itens, rodape, acao }, indice) => (
              <ListItem
                key={id}
                disableGutters
                divider={indice < total - 1}
                sx={{ alignItems: "flex-start", gap: 1, py: 1.5 }}
              >
                <Stack spacing={1} useFlexGap sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    component="h3"
                    variant="body1"
                    sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                  >
                    {nome}
                  </Typography>
                  <CaixasDeInfo itens={itens} />
                  <Typography
                    component="p"
                    variant="caption"
                    sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                  >
                    {rodape}
                  </Typography>
                </Stack>
                {acao}
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </SecaoConteudo>
  );
}
