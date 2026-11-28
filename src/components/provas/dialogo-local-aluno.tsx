"use client";

// Local próprio de um ou mais alunos da prova: texto, ponto opcional e volta à herança.
import { useId, useState } from "react";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  LIMITE_LOCAL_PROVA_ESPECIFICA,
  normalizarLocalDoAluno,
  problemaNoLocalDoAluno,
  rotuloDasCoordenadas,
  type LocalGravado,
  type PontoGeografico,
} from "@/domain/provas-especificas";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { DialogoPadrao } from "@/components/layout/dialogo-padrao";
import { DialogoMapaLocal } from "@/components/provas/dialogo-mapa-local";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  aberto: boolean;
  /** Um aluno mostra o nome; vários recebem o mesmo local. */
  alunos: number;
  nome?: string;
  localInicial: string | null;
  pontoInicial: PontoGeografico | null;
  onFechar: () => void;
  onSalvar: (local: LocalGravado) => Promise<void>;
}

export function DialogoLocalDoAluno({
  aberto,
  alunos,
  nome,
  localInicial,
  pontoInicial,
  onFechar,
  onSalvar,
}: Props) {
  const base = useId();
  const [local, setLocal] = useState(localInicial ?? "");
  const [ponto, setPonto] = useState<PontoGeografico | null>(pontoInicial);
  const [mapaAberto, setMapaAberto] = useState(false);
  const [aberturasDoMapa, setAberturasDoMapa] = useState(0);
  const [erro, setErro] = useState("");

  const titulo =
    alunos === 1 && nome
      ? `Local de ${nome}`
      : alunos === 1
        ? "Local do aluno selecionado"
        : `Local de ${alunos} alunos`;
  const descricao =
    alunos === 1
      ? "Em branco, o aluno usa o local da prova. O ponto no mapa é opcional e vale só para este local."
      : "O local informado substitui o de cada aluno selecionado. Em branco, eles voltam a usar o local da prova.";

  const { executando, executar } = useAcaoUnica(async () => {
    const dados = normalizarLocalDoAluno({
      local,
      latitude: ponto?.latitude ?? null,
      longitude: ponto?.longitude ?? null,
    });
    const problema = problemaNoLocalDoAluno(dados);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    await onSalvar(dados);
  });

  return (
    <DialogoPadrao
      aberto={aberto}
      onFechar={() => {
        if (!executando) onFechar();
      }}
      titulo={titulo}
      descricao={descricao}
      acoes={
        <>
          <Botao variante="texto" type="button" disabled={executando} onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="principal"
            type="submit"
            form={`${base}-formulario`}
            carregando={executando}
            disabled={executando}
          >
            Salvar local
          </Botao>
        </>
      }
    >
      <form
        id={`${base}-formulario`}
        onSubmit={(evento) => {
          evento.preventDefault();
          void executar();
        }}
      >
        <Stack spacing={2}>
          <Campo id={`${base}-local`} rotulo="Local do aluno">
            <CampoTexto
              valor={local}
              onValor={(valor) => {
                setLocal(valor);
                setErro("");
              }}
              maxLength={LIMITE_LOCAL_PROVA_ESPECIFICA}
              placeholder="Ex.: Campus Betânia"
              disabled={executando}
            />
          </Campo>
          <Stack spacing={1} role="group" aria-labelledby={`${base}-mapa`}>
            <Typography id={`${base}-mapa`} variant="body2" sx={{ fontWeight: 600 }}>
              Ponto no mapa (opcional)
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {ponto
                ? `Marcado em ${rotuloDasCoordenadas(ponto.latitude, ponto.longitude)}.`
                : "Sem ponto próprio, o mapa não usa o ponto da prova quando o texto do local é outro."}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Botao
                variante="contorno"
                type="button"
                icone={<PlaceRoundedIcon />}
                disabled={executando}
                onClick={() => {
                  setAberturasDoMapa((atual) => atual + 1);
                  setMapaAberto(true);
                }}
                sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
              >
                {ponto ? "Alterar no mapa" : "Marcar no mapa"}
              </Botao>
              {ponto ? (
                <Botao
                  variante="texto"
                  type="button"
                  disabled={executando}
                  onClick={() => setPonto(null)}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque, color: "falta.texto" }}
                >
                  Remover do mapa
                </Botao>
              ) : null}
            </Stack>
          </Stack>
          {erro ? (
            <AlertaCompacto variante="dados_invalidos" titulo={erro} tamanho="linha" />
          ) : null}
        </Stack>
      </form>
      <DialogoMapaLocal
        key={aberturasDoMapa}
        aberto={mapaAberto}
        ponto={ponto}
        provaId={null}
        titulo="Local do aluno no mapa"
        descricao="Toque no mapa para marcar o local deste aluno ou arraste o marcador. O ponto só é gravado ao salvar o local."
        rotuloMapa="Mapa do local do aluno"
        onFechar={() => setMapaAberto(false)}
        onConfirmar={(novo) => {
          setPonto(novo);
          setMapaAberto(false);
          setErro("");
        }}
      />
    </DialogoPadrao>
  );
}
