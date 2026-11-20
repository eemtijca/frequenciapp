"use client";

// Busca com Autocomplete, filtro sem acento e sem caixa, teclado e lista acessível.
import { useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
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
}

export function SelecionarBuscavel({
  id,
  valor,
  onValor,
  opcoes,
  placeholder,
  disabled,
  ariaLabel,
}: SelecionarBuscavelProps) {
  const campo = useCampo();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const idFinal = campo?.id ?? id;
  const desabilitado = disabled ?? campo?.disabled ?? false;
  const selecionada = useMemo(
    () => opcoes.find((opcao) => opcao.valor === valor) ?? null,
    [opcoes, valor],
  );

  // O próprio campo é a busca: abrir o teclado no celular não troca o foco nem fecha a lista.
  return (
    <Autocomplete
      id={idFinal}
      options={opcoes}
      value={selecionada ?? undefined}
      onChange={(_evento, nova) => onValor(nova?.valor ?? "")}
      getOptionLabel={(opcao) => opcao.rotulo}
      getOptionKey={(opcao) => opcao.valor}
      isOptionEqualToValue={(opcao, atual) => opcao.valor === atual.valor}
      filterOptions={(lista, estado) => filtrarOpcoes(lista, estado.inputValue)}
      inputValue={aberto ? termo : (selecionada?.rotulo ?? "")}
      onInputChange={(_evento, novo) => setTermo(novo)}
      open={aberto}
      onOpen={(evento) => {
        if (evento.type !== "change") setTermo("");
        setAberto(true);
      }}
      onClose={() => setAberto(false)}
      openOnFocus
      clearOnBlur={false}
      disableClearable
      fullWidth
      disabled={desabilitado}
      noOptionsText="Nenhuma opção encontrada."
      loadingText="Carregando opções"
      clearText="Limpar"
      closeText="Fechar"
      openText="Abrir"
      slotProps={{
        paper: { sx: { mt: 0.5 } },
        listbox: { sx: { maxHeight: 320 } },
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
      renderInput={(params) => (
        <TextField
          {...params}
          id={idFinal ?? params.id}
          placeholder={placeholder}
          error={Boolean(campo?.erro)}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps.htmlInput,
              "aria-label": ariaLabel ?? campo?.rotulo,
              "aria-describedby": campo?.descritoPor,
            },
          }}
        />
      )}
    />
  );
}
