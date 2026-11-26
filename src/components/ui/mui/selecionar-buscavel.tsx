"use client";

// Busca com Autocomplete, filtro sem acento e sem caixa, teclado e lista acessível.
import { useId, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { normalizar } from "@/domain/frequencia";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { useCampo } from "./campo";
import type { OpcaoSelecionar } from "./selecionar";

export function filtrarOpcoes(opcoes: OpcaoSelecionar[], termo: string): OpcaoSelecionar[] {
  const alvo = normalizar(termo);
  if (!alvo) return [...opcoes];
  return opcoes.filter((opcao) => normalizar(opcao.rotulo).includes(alvo));
}

export interface SelecionarBuscavelProps {
  id?: string;
  valor: string;
  onValor: (valor: string) => void;
  opcoes: OpcaoSelecionar[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  quebrarRotulosDasOpcoes?: boolean;
  /** Exibe também o valor integral fora da caixa de busca de linha única. */
  mostrarRotuloSelecionado?: boolean;
}

export function SelecionarBuscavel({
  id,
  valor,
  onValor,
  opcoes,
  placeholder,
  disabled,
  ariaLabel,
  quebrarRotulosDasOpcoes = false,
  mostrarRotuloSelecionado = false,
}: SelecionarBuscavelProps) {
  const campo = useCampo();
  const idSelecao = useId();
  const idFinal = campo?.id ?? id;
  const desabilitado = disabled ?? campo?.disabled ?? false;
  const selecionada = useMemo(
    () => opcoes.find((opcao) => opcao.valor === valor) ?? null,
    [opcoes, valor],
  );
  const rotuloSelecionado = selecionada?.rotulo ?? "";
  const chaveSelecionada = `${selecionada?.valor ?? ""}\u0000${rotuloSelecionado}`;
  // O texto digitado vale enquanto a seleção não mudar; a troca externa
  // (por exemplo, ao limpar o formulário) volta ao rótulo atual sem efeito.
  const [edicao, setEdicao] = useState<{ chave: string; texto: string } | null>(null);
  const texto = edicao?.chave === chaveSelecionada ? edicao.texto : rotuloSelecionado;
  // No repouso o próprio valor do combobox já anuncia a seleção.
  const descreverSelecao =
    mostrarRotuloSelecionado && rotuloSelecionado !== "" && texto !== rotuloSelecionado;

  // O próprio campo é a busca: abrir o teclado no celular não troca o foco nem fecha a lista.
  const campoDeBusca = (
    <Autocomplete
      id={idFinal}
      options={opcoes}
      value={selecionada ?? undefined}
      onChange={(_evento, nova) => {
        setEdicao(null);
        onValor(nova?.valor ?? "");
      }}
      inputValue={texto}
      onInputChange={(_evento, novo, motivo) => {
        if (motivo === "input") setEdicao({ chave: chaveSelecionada, texto: novo });
        else if (motivo === "reset") setEdicao(null);
      }}
      onClose={
        mostrarRotuloSelecionado
          ? (_evento, motivo) => {
              if (motivo === "escape") setEdicao(null);
            }
          : undefined
      }
      getOptionLabel={(opcao) => opcao.rotulo}
      getOptionKey={(opcao) => opcao.valor}
      isOptionEqualToValue={(opcao, atual) => opcao.valor === atual.valor}
      filterOptions={(lista, estado) => filtrarOpcoes(lista, estado.inputValue)}
      openOnFocus
      selectOnFocus
      clearOnBlur={false}
      disableClearable
      fullWidth
      disabled={desabilitado}
      noOptionsText="Nenhuma opção encontrada."
      clearText="Limpar"
      closeText="Fechar"
      openText="Abrir"
      slotProps={{
        paper: { sx: { mt: 0.5 } },
        listbox: {
          "aria-label": "Opções",
          sx: {
            maxHeight: 320,
            ...(quebrarRotulosDasOpcoes && {
              "& .MuiAutocomplete-option": { whiteSpace: "normal", overflowWrap: "anywhere" },
            }),
          },
        },
      }}
      sx={(tema) => ({
        width: "100%",
        "& .MuiOutlinedInput-root": {
          minHeight: TOKENS_LAYOUT.campo.medio,
          borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
        },
        "& .MuiOutlinedInput-notchedOutline": {
          borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
        },
        "& .MuiOutlinedInput-root.Mui-focused": {
          boxShadow: `0 0 0 ${TOKENS_LAYOUT.campo.foco}px color-mix(in srgb, ${tema.vars.palette.primary.main} 24%, transparent)`,
        },
      })}
      renderInput={(params) => {
        const htmlInput = params.slotProps.htmlInput;
        const idsDescricao = [htmlInput["aria-describedby"], campo?.descritoPor]
          .filter(Boolean)
          .join(" ")
          .split(/\s+/)
          .filter(Boolean);
        if (descreverSelecao) idsDescricao.push(idSelecao);
        return (
          <TextField
            {...params}
            id={idFinal ?? params.id}
            placeholder={placeholder}
            error={Boolean(campo?.erro)}
            onBlur={mostrarRotuloSelecionado ? () => setEdicao(null) : undefined}
            slotProps={{
              ...params.slotProps,
              htmlInput: {
                ...htmlInput,
                "aria-label": ariaLabel ?? campo?.rotulo,
                "aria-describedby": [...new Set(idsDescricao)].join(" ") || undefined,
              },
            }}
          />
        );
      }}
    />
  );

  if (!mostrarRotuloSelecionado) return campoDeBusca;

  return (
    <>
      {campoDeBusca}
      {rotuloSelecionado ? (
        <Typography
          aria-hidden="true"
          variant="caption"
          sx={{ mt: 0.5, color: "text.secondary", overflowWrap: "anywhere" }}
        >
          {rotuloSelecionado}
        </Typography>
      ) : null}
      {descreverSelecao ? (
        <span id={idSelecao} hidden>
          Opção selecionada: {rotuloSelecionado}
        </span>
      ) : null}
    </>
  );
}
