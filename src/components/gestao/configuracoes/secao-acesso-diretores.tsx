"use client";

// Parâmetros de acesso no rascunho: validade da palavra-chave, sessão do
// diretor, limites de tentativa, o que o diretor vê e o limite de risco.
import { useState } from "react";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import RemoveRedEyeRoundedIcon from "@mui/icons-material/RemoveRedEyeRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import {
  CATEGORIAS_DIRETOR,
  FAIXAS_PARAMETROS,
  ROTULOS_CATEGORIA_DIRETOR,
  type CategoriaDiretor,
  type ParametroNumerico,
  type ParametrosAcesso,
} from "@/domain/diretores";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Selo } from "@/components/ui/mui/selo";
import SecaoConfiguracao from "./secao-configuracao";

const GRUPOS = [
  {
    titulo: "Sessão e validade",
    icone: AccessTimeRoundedIcon,
    campos: ["validadePalavraDias", "sessaoDiretorHoras"],
  },
  {
    titulo: "Segurança da entrada",
    icone: LockRoundedIcon,
    campos: ["tentativasPorOrigem", "tentativasPorLogin", "janelaMinutos"],
  },
] as const satisfies readonly {
  titulo: string;
  icone: SvgIconComponent;
  campos: readonly ParametroNumerico[];
}[];

const GRUPO = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 2,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  margin: 0,
  minWidth: 0,
} as const;

const LEGENDA = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  paddingX: 1,
  fontWeight: 600,
} as const;

export default function SecaoAcessoDiretores({
  parametros,
  onMudar,
}: {
  parametros: ParametrosAcesso;
  onMudar: (parametros: ParametrosAcesso) => void;
}) {
  const [textos, setTextos] = useState<Partial<Record<ParametroNumerico, string>>>({});
  const [erro, setErro] = useState("");
  const [parametrosAnteriores, setParametrosAnteriores] = useState(parametros);

  if (parametrosAnteriores !== parametros) {
    setParametrosAnteriores(parametros);
    setTextos({});
    setErro("");
  }

  function alterarNumero(campo: ParametroNumerico, valor: string) {
    const faixa = FAIXAS_PARAMETROS[campo];
    const numero = Number(valor);
    if (
      valor.trim() === "" ||
      !/^\d+$/.test(valor) ||
      !Number.isInteger(numero) ||
      numero < faixa.minimo ||
      numero > faixa.maximo
    ) {
      setTextos((atual) => ({ ...atual, [campo]: valor }));
      setErro(`${faixa.rotulo}: informe um número inteiro de ${faixa.minimo} a ${faixa.maximo}.`);
      return;
    }
    setTextos((atual) => {
      const proximo = { ...atual };
      delete proximo[campo];
      return proximo;
    });
    setErro("");
    onMudar({ ...parametros, [campo]: numero });
  }

  function alternarCategoria(categoria: CategoriaDiretor, marcada: boolean) {
    const categorias = CATEGORIAS_DIRETOR.filter((item) =>
      item === categoria ? marcada : parametros.categoriasDiretor.includes(item),
    );
    onMudar({ ...parametros, categoriasDiretor: categorias });
  }

  return (
    <SecaoConfiguracao
      id="config-acesso-diretores"
      titulo="Acesso dos diretores de turma"
      descricao="Ajuste a validade, a segurança da entrada e o que os diretores de turma podem ver. As mudanças entram no rascunho."
      resumo={
        <>
          <Selo>Palavra por {parametros.validadePalavraDias} dias</Selo>
          <Selo>
            {parametros.categoriasDiretor.length}{" "}
            {parametros.categoriasDiretor.length === 1
              ? "categoria visível"
              : "categorias visíveis"}
          </Selo>
        </>
      }
    >
      <Box
        component="form"
        noValidate
        onSubmit={(evento) => evento.preventDefault()}
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {GRUPOS.map(({ titulo, icone: Icone, campos }) => (
          <Box key={titulo} component="fieldset" sx={GRUPO}>
            <Typography component="legend" variant="subtitle2" sx={LEGENDA}>
              <Icone fontSize="small" aria-hidden="true" /> {titulo}
            </Typography>
            {titulo === "Segurança da entrada" ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Limites para todos os perfis.
              </Typography>
            ) : null}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { sm: "1fr 1fr" } }}>
              {campos.map((campo) => {
                const faixa = FAIXAS_PARAMETROS[campo];
                return (
                  <Campo
                    key={campo}
                    id={`parametro-${campo}`}
                    rotulo={faixa.rotulo}
                    descricao={`${faixa.unidade} · ${faixa.minimo} a ${faixa.maximo}`}
                  >
                    <CampoTexto
                      id={`parametro-${campo}`}
                      valor={textos[campo] ?? String(parametros[campo])}
                      onValor={(valor) => alterarNumero(campo, valor)}
                      inputMode="numeric"
                    />
                  </Campo>
                );
              })}
            </Box>
          </Box>
        ))}
        <Box component="fieldset" sx={GRUPO}>
          <Typography component="legend" variant="subtitle2" sx={LEGENDA}>
            <RemoveRedEyeRoundedIcon fontSize="small" aria-hidden="true" /> O que o diretor vê
          </Typography>
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { sm: "1fr 1fr" } }}>
            {CATEGORIAS_DIRETOR.map((categoria) => (
              <FormControlLabel
                key={categoria}
                control={
                  <Checkbox
                    checked={parametros.categoriasDiretor.includes(categoria)}
                    disabled={categoria === "faltas"}
                    onChange={(evento) => alternarCategoria(categoria, evento.target.checked)}
                  />
                }
                label={ROTULOS_CATEGORIA_DIRETOR[categoria]}
                sx={(tema) => ({
                  minHeight: 48,
                  margin: 0,
                  paddingX: 1,
                  borderRadius: 2,
                  backgroundColor: `color-mix(in srgb, ${tema.vars.palette.text.primary} 5%, transparent)`,
                })}
              />
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Faltas sempre visíveis. Libere dados sensíveis apenas quando necessário.
          </Typography>
          <Box sx={{ borderTop: 1, borderColor: "divider", paddingTop: 2 }}>
            <Campo
              id="parametro-limiteRiscoPercentual"
              rotulo={FAIXAS_PARAMETROS.limiteRiscoPercentual.rotulo}
              descricao={`De ${FAIXAS_PARAMETROS.limiteRiscoPercentual.minimo} a ${FAIXAS_PARAMETROS.limiteRiscoPercentual.maximo}% dos dias com chamada.`}
            >
              <CampoTexto
                id="parametro-limiteRiscoPercentual"
                valor={textos.limiteRiscoPercentual ?? String(parametros.limiteRiscoPercentual)}
                onValor={(valor) => alterarNumero("limiteRiscoPercentual", valor)}
                inputMode="numeric"
              />
            </Campo>
          </Box>
        </Box>
        {erro ? (
          <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
        ) : null}
      </Box>
    </SecaoConfiguracao>
  );
}
