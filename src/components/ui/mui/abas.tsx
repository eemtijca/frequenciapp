"use client";

// Abas MUI como trilho de pílulas: todas visíveis no celular, troca por toque,
// teclado e painéis visitados preservados, com vínculo ARIA completo.
import {
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import { alpha, type Theme } from "@mui/material/styles";
import { ESPACO_COMPOSICAO } from "@/theme/layout";
import { brand } from "@/theme/paleta";

export type VarianteAbas = "scrollable" | "standard" | "fullWidth";

export interface ItemAba<T extends string = string> {
  valor: T;
  rotulo: string | ReactElement;
  /** Rótulo curto usado no celular, quando o nome completo não cabe. */
  rotuloCurto?: string;
  conteudo: ReactNode;
  icone?: string | ReactElement;
  desabilitado?: boolean;
  referencia?: RefObject<HTMLButtonElement | null>;
}

export interface AbasProps<T extends string> {
  itens: readonly ItemAba<T>[];
  ativo: T;
  onChange: (valor: T) => void;
  rotuloAcessivel: string;
  /** Mantido para compatibilidade; o trilho usa a mesma grade em qualquer largura. */
  variant?: VarianteAbas;
  dataPager?: string;
  /** Permite uma apresentação de página sem desmontar os painéis visitados. */
  ocultarTrilho?: boolean;
  /** Ação ao lado do trilho, fora da tablist e sem reduzir a largura dos painéis. */
  acaoNoTrilho?: ReactNode;
}

const RECUO_TRILHO = 4;
const RAIO_ABA = 18;

function estiloAba(tema: Theme, ativo: boolean) {
  return {
    display: "flex",
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: { xs: "column", sm: "row" },
    gap: { xs: 0.25, sm: 0.75 },
    px: { xs: 0.5, sm: 1 },
    borderRadius: `${RAIO_ABA}px`,
    color: ativo ? tema.vars.palette.text.primary : tema.vars.palette.text.secondary,
    backgroundColor: ativo ? alpha(brand[500], 0.14) : "transparent",
    fontSize: { xs: "0.6875rem", sm: "0.75rem" },
    fontWeight: 600,
    lineHeight: 1.2,
    transition: tema.transitions.create(["background-color", "color"], { duration: 100 }),
    "&:hover": {
      backgroundColor: ativo ? alpha(brand[500], 0.2) : tema.vars.palette.action.hover,
    },
    "&:focus-visible": {
      outline: `3px solid ${tema.vars.palette.primary.main}`,
      outlineOffset: 2,
    },
    "&.Mui-disabled": {
      color: tema.vars.palette.text.disabled,
      backgroundColor: "transparent",
    },
  };
}

export function Abas<T extends string>({
  itens,
  ativo,
  onChange,
  rotuloAcessivel,
  dataPager,
  ocultarTrilho = false,
  acaoNoTrilho,
}: AbasProps<T>) {
  const [visitados, setVisitados] = useState<ReadonlySet<T>>(() => new Set<T>([ativo]));
  const referencias = useRef<(HTMLButtonElement | null)[]>([]);

  function trocar(valor: T) {
    const item = itens.find((candidato) => candidato.valor === valor);
    if (!item || item.desabilitado) return;
    setVisitados((atuais) => {
      if (atuais.has(item.valor)) return atuais;
      const proximos = new Set(atuais);
      proximos.add(item.valor);
      return proximos;
    });
    onChange(item.valor);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const habilitados = itens
      .map((item, indice) => ({ item, indice }))
      .filter(({ item }) => !item.desabilitado);
    if (habilitados.length === 0) return;
    const posicao = habilitados.findIndex(
      ({ indice }) => referencias.current[indice] === evento.target,
    );
    const passo = evento.key === "ArrowLeft" ? -1 : 1;
    const alvo =
      evento.key === "Home"
        ? habilitados[0]
        : evento.key === "End"
          ? habilitados[habilitados.length - 1]
          : habilitados[(posicao + passo + habilitados.length) % habilitados.length];
    if (!alvo) return;
    trocar(alvo.item.valor);
    referencias.current[alvo.indice]?.focus();
  }

  // IDs estáveis preservam âncoras e seletores das telas que usam as abas.
  const idAba = (valor: T) => `aba-${valor}`;
  const idPainel = (valor: T) => `painel-${valor}`;

  const trilho = (
    <Box
      role="tablist"
      aria-label={rotuloAcessivel}
      hidden={ocultarTrilho}
      onKeyDown={aoTeclar}
      sx={(tema) => ({
        display: ocultarTrilho ? "none" : "grid",
        flex: 1,
        minWidth: 0,
        gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))`,
        gap: 0.5,
        p: `${RECUO_TRILHO}px`,
        // O raio externo acompanha a curva da aba a uma distância igual ao recuo.
        borderRadius: `${RAIO_ABA + RECUO_TRILHO}px`,
        backgroundColor: tema.vars.palette.action.hover,
      })}
    >
      {itens.map((item, indice) => {
        const selecionado = item.valor === ativo;
        return (
          <ButtonBase
            key={item.valor}
            ref={(elemento) => {
              referencias.current[indice] = elemento;
              if (item.referencia) item.referencia.current = elemento;
            }}
            role="tab"
            aria-label={
              item.rotuloCurto && typeof item.rotulo === "string" ? item.rotulo : undefined
            }
            id={idAba(item.valor)}
            aria-controls={idPainel(item.valor)}
            aria-selected={selecionado}
            tabIndex={selecionado ? 0 : -1}
            disabled={item.desabilitado}
            onClick={() => trocar(item.valor)}
            sx={(tema) => estiloAba(tema, selecionado)}
          >
            {item.icone ? (
              <Box component="span" aria-hidden="true" sx={{ display: "flex", flexShrink: 0 }}>
                {item.icone}
              </Box>
            ) : null}
            <Box
              component="span"
              sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {item.rotuloCurto ? (
                <>
                  <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                    {item.rotuloCurto}
                  </Box>
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    {item.rotulo}
                  </Box>
                </>
              ) : (
                item.rotulo
              )}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center" }}>
        {trilho}
        {!ocultarTrilho && acaoNoTrilho}
      </Stack>
      <Box
        data-pager={dataPager}
        sx={{ minWidth: 0, pt: ocultarTrilho ? undefined : ESPACO_COMPOSICAO.aposAbas }}
      >
        {itens.map((item) => {
          const selecionado = item.valor === ativo;
          if (!selecionado && !visitados.has(item.valor)) return null;
          return (
            <Box
              key={item.valor}
              id={idPainel(item.valor)}
              role={ocultarTrilho && selecionado ? undefined : "tabpanel"}
              aria-labelledby={ocultarTrilho && selecionado ? undefined : idAba(item.valor)}
              aria-hidden={!selecionado}
              hidden={!selecionado}
              inert={!selecionado}
              tabIndex={ocultarTrilho ? undefined : 0}
              sx={(tema) => ({
                minWidth: 0,
                "&:focus-visible": {
                  outline: `3px solid ${tema.vars.palette.primary.main}`,
                  outlineOffset: 2,
                },
              })}
            >
              {item.conteudo}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
