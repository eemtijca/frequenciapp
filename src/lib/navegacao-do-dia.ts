// Navegação diária: no domingo, a semana encerrada vira o resumo da tela.
"use client";

import { useMemo, useState } from "react";
import {
  diaDeChamadaVizinho,
  diaSeguinte,
  ehDomingo,
  rotuloDataCurta,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { semanaEncerrada } from "@/domain/resumo-semana";

interface Opcoes {
  diaCorrente: string;
  /** Último dia que a seta seguinte pode alcançar. */
  max: string;
  /** Dia explícito de um atalho. Quando existe, a tela não abre no resumo. */
  diaInicial?: string | null;
  /** No Painel, Chamada e Saídas e Entradas, o domingo abre o resumo semanal. */
  domingoComoResumo?: boolean;
  /** Último domingo que pode abrir resumo. Padrão: diaCorrente. */
  resumoMax?: string;
}

export function useNavegacaoDoDia({
  diaCorrente,
  max,
  diaInicial = null,
  domingoComoResumo = false,
  resumoMax = diaCorrente,
}: Opcoes) {
  const semanaInicial = useMemo(
    () =>
      domingoComoResumo && diaInicial === null && ehDomingo(diaCorrente)
        ? semanaEncerrada(diaCorrente)
        : null,
    [diaCorrente, diaInicial, domingoComoResumo],
  );
  const [domingo, setDomingo] = useState<string | null>(() => (semanaInicial ? diaCorrente : null));
  const [dia, setDia] = useState(() => {
    if (diaInicial) return ultimoDiaDeChamada(diaInicial);
    const sabado = semanaInicial?.[semanaInicial.length - 1];
    return sabado ?? diaCorrente;
  });

  const semana = useMemo(() => (domingo ? semanaEncerrada(domingo) : null), [domingo]);
  const resumo = domingo !== null;

  const rotuloResumo = useMemo(() => {
    const inicio = semana?.[0];
    const fim = semana?.[semana.length - 1];
    if (!inicio || !fim) return null;
    return `${rotuloDataCurta(inicio)} a ${rotuloDataCurta(fim)}`;
  }, [semana]);

  const hojeAtivo = ehDomingo(diaCorrente)
    ? resumo && domingo === diaCorrente
    : !resumo && dia === diaCorrente;

  function abrirDomingo(proximo: string) {
    setDomingo(proximo);
  }

  function escolherDia(proximo: string) {
    if (domingoComoResumo && ehDomingo(proximo) && proximo <= resumoMax) {
      abrirDomingo(proximo);
      return;
    }
    setDomingo(null);
    if (ehDomingo(proximo)) {
      setDia(domingoComoResumo ? diaSeguinte(proximo, 1) : ultimoDiaDeChamada(proximo));
      return;
    }
    setDia(proximo);
  }

  function voltarParaHoje() {
    if (ehDomingo(diaCorrente)) {
      abrirDomingo(diaCorrente);
      return;
    }
    setDomingo(null);
    setDia(diaCorrente);
  }

  function irPara(proximo: string, direcao: 1 | -1) {
    if (domingoComoResumo && ehDomingo(proximo)) {
      if (proximo <= resumoMax) {
        abrirDomingo(proximo);
        return;
      }
      setDomingo(null);
      setDia(diaSeguinte(proximo, direcao));
      return;
    }
    setDomingo(null);
    setDia(proximo);
  }

  function anterior() {
    if (resumo && semana) {
      const sabado = semana[semana.length - 1];
      if (sabado) {
        setDomingo(null);
        setDia(sabado);
      }
      return;
    }
    irPara(domingoComoResumo ? diaSeguinte(dia, -1) : diaDeChamadaVizinho(dia, -1), -1);
  }

  function seguinte() {
    if (resumo) {
      const proximo = diaSeguinte(domingo ?? diaCorrente, 1);
      setDomingo(null);
      setDia(proximo);
      return;
    }
    irPara(domingoComoResumo ? diaSeguinte(dia, 1) : diaDeChamadaVizinho(dia, 1), 1);
  }

  const proximo = resumo
    ? diaSeguinte(domingo ?? diaCorrente, 1)
    : domingoComoResumo
      ? diaSeguinte(dia, 1)
      : diaDeChamadaVizinho(dia, 1);

  return {
    dia,
    domingo,
    resumo,
    semana,
    rotuloResumo,
    escolherDia,
    voltarParaHoje,
    anterior,
    seguinte,
    seguinteDesabilitado: proximo > max,
    hojeAtivo,
    mostrarVoltar: !hojeAtivo,
  };
}
