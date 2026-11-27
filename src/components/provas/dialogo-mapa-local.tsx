"use client";

// Diálogo do mapa do local da prova: marcador por toque, GPS do aparelho e coordenadas digitadas.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  coordenadaDoTexto,
  LIMITE_LATITUDE,
  LIMITE_LONGITUDE,
  problemaNaCoordenada,
  resumoDaOcupacao,
  type OcupacaoDoLocal,
  type PontoGeografico,
} from "@/domain/provas-especificas";
import {
  ErroDeLocalizacao,
  lerPosicaoDoAparelho,
  mensagemSemPosicao,
  PRECISAO_FRACA_METROS,
} from "@/lib/localizacao";
import { pedir } from "@/lib/api-cliente";
import { formatarDiaCivil } from "@/lib/data-civil";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { DialogoPadrao } from "@/components/layout/dialogo-padrao";
import { TOKENS_LAYOUT } from "@/theme/layout";

const MapaDoLocal = lazy(() => import("@/components/provas/mapa-do-local"));

interface Props {
  aberto: boolean;
  /** Local já escolhido; nulo abre o mapa sem marcador. */
  ponto: PontoGeografico | null;
  /** Prova em edição: os alunos dela entram na contagem do lugar mesmo antes de salvar o ponto. */
  provaId: string | null;
  onFechar: () => void;
  /** Ponto confirmado, ou nulo quando a pessoa remove o local do mapa. */
  onConfirmar: (ponto: PontoGeografico | null) => void;
}

function coordenadaComoTexto(valor: number | undefined): string {
  return valor === undefined ? "" : valor.toFixed(6).replace(".", ",");
}

/** Mensagem do campo preenchido que não vale como coordenada; vazio não é erro. */
function erroDoCampo(
  texto: string,
  limite: number,
  nome: "latitude" | "longitude",
): string | undefined {
  if (texto.trim() === "") return undefined;
  const valor = coordenadaDoTexto(texto);
  if (valor === null)
    return `Informe um número, como ${nome === "latitude" ? "-3,7319" : "-38,5267"}.`;
  return problemaNaCoordenada(valor, limite, nome) ?? undefined;
}

/** Espera depois do último movimento do marcador antes de perguntar quantos alunos há no lugar. */
const ATRASO_DA_CONTAGEM_MS = 350;

export function DialogoMapaLocal({ aberto, ponto, provaId, onFechar, onConfirmar }: Props) {
  const [latitude, setLatitude] = useState(coordenadaComoTexto(ponto?.latitude));
  const [longitude, setLongitude] = useState(coordenadaComoTexto(ponto?.longitude));
  const [avisoDoGps, setAvisoDoGps] = useState("");
  const [avisoDoGpsEhErro, setAvisoDoGpsEhErro] = useState(false);

  const erroLatitude = erroDoCampo(latitude, LIMITE_LATITUDE, "latitude");
  const erroLongitude = erroDoCampo(longitude, LIMITE_LONGITUDE, "longitude");
  const escolhido = useMemo<PontoGeografico | null>(() => {
    const lat = coordenadaDoTexto(latitude);
    const lon = coordenadaDoTexto(longitude);
    if (lat === null || lon === null) return null;
    if (
      problemaNaCoordenada(lat, LIMITE_LATITUDE, "latitude") ||
      problemaNaCoordenada(lon, LIMITE_LONGITUDE, "longitude")
    )
      return null;
    return { latitude: lat, longitude: lon };
  }, [latitude, longitude]);

  // A resposta guarda a chave do ponto que a pediu: resposta de outro ponto não aparece.
  const [ocupacao, setOcupacao] = useState<{ chave: string; dados: OcupacaoDoLocal } | null>(null);
  const chaveDoPonto = escolhido ? `${escolhido.latitude},${escolhido.longitude}` : "";
  useEffect(() => {
    if (!escolhido) return;
    let atual = true;
    const espera = window.setTimeout(() => {
      const consulta = new URLSearchParams({
        latitude: String(escolhido.latitude),
        longitude: String(escolhido.longitude),
      });
      if (provaId) consulta.set("provaId", provaId);
      pedir<OcupacaoDoLocal>(`/api/provas/ocupacao?${consulta.toString()}`)
        .then((dados) => {
          if (atual) setOcupacao({ chave: chaveDoPonto, dados });
        })
        .catch(() => {
          // A contagem é um apoio: sem ela o mapa segue utilizável.
        });
    }, ATRASO_DA_CONTAGEM_MS);
    return () => {
      atual = false;
      window.clearTimeout(espera);
    };
  }, [escolhido, chaveDoPonto, provaId]);
  const doLugar = ocupacao && ocupacao.chave === chaveDoPonto ? ocupacao.dados : null;

  function escolherNoMapa(novo: PontoGeografico) {
    setLatitude(coordenadaComoTexto(novo.latitude));
    setLongitude(coordenadaComoTexto(novo.longitude));
    setAvisoDoGps("");
    setAvisoDoGpsEhErro(false);
  }

  const { executando: buscando, executar: usarGps } = useAcaoUnica(async () => {
    setAvisoDoGpsEhErro(false);
    setAvisoDoGps("Buscando a posição do aparelho...");
    try {
      const posicao = await lerPosicaoDoAparelho();
      setLatitude(coordenadaComoTexto(posicao.latitude));
      setLongitude(coordenadaComoTexto(posicao.longitude));
      const metros = Math.round(posicao.precisaoMetros);
      setAvisoDoGps(
        posicao.precisaoMetros > PRECISAO_FRACA_METROS
          ? `Precisão baixa, de cerca de ${metros} m. Arraste o marcador até o local exato.`
          : `Posição lida com precisão de cerca de ${metros} m. Confira o marcador no mapa.`,
      );
    } catch (excecao) {
      setAvisoDoGpsEhErro(true);
      setAvisoDoGps(
        excecao instanceof ErroDeLocalizacao ? excecao.message : mensagemSemPosicao("indisponivel"),
      );
    }
  });

  return (
    <DialogoPadrao
      aberto={aberto}
      onFechar={onFechar}
      titulo="Local da prova no mapa"
      descricao="Toque no mapa para marcar o local ou arraste o marcador. Em campo, a localização do aparelho coloca o marcador na posição atual."
      tamanho="grande"
      acoes={
        <>
          {ponto ? (
            <Botao
              variante="texto"
              type="button"
              onClick={() => onConfirmar(null)}
              sx={{ mr: "auto", color: "falta.texto" }}
            >
              Remover local do mapa
            </Botao>
          ) : null}
          <Botao variante="texto" type="button" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="principal"
            type="button"
            disabled={escolhido === null}
            onClick={() => escolhido && onConfirmar(escolhido)}
          >
            Usar este local
          </Botao>
        </>
      }
    >
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          useFlexGap
          sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
        >
          <Botao
            variante="contorno"
            icone={<MyLocationRoundedIcon />}
            carregando={buscando}
            disabled={buscando}
            onClick={() => void usarGps()}
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
          >
            Usar minha localização
          </Botao>
          {avisoDoGps ? (
            <Typography
              role={avisoDoGpsEhErro ? "alert" : "status"}
              variant="body2"
              sx={{
                color: avisoDoGpsEhErro ? "error.main" : "text.secondary",
                minWidth: 0,
                flex: 1,
              }}
            >
              {avisoDoGps}
            </Typography>
          ) : null}
        </Stack>

        <Suspense
          fallback={
            <Skeleton variant="rounded" height={320} role="status" aria-label="Carregando o mapa" />
          }
        >
          <MapaDoLocal
            ponto={escolhido}
            onEscolher={escolherNoMapa}
            rotulo="Mapa do local da prova"
            contagem={doLugar?.alunos ?? 0}
          />
        </Suspense>

        {doLugar ? (
          <Stack spacing={0.5} role="status" aria-live="polite">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {resumoDaOcupacao(doLugar)}
            </Typography>
            {doLugar.provas.length > 0 ? (
              <Box component="ul" sx={{ m: 0, pl: 2.5, color: "text.secondary" }}>
                {doLugar.provas.map((prova) => (
                  <Typography key={prova.id} component="li" variant="body2">
                    {prova.nome}
                    {prova.atual ? " (esta prova)" : ""}: {prova.alunos}{" "}
                    {prova.alunos === 1 ? "aluno" : "alunos"} em {formatarDiaCivil(prova.dia)}
                  </Typography>
                ))}
              </Box>
            ) : null}
          </Stack>
        ) : null}

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          }}
        >
          <Campo id="mapa-latitude" rotulo="Latitude" erro={erroLatitude}>
            <CampoTexto
              valor={latitude}
              onValor={(valor) => {
                setLatitude(valor);
                setAvisoDoGps("");
              }}
              placeholder="-3,7319"
              inputMode="decimal"
              maxLength={20}
            />
          </Campo>
          <Campo id="mapa-longitude" rotulo="Longitude" erro={erroLongitude}>
            <CampoTexto
              valor={longitude}
              onValor={(valor) => {
                setLongitude(valor);
                setAvisoDoGps("");
              }}
              placeholder="-38,5267"
              inputMode="decimal"
              maxLength={20}
            />
          </Campo>
        </Box>
      </Stack>
    </DialogoPadrao>
  );
}
