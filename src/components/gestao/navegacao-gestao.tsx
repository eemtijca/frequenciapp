// Opções e divulgações da gaveta nos níveis de Gestão e Configurações.
import { useId, type ElementType } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import GridOnRoundedIcon from "@mui/icons-material/GridOnRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { svgIconClasses } from "@mui/material/SvgIcon";
import { TOKENS_LAYOUT } from "@/theme/layout";
import {
  CADASTROS_GESTAO,
  CATEGORIAS_CONFIGURACOES,
  categoriaDe,
  type CadastroGestao,
  type CategoriaConfiguracoes,
  type DestinoConfiguracoes,
  type DestinoGestao,
} from "@/components/gestao/destinos-gestao";

export const ESTILO_LISTA_GAVETA = { display: "flex", flexDirection: "column", gap: 0.5 } as const;

type OpcaoGavetaProps = {
  rotulo: string;
  icone?: ElementType;
  indicador?: ElementType;
  atual?: boolean;
  destacado?: boolean;
  pendente?: boolean;
  expandido?: boolean;
  controla?: string;
  foco?: "voltar" | "gestao" | "configuracoes" | "relatorios";
} & (
  | { onEscolher: () => void; novaAba?: never }
  | { onEscolher?: never; novaAba: { href: string; rotulo: string } }
);

export function OpcaoGaveta({
  rotulo,
  icone: Icone,
  indicador: Indicador,
  atual = false,
  destacado = atual,
  pendente,
  expandido,
  controla,
  foco,
  onEscolher,
  novaAba,
}: OpcaoGavetaProps) {
  return (
    <ListItemButton
      component={novaAba ? "a" : "button"}
      type={novaAba ? undefined : "button"}
      href={novaAba?.href}
      target={novaAba ? "_blank" : undefined}
      rel={novaAba ? "noopener" : undefined}
      data-foco-gaveta={foco}
      // A âncora de nova aba é um link: o papel padrão do ListItemButton esconderia o href.
      role={novaAba ? "link" : undefined}
      aria-label={novaAba?.rotulo ?? (pendente ? `${rotulo} Alterações não salvas` : undefined)}
      aria-current={atual ? "page" : undefined}
      aria-expanded={expandido}
      aria-controls={controla}
      selected={destacado}
      onClick={onEscolher}
      sx={(tema) => ({
        width: "100%",
        textAlign: "left",
        minHeight: TOKENS_LAYOUT.navegacao,
        px: 2,
        gap: 1.25,
        borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
        color: destacado ? "text.primary" : "text.secondary",
        "&.Mui-selected, &.Mui-selected:hover": {
          bgcolor: `color-mix(in srgb, ${tema.vars.palette.primary.main} 14%, transparent)`,
        },
        "@media (forced-colors: active)": {
          "&.Mui-selected": { borderInlineStart: "3px solid Highlight" },
        },
      })}
    >
      {Icone && (
        <ListItemIcon
          sx={{
            minWidth: TOKENS_LAYOUT.icone,
            flexShrink: 0,
            color: "inherit",
            // A lista genérica reduz os ícones para 1rem. A gaveta usa seu token.
            [`&& > .${svgIconClasses.root}`]: {
              width: TOKENS_LAYOUT.icone,
              height: TOKENS_LAYOUT.icone,
            },
          }}
        >
          <Icone />
        </ListItemIcon>
      )}
      <ListItemText
        primary={rotulo}
        slotProps={{ primary: { variant: "body2", sx: { fontWeight: destacado ? 600 : 500 } } }}
      />
      {pendente && (
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: "falta.main",
            flexShrink: 0,
            "@media (forced-colors: active)": { bgcolor: "CanvasText" },
          }}
        />
      )}
      {Indicador && <Indicador aria-hidden="true" fontSize="small" />}
    </ListItemButton>
  );
}

const ICONES_CADASTROS = {
  series: SchoolRoundedIcon,
  turmas: GroupsRoundedIcon,
  alunos: PeopleRoundedIcon,
  equipe: BadgeRoundedIcon,
  diretores: ShieldRoundedIcon,
};
const ICONES_CATEGORIAS = {
  escola: TuneRoundedIcon,
  horarios: ScheduleRoundedIcon,
  planilhas: GridOnRoundedIcon,
  acesso: ShieldRoundedIcon,
  dados: Inventory2RoundedIcon,
};
const cadastros: CadastroGestao[] = ["series", "turmas", "alunos", "equipe", "diretores"];

export function OpcoesGestao({
  atual,
  pendente,
  onCadastro,
  onConfiguracoes,
  onVoltar,
}: {
  atual: DestinoGestao;
  pendente: boolean;
  onCadastro: (cadastro: CadastroGestao) => void;
  onConfiguracoes: () => void;
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
      {cadastros.map((cadastro) => (
        <ListItem key={cadastro} disablePadding>
          <OpcaoGaveta
            rotulo={CADASTROS_GESTAO[cadastro]}
            icone={ICONES_CADASTROS[cadastro]}
            atual={cadastro === atual}
            onEscolher={() => onCadastro(cadastro)}
          />
        </ListItem>
      ))}
      <ListItem disablePadding>
        <OpcaoGaveta
          rotulo="Configurações"
          icone={SettingsRoundedIcon}
          indicador={ChevronRightRoundedIcon}
          foco="configuracoes"
          destacado={atual === "configuracoes"}
          pendente={pendente}
          onEscolher={onConfiguracoes}
        />
      </ListItem>
    </>
  );
}

export function OpcoesConfiguracoes({
  atual,
  expandida,
  onExpandir,
  onEscolher,
  onVoltar,
}: {
  atual: DestinoConfiguracoes;
  expandida: CategoriaConfiguracoes | null;
  onExpandir: (categoria: CategoriaConfiguracoes | null) => void;
  onEscolher: (destino: DestinoConfiguracoes) => void;
  onVoltar: () => void;
}) {
  const id = useId();
  const categoriaAtual = categoriaDe(atual).valor;
  return (
    <>
      <ListItem disablePadding>
        <OpcaoGaveta
          rotulo="Voltar para Gestão"
          icone={ArrowBackRoundedIcon}
          foco="voltar"
          onEscolher={onVoltar}
        />
      </ListItem>
      {CATEGORIAS_CONFIGURACOES.map((categoria) => {
        const { valor, rotulo } = categoria;
        const icone = ICONES_CATEGORIAS[valor];
        if (!("secoes" in categoria)) {
          return (
            <ListItem key={valor} disablePadding>
              <OpcaoGaveta
                rotulo={rotulo}
                icone={icone}
                atual={atual === valor}
                onEscolher={() => onEscolher(categoria.valor)}
              />
            </ListItem>
          );
        }
        const aberto = expandida === valor;
        const idGrupo = `${id}-${valor}`;
        return (
          <ListItem key={valor} disablePadding sx={{ display: "block" }}>
            <OpcaoGaveta
              rotulo={rotulo}
              icone={icone}
              indicador={aberto ? ExpandMoreRoundedIcon : ChevronRightRoundedIcon}
              atual={!aberto && valor === categoriaAtual}
              destacado={valor === categoriaAtual}
              expandido={aberto}
              controla={idGrupo}
              onEscolher={() => onExpandir(aberto ? null : valor)}
            />
            <List
              id={idGrupo}
              aria-label={rotulo}
              disablePadding
              hidden={!aberto}
              sx={{ ...ESTILO_LISTA_GAVETA, pl: 3.75, pt: 0.5, "&[hidden]": { display: "none" } }}
            >
              {categoria.secoes.map((secao) => (
                <ListItem key={secao.valor} disablePadding>
                  <OpcaoGaveta
                    rotulo={secao.rotulo}
                    atual={aberto && atual === secao.valor}
                    onEscolher={() => onEscolher(secao.valor)}
                  />
                </ListItem>
              ))}
            </List>
          </ListItem>
        );
      })}
    </>
  );
}
