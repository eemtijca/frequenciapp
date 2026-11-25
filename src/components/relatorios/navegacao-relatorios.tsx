// Destinos de Relatórios no painel lateral, com os mesmos controles da Gestão.
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TableViewRoundedIcon from "@mui/icons-material/TableViewRounded";
import ListItem from "@mui/material/ListItem";
import { OpcaoGaveta } from "@/components/gestao/navegacao-gestao";

const DESTINOS = [
  { valor: "resumo", rotulo: "Resumo", icone: InsightsRoundedIcon },
  { valor: "historico", rotulo: "Histórico", icone: HistoryRoundedIcon },
  { valor: "grade", rotulo: "Grade", icone: TableViewRoundedIcon },
  { valor: "aluno", rotulo: "Por aluno", icone: PersonRoundedIcon },
  { valor: "movimentacoes", rotulo: "Saídas e Entradas", icone: SwapHorizRoundedIcon },
] as const;

export type DestinoRelatorios = (typeof DESTINOS)[number]["valor"];

export function OpcoesRelatorios({
  atual,
  onEscolher,
  onVoltar,
}: {
  atual: DestinoRelatorios | null;
  onEscolher: (destino: DestinoRelatorios) => void;
  onVoltar: () => void;
}) {
  return (
    <>
      <ListItem disablePadding>
        <OpcaoGaveta
          rotulo="Voltar ao menu principal"
          icone={ArrowBackRoundedIcon}
          foco="voltar"
          onEscolher={onVoltar}
        />
      </ListItem>
      {DESTINOS.map(({ valor, rotulo, icone }) => (
        <ListItem key={valor} disablePadding>
          <OpcaoGaveta
            rotulo={rotulo}
            icone={icone}
            atual={atual === valor}
            onEscolher={() => onEscolher(valor)}
          />
        </ListItem>
      ))}
    </>
  );
}
