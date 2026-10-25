// Navegação diária: no domingo, hoje é o resumo da semana encerrada.
"use client";

import { useMemo, useState } from "react";
import { diaDeChamadaVizinho, rotuloDataCurta, ultimoDiaDeChamada } from "@/domain/frequencia";
import { semanaEncerrada } from "@/domain/resumo-semana";

interface Opcoes {
  diaCorrente: string;
  /** Último dia que a seta seguinte pode alcançar. */
  max: string;
  /** Dia explícito de um atalho. Quando existe, a tela não abre no resumo. */
  diaInicial?: string | null;
}

export function useNavegacaoDoDia({ diaCorrente, max, diaInicial = null }: Opcoes) {
  const semana = useMemo(() => semanaEncerrada(diaCorrente), [diaCorrente]);
  const [resumo, setResumo] = useState(() => diaInicial === null && semana !== null);
  const [dia, setDia] = useState(() => {
    if (diaInicial) return ultimoDiaDeChamada(diaInicial);
    const sabado = semana?.[semana.length - 1];
    return sabado ?? diaCorrente;
  });

  const rotuloResumo = useMemo(() => {
    const inicio = semana?.[0];
    const fim = semana?.[semana.length - 1];
    if (!inicio || !fim) return null;
    return `${rotuloDataCurta(inicio)} a ${rotuloDataCurta(fim)}`;
  }, [semana]);

  function escolherDia(proximo: string) {
    setResumo(false);
    setDia(proximo);
  }

  function voltarParaHoje() {
    if (semana) {
      setResumo(true);
      return;
    }
    setDia(diaCorrente);
  }

  function anterior() {
    if (resumo && semana) {
      const sabado = semana[semana.length - 1];
      if (sabado) {
        setResumo(false);
        setDia(sabado);
      }
      return;
    }
    setDia((atual) => diaDeChamadaVizinho(atual, -1));
  }

  function seguinte() {
    if (resumo) {
      setResumo(false);
      setDia(diaDeChamadaVizinho(diaCorrente, 1));
      return;
    }
    setDia((atual) => diaDeChamadaVizinho(atual, 1));
  }

  const proximo = resumo ? diaDeChamadaVizinho(diaCorrente, 1) : diaDeChamadaVizinho(dia, 1);

  return {
    dia,
    resumo,
    semana,
    rotuloResumo,
    escolherDia,
    voltarParaHoje,
    anterior,
    seguinte,
    seguinteDesabilitado: proximo > max,
    mostrarVoltar: semana ? !resumo : dia !== diaCorrente,
  };
}
