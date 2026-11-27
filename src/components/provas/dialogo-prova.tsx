"use client";

// Diálogo de cadastro e edição de uma prova específica: nome, local opcional e data.
import { useId, useState } from "react";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import dayjs, { type Dayjs } from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useReduzirAnimacoesDosSeletores } from "@/theme/animacoes-da-interface";
import {
  LIMITE_LOCAL_PROVA_ESPECIFICA,
  LIMITE_NOME_PROVA_ESPECIFICA,
  normalizarProvaEspecifica,
  problemaNaProvaEspecifica,
  rotuloDasCoordenadas,
  type PontoGeografico,
  type ProvaEspecifica,
} from "@/domain/provas-especificas";
import { corpoAlteracao, corpoJson, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { deDiaCivil, paraDiaCivil } from "@/lib/data-civil";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { Campo, useCampo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { DialogoPadrao } from "@/components/layout/dialogo-padrao";
import { DialogoMapaLocal } from "@/components/provas/dialogo-mapa-local";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  aberto: boolean;
  /** Prova em edição; nulo cadastra uma nova. */
  prova: Pick<ProvaEspecifica, "id" | "nome" | "local" | "latitude" | "longitude" | "dia"> | null;
  diaCorrente: string;
  onFechar: () => void;
  /** Chamado depois de gravar, com o id da prova cadastrada ou editada. */
  onSalvo: (id: string) => void;
}

function comoDia(dia: string): Dayjs | null {
  const data = deDiaCivil(dia);
  return data ? dayjs(data) : null;
}

const TEXTO_INVISIVEL = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/** Data civil da prova em DatePicker, ligada ao Campo; aceita qualquer dia, inclusive domingo. */
function SeletorDataDaProva({
  id,
  valor,
  disabled,
  onValor,
}: {
  id: string;
  valor: string;
  disabled: boolean;
  onValor: (valor: string) => void;
}) {
  const campo = useCampo();
  const reduzirAnimacoes = useReduzirAnimacoesDosSeletores();
  return (
    <DatePicker
      reduceAnimations={reduzirAnimacoes}
      value={comoDia(valor)}
      onChange={(novo) => {
        const convertido = paraDiaCivil(novo?.toDate() ?? null);
        if (convertido) onValor(convertido);
      }}
      format="DD/MM/YYYY"
      disabled={disabled}
      label="Data"
      slotProps={{
        textField: {
          id,
          fullWidth: true,
          error: Boolean(campo?.erro),
          slotProps: {
            htmlInput: { "aria-describedby": campo?.descritoPor },
            ...(campo ? { input: { notched: false }, inputLabel: { sx: TEXTO_INVISIVEL } } : {}),
          },
          sx: {
            width: "100%",
            "& .MuiPickersOutlinedInput-root": {
              minHeight: TOKENS_LAYOUT.campo.medio,
              borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
            },
            "& .MuiPickersOutlinedInput-notchedOutline": {
              borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
            },
          },
        },
        openPickerButton: {
          sx: { width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque },
        },
        actionBar: { sx: { "& .MuiButton-root": { minHeight: TOKENS_LAYOUT.alvoToque } } },
      }}
      sx={{ width: "100%" }}
    />
  );
}

export function DialogoProva({ aberto, prova, diaCorrente, onFechar, onSalvo }: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const base = useId();
  const [nome, setNome] = useState(prova?.nome ?? "");
  const [local, setLocal] = useState(prova?.local ?? "");
  const [dia, setDia] = useState(prova?.dia ?? diaCorrente);
  const [ponto, setPonto] = useState<PontoGeografico | null>(
    prova && prova.latitude !== null && prova.longitude !== null
      ? { latitude: prova.latitude, longitude: prova.longitude }
      : null,
  );
  const [mapaAberto, setMapaAberto] = useState(false);
  // Uma instância nova a cada abertura reinicia os campos do mapa a partir do ponto atual.
  const [aberturasDoMapa, setAberturasDoMapa] = useState(0);
  const [erro, setErro] = useState("");

  const { executando, executar } = useAcaoUnica(async () => {
    const dados = normalizarProvaEspecifica({
      nome,
      local,
      dia,
      latitude: ponto?.latitude ?? null,
      longitude: ponto?.longitude ?? null,
    });
    const problema = problemaNaProvaEspecifica(dados);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    try {
      if (prova) {
        await pedir(`/api/provas/${prova.id}`, corpoAlteracao("PATCH", dados));
        avisarSucesso("Prova atualizada.");
        onSalvo(prova.id);
      } else {
        const { prova: criada } = await pedir<{ prova: ProvaEspecifica }>(
          "/api/provas",
          corpoJson(dados),
        );
        avisarSucesso("Prova cadastrada.", "Agora é possível adicionar os alunos.");
        onSalvo(criada.id);
      }
    } catch (excecao) {
      avisarErro(excecao, {
        contexto: prova
          ? "Não foi possível atualizar a prova."
          : "Não foi possível cadastrar a prova.",
      });
    }
  });

  return (
    <DialogoPadrao
      aberto={aberto}
      onFechar={() => {
        if (!executando) onFechar();
      }}
      titulo={prova ? "Editar prova" : "Nova prova"}
      descricao="O nome e o local aparecem na lista de provas. A data pode ser passada, para registrar depois."
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
            {prova ? "Salvar" : "Cadastrar prova"}
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
        <div style={{ display: "grid", gap: 16 }}>
          <Campo id={`${base}-nome`} rotulo="Nome da prova">
            <CampoTexto
              valor={nome}
              onValor={(valor) => {
                setNome(valor);
                setErro("");
              }}
              maxLength={LIMITE_NOME_PROVA_ESPECIFICA}
              placeholder="Ex.: Enem 2026, Vestibular UFC"
              disabled={executando}
            />
          </Campo>
          <Campo id={`${base}-local`} rotulo="Local da prova (opcional)">
            <CampoTexto
              valor={local}
              onValor={(valor) => {
                setLocal(valor);
                setErro("");
              }}
              maxLength={LIMITE_LOCAL_PROVA_ESPECIFICA}
              placeholder="Ex.: Escola Estadual Central, sala 4"
              disabled={executando}
            />
          </Campo>
          <Stack spacing={1} role="group" aria-labelledby={`${base}-mapa`}>
            <Typography id={`${base}-mapa`} variant="body2" sx={{ fontWeight: 600 }}>
              Local no mapa (opcional)
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {ponto
                ? `Marcado em ${rotuloDasCoordenadas(ponto.latitude, ponto.longitude)}.`
                : "Nenhum ponto marcado. O mapa usa o OpenStreetMap e pode ler o GPS do aparelho."}
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
          <Campo id={`${base}-dia`} rotulo="Data">
            <SeletorDataDaProva
              id={`${base}-dia`}
              valor={dia}
              disabled={executando}
              onValor={(valor) => {
                setDia(valor);
                setErro("");
              }}
            />
          </Campo>
          {erro ? (
            <AlertaCompacto variante="dados_invalidos" titulo={erro} tamanho="linha" />
          ) : null}
        </div>
      </form>
      <DialogoMapaLocal
        key={aberturasDoMapa}
        aberto={mapaAberto}
        ponto={ponto}
        provaId={prova?.id ?? null}
        onFechar={() => setMapaAberto(false)}
        onConfirmar={(novo) => {
          setPonto(novo);
          setMapaAberto(false);
        }}
      />
    </DialogoPadrao>
  );
}
