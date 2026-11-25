"use client";

// Gráficos do painel: carrossel controlado, um cartão por vez e estado preservado.
import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { BotaoIcone } from "@/components/ui/mui/botao";
import { CarrosselCartoes, type ItemCarrossel } from "@/components/ui/mui/carrossel-cartoes";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { CartaoTitulo } from "@/components/ui/mui/cartao";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  itens: ItemCarrossel[];
  valor: string;
  onValor: (id: string) => void;
  ocupado?: boolean;
}

const TAMANHO_CONTROLE = TOKENS_LAYOUT.alvoToque;

export default function FaixaGraficos({ itens, valor, onValor, ocupado }: Props) {
  const indice = Math.max(
    0,
    itens.findIndex((item) => item.id === valor),
  );
  const atual = itens[indice];
  const [visitados, setVisitados] = useState<string[]>(() => [valor]);
  if (!atual) return null;

  function selecionar(id: string) {
    setVisitados((atuais) => (atuais.includes(id) ? atuais : [...atuais, id]));
    onValor(id);
  }

  function irPara(destino: number) {
    const proximo = itens[Math.min(Math.max(destino, 0), itens.length - 1)];
    if (proximo) selecionar(proximo.id);
  }

  return (
    <Box component="section" aria-label="Gráficos do painel" sx={{ minWidth: 0 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1, sm: 2 }}
          sx={{
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <CartaoTitulo>Gráficos</CartaoTitulo>
          <Stack
            direction="row"
            spacing={1}
            role="group"
            aria-label="Navegação dos gráficos"
            sx={{ minWidth: 0, alignItems: "center" }}
          >
            <Box
              sx={{
                minWidth: 0,
                flex: { xs: 1, sm: "none" },
                width: { xs: "100%", sm: 224 },
                "& .MuiInputBase-root": { minHeight: TAMANHO_CONTROLE },
              }}
            >
              <Selecionar
                ariaLabel="Gráfico em exibição"
                valor={atual.id}
                onValor={selecionar}
                opcoes={itens.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
              />
            </Box>
            <BotaoIcone
              rotulo="Gráfico anterior"
              icone={<ChevronLeftRoundedIcon />}
              variante="contorno"
              disabled={indice <= 0}
              onClick={() => irPara(indice - 1)}
              sx={{ width: TAMANHO_CONTROLE, height: TAMANHO_CONTROLE, flexShrink: 0 }}
            />
            <BotaoIcone
              rotulo="Próximo gráfico"
              icone={<ChevronRightRoundedIcon />}
              variante="contorno"
              disabled={indice >= itens.length - 1}
              onClick={() => irPara(indice + 1)}
              sx={{ width: TAMANHO_CONTROLE, height: TAMANHO_CONTROLE, flexShrink: 0 }}
            />
          </Stack>
        </Stack>

        <CarrosselCartoes
          itens={itens}
          valor={atual.id}
          visitados={visitados}
          onValor={selecionar}
          rotuloAcessivel="Cartões de gráficos"
          ocupado={ocupado}
        />
      </Stack>
    </Box>
  );
}
