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

/** Quem só consulta (Secretaria) lê a Grade e o Por aluno; Resumo, Histórico e movimentações ficam fora. */
export const DESTINOS_DA_CONSULTA: readonly DestinoRelatorios[] = ["grade", "aluno"];

export function OpcoesRelatorios({
  atual,
  destinos,
  onEscolher,
  onVoltar,
}: {
  atual: DestinoRelatorios | null;
  /** Destinos mostrados; sem a lista, todos. */
  destinos?: readonly DestinoRelatorios[];
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
      {DESTINOS.filter(({ valor }) => !destinos || destinos.includes(valor)).map(
        ({ valor, rotulo, icone }) => (
          <ListItem key={valor} disablePadding>
            <OpcaoGaveta
              rotulo={rotulo}
              icone={icone}
              atual={atual === valor}
              onEscolher={() => onEscolher(valor)}
            />
          </ListItem>
        ),
      )}
    </>
  );
}
