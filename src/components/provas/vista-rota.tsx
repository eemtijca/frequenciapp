"use client";

// Modo Rota de uma prova: origem livre, melhor ordem das paradas e acompanhamento no aparelho.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  distanciaEmMetros,
  type LocalGravado,
  type PontoGeografico,
} from "@/domain/provas-especificas";
import {
  conciliarOrdem,
  montarParadas,
  rotuloDeDistancia,
  rotuloDeDuracao,
  urlNoGoogleMaps,
  urlNoWaze,
  type CriterioDaRota,
  type ParadaDaRota,
  type TrechoDesenhado,
  type TrechoMedido,
} from "@/domain/rota-da-prova";
import { corpoAlteracao, pedir } from "@/lib/api-cliente";
import {
  ErroDeLocalizacao,
  lerPosicaoDoAparelho,
  mensagemSemPosicao,
  PRECISAO_FRACA_METROS,
} from "@/lib/localizacao";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Alerta } from "@/components/ui/mui/alerta";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { GrupoOpcoes } from "@/components/ui/mui/grupo-opcoes";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { DialogoLocalDoAluno } from "@/components/provas/dialogo-local-aluno";
import { DialogoMapaLocal } from "@/components/provas/dialogo-mapa-local";
import { TOKENS_LAYOUT } from "@/theme/layout";

const MapaDaRota = lazy(() => import("@/components/provas/mapa-da-rota"));

interface Plano {
  origem: { texto: string; latitude: number; longitude: number } | null;
  criterio: CriterioDaRota | null;
  voltar: boolean | null;
  ordem: string[] | null;
  servicos: { ruas: boolean; enderecos: boolean };
}

interface Calculo {
  metodo: "exata" | "aproximada" | "manual";
  fonte: "ruas" | "reta";
  aviso: string | null;
  criterio: CriterioDaRota;
  voltar: boolean;
  origem: { texto: string; latitude: number; longitude: number };
  ordem: string[];
  trechos: TrechoMedido[];
  totais: {
    viagem: { distanciaMetros: number; duracaoSegundos: number };
    urbano: { distanciaMetros: number; duracaoSegundos: number };
    volta: { distanciaMetros: number; duracaoSegundos: number };
    geral: { distanciaMetros: number; duracaoSegundos: number };
  };
  geometria: TrechoDesenhado[];
}

interface Lugar {
  rotulo: string;
  latitude: number;
  longitude: number;
}

interface Props {
  provaId: string;
  prova: LocalGravado;
  participantes: Parameters<typeof montarParadas>[0];
  podeGravar: boolean;
  onDefinirPonto: (alunoIds: string[], local: LocalGravado) => Promise<void>;
  onMarcarPresentes: (alunoIds: string[]) => Promise<void>;
}

function chaveDeixados(provaId: string): string {
  return `frequenciapp.rota.deixados.${provaId}`;
}

function lerDeixados(provaId: string): string[] {
  try {
    const texto = localStorage.getItem(chaveDeixados(provaId));
    const valor: unknown = texto ? JSON.parse(texto) : [];
    return Array.isArray(valor) && valor.every((item) => typeof item === "string") ? valor : [];
  } catch {
    return [];
  }
}

function medida(trecho: { distanciaMetros: number; duracaoSegundos: number } | undefined): string {
  if (!trecho) return "";
  return `${rotuloDeDistancia(trecho.distanciaMetros)}, ${rotuloDeDuracao(trecho.duracaoSegundos)}`;
}

export function VistaRota({
  provaId,
  prova,
  participantes,
  podeGravar,
  onDefinirPonto,
  onMarcarPresentes,
}: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const grupos = useMemo(() => montarParadas(participantes, prova), [participantes, prova]);
  const [texto, setTexto] = useState("");
  const [ponto, setPonto] = useState<PontoGeografico | null>(null);
  const [criterio, setCriterio] = useState<CriterioDaRota>("tempo");
  const [voltar, setVoltar] = useState(false);
  const [servicos, setServicos] = useState({ ruas: false, enderecos: false });
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [mapaAberto, setMapaAberto] = useState(false);
  const [grupoDoPonto, setGrupoDoPonto] = useState<(typeof grupos.semCoordenada)[number] | null>(
    null,
  );
  const [acompanhando, setAcompanhando] = useState(false);
  const [posicao, setPosicao] = useState<PontoGeografico | null>(null);
  const [avisoGps, setAvisoGps] = useState("");
  const [deixados, setDeixados] = useState<string[]>(() => lerDeixados(provaId));
  const [pronto, setPronto] = useState(false);
  const ordemSalva = useRef<string[] | null>(null);
  const calculouAoAbrir = useRef(false);

  useEffect(() => {
    localStorage.setItem(chaveDeixados(provaId), JSON.stringify(deixados));
  }, [deixados, provaId]);

  useEffect(() => {
    if (!acompanhando) return;
    const geo = navigator.geolocation;
    if (!geo) return;
    const id = geo.watchPosition(
      (lida) => {
        setPosicao({ latitude: lida.coords.latitude, longitude: lida.coords.longitude });
        setAvisoGps("");
      },
      (erro) => {
        const motivo = erro.code === 1 ? "negada" : erro.code === 3 ? "demorou" : "indisponivel";
        setAvisoGps(mensagemSemPosicao(motivo));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => geo.clearWatch(id);
  }, [acompanhando]);

  function alternarAcompanhamento() {
    if (acompanhando) {
      setAcompanhando(false);
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setAvisoGps(mensagemSemPosicao("sem-suporte"));
      return;
    }
    if (!window.isSecureContext) {
      setAvisoGps(mensagemSemPosicao("conexao-insegura"));
      return;
    }
    setAvisoGps("");
    setAcompanhando(true);
  }

  async function calcular(ordem?: string[]) {
    if (texto.trim() === "") {
      avisarErro(null, { contexto: "Informe o endereço ou a cidade de partida." });
      return;
    }
    if (!ponto) {
      avisarErro(null, {
        contexto: "Marque o ponto de partida no mapa, pela busca ou pela posição do aparelho.",
      });
      return;
    }
    const corpo = {
      origem: { texto: texto.trim(), latitude: ponto.latitude, longitude: ponto.longitude },
      criterio,
      voltar,
      ...(ordem ? { ordem } : {}),
    };
    const dados = await pedir<Calculo>(`/api/provas/${provaId}/rota/calcular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setCalculo(dados);
  }

  const { executando: calculando, executar: pedirCalculo } = useAcaoUnica(async () => {
    try {
      await calcular();
    } catch (erro) {
      avisarErro(erro, { contexto: "Não foi possível calcular a rota." });
    }
  });

  const ordemPedida = useRef<string[] | null>(null);
  const { executando: reordenando, executar: aplicarOrdem } = useAcaoUnica(async () => {
    if (!ordemPedida.current) return;
    try {
      await calcular(ordemPedida.current);
    } catch (erro) {
      avisarErro(erro, { contexto: "Não foi possível atualizar a ordem." });
    }
  });

  const { executando: salvando, executar: salvar } = useAcaoUnica(async () => {
    if (!calculo || !ponto) return;
    try {
      await pedir(
        `/api/provas/${provaId}/rota`,
        corpoAlteracao("PUT", {
          origem: {
            texto: calculo.origem.texto,
            latitude: ponto.latitude,
            longitude: ponto.longitude,
          },
          criterio: calculo.criterio,
          voltar: calculo.voltar,
          ordem: calculo.ordem,
        }),
      );
      avisarSucesso("Ordem da rota salva nesta prova.");
    } catch (erro) {
      avisarErro(erro, { contexto: "Não foi possível salvar a ordem." });
    }
  });

  const { executando: buscando, executar: buscar } = useAcaoUnica(async () => {
    setLugares([]);
    try {
      const dados = await pedir<{ lugares: Lugar[] }>(
        `/api/provas/geocodificar?q=${encodeURIComponent(texto.trim())}`,
      );
      setLugares(dados.lugares);
      if (dados.lugares.length === 0) {
        avisarErro(null, { contexto: "Nenhum lugar encontrado para essa busca." });
      }
    } catch (erro) {
      avisarErro(erro, { contexto: "Não foi possível buscar o endereço." });
    }
  });

  const { executando: lendoGps, executar: usarGps } = useAcaoUnica(async () => {
    try {
      const lida = await lerPosicaoDoAparelho();
      setPonto({ latitude: lida.latitude, longitude: lida.longitude });
      if (texto.trim() === "") setTexto("Posição marcada no aparelho");
      const metros = Math.round(lida.precisaoMetros);
      avisarSucesso(
        lida.precisaoMetros > PRECISAO_FRACA_METROS
          ? `Precisão baixa, de cerca de ${metros} m. Ajuste o ponto no mapa.`
          : `Partida marcada com precisão de cerca de ${metros} m.`,
      );
    } catch (erro) {
      avisarErro(erro instanceof ErroDeLocalizacao ? erro : null, {
        contexto: mensagemSemPosicao("indisponivel"),
      });
    }
  });

  useEffect(() => {
    let ativo = true;
    pedir<Plano>(`/api/provas/${provaId}/rota`)
      .then((plano) => {
        if (!ativo) return;
        setServicos(plano.servicos);
        if (plano.criterio) setCriterio(plano.criterio);
        if (plano.voltar !== null) setVoltar(plano.voltar);
        ordemSalva.current = plano.ordem;
        if (plano.origem) {
          setTexto(plano.origem.texto);
          setPonto({ latitude: plano.origem.latitude, longitude: plano.origem.longitude });
        }
        setPronto(true);
      })
      .catch((erro) => {
        if (!ativo) return;
        setPronto(true);
        avisarErro(erro, { contexto: "Não foi possível ler a rota." });
      });
    return () => {
      ativo = false;
    };
  }, [avisarErro, provaId]);

  const calcularAtual = useRef(calcular);
  useEffect(() => {
    calcularAtual.current = calcular;
  });

  useEffect(() => {
    if (!pronto || calculouAoAbrir.current || !ponto || texto.trim() === "") return;
    if (grupos.paradas.length === 0) return;
    calculouAoAbrir.current = true;
    const salva = ordemSalva.current;
    const ordem = salva && salva.length > 0 ? conciliarOrdem(salva, grupos.paradas) : undefined;
    calcularAtual.current(ordem).catch((erro) => {
      avisarErro(erro, { contexto: "Não foi possível calcular a rota." });
    });
  }, [avisarErro, grupos.paradas, ponto, pronto, texto]);

  const ordemAtual = calculo?.ordem ?? [];
  const porChave = useMemo(
    () => new Map(grupos.paradas.map((parada) => [parada.chave, parada])),
    [grupos.paradas],
  );
  const paradasOrdenadas = ordemAtual
    .map((chave, indice) => {
      const parada = porChave.get(chave);
      return parada ? { ...parada, ordem: indice + 1 } : null;
    })
    .filter((parada): parada is ParadaDaRota & { ordem: number } => parada !== null);
  const deixadas = useMemo(() => new Set(deixados), [deixados]);
  const proxima = paradasOrdenadas.find((parada) => !deixadas.has(parada.chave)) ?? null;
  const distanciaProxima =
    acompanhando && posicao && proxima
      ? distanciaEmMetros(posicao, { latitude: proxima.latitude, longitude: proxima.longitude })
      : null;

  function mover(indice: number, destino: number) {
    if (destino < 0 || destino >= ordemAtual.length || indice === destino) return;
    const chaves = [...ordemAtual];
    const [item] = chaves.splice(indice, 1);
    if (!item) return;
    chaves.splice(destino, 0, item);
    ordemPedida.current = chaves;
    void aplicarOrdem();
  }

  const links =
    calculo && ponto
      ? urlNoGoogleMaps(
          ponto,
          paradasOrdenadas.map((parada) => ({
            latitude: parada.latitude,
            longitude: parada.longitude,
          })),
          calculo.voltar,
        )
      : null;

  const rotuloDoMetodo =
    calculo?.metodo === "exata"
      ? "Melhor rota"
      : calculo?.metodo === "aproximada"
        ? "Rota aproximada"
        : calculo?.metodo === "manual"
          ? "Ordem ajustada"
          : "";

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        A partida é o endereço ou a cidade informados aqui. O trajeto começa nesse ponto e a
        primeira parada é a melhor a partir dele.
      </Typography>
      <Campo id="rota-origem" rotulo="Partida">
        <CampoTexto
          valor={texto}
          onValor={setTexto}
          placeholder="Ex.: Mucambo, CE"
          maxLength={200}
          autoComplete="off"
        />
      </Campo>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Botao
          variante="contorno"
          disabled={!servicos.enderecos || texto.trim().length < 3 || buscando}
          carregando={buscando}
          onClick={() => void buscar()}
          sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
        >
          Buscar endereço
        </Botao>
        <Botao
          variante="contorno"
          icone={<PlaceRoundedIcon />}
          onClick={() => setMapaAberto(true)}
          sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
        >
          Ajustar no mapa
        </Botao>
        <Botao
          variante="contorno"
          icone={<MyLocationRoundedIcon />}
          disabled={lendoGps}
          carregando={lendoGps}
          onClick={() => void usarGps()}
          sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
        >
          Usar a posição do aparelho
        </Botao>
      </Stack>
      {!servicos.enderecos && pronto ? (
        <Typography variant="body2" color="text.secondary">
          A busca por endereço não está configurada. O mapa e a posição do aparelho continuam
          disponíveis.
        </Typography>
      ) : null}
      {lugares.length > 0 ? (
        <Stack component="ul" aria-label="Lugares encontrados" spacing={0.5} sx={{ m: 0, pl: 0 }}>
          {lugares.map((lugar) => (
            <Box
              component="li"
              key={`${lugar.latitude},${lugar.longitude},${lugar.rotulo}`}
              sx={{ listStyle: "none" }}
            >
              <Botao
                variante="texto"
                onClick={() => {
                  setTexto(lugar.rotulo);
                  setPonto({ latitude: lugar.latitude, longitude: lugar.longitude });
                  setLugares([]);
                }}
                sx={{
                  minHeight: TOKENS_LAYOUT.alvoToque,
                  justifyContent: "flex-start",
                  textAlign: "left",
                }}
              >
                {lugar.rotulo}
              </Botao>
            </Box>
          ))}
        </Stack>
      ) : null}
      <GrupoOpcoes
        rotulo="Critério da ordem"
        valor={criterio}
        onValor={setCriterio}
        opcoes={[
          { valor: "tempo", rotulo: "Menor tempo" },
          { valor: "distancia", rotulo: "Menor distância" },
        ]}
      />
      <Interruptor
        checked={voltar}
        onChange={setVoltar}
        rotulo="Voltar à partida"
        descricao="Inclui o retorno à origem no tempo total. Sem isso, a rota termina na última parada."
      />
      <Botao
        variante="principal"
        disabled={!ponto || calculando}
        carregando={calculando}
        onClick={() => void pedirCalculo()}
        sx={{ minHeight: TOKENS_LAYOUT.alvoToque, alignSelf: "flex-start" }}
      >
        Calcular melhor rota
      </Botao>
      {calculo?.aviso ? <Alerta severity="warning">{calculo.aviso}</Alerta> : null}
      {calculo ? (
        <Stack spacing={0.5}>
          <Typography variant="subtitle1" component="h3">
            {rotuloDoMetodo}
            {calculo.fonte === "reta" ? " em linha reta" : " por ruas"}
          </Typography>
          <Typography variant="body2">
            Total: {medida(calculo.totais.geral)}. Viagem até a primeira parada:{" "}
            {medida(calculo.totais.viagem)}. Entre paradas: {medida(calculo.totais.urbano)}
            {calculo.voltar ? `. Volta: ${medida(calculo.totais.volta)}` : ""}.
          </Typography>
        </Stack>
      ) : null}
      {calculo && ponto ? (
        <Suspense fallback={<Skeleton variant="rounded" height={280} />}>
          <MapaDaRota
            origem={ponto}
            paradas={paradasOrdenadas.map((parada) => ({
              chave: parada.chave,
              local: parada.local,
              latitude: parada.latitude,
              longitude: parada.longitude,
              ordem: parada.ordem,
              alunos: parada.alunos.length,
            }))}
            geometria={calculo.geometria}
            reta={
              calculo.fonte === "reta" ||
              calculo.geometria.every((trecho) => trecho.pontos.length <= 2)
            }
            proximaChave={proxima?.chave ?? null}
            deixadas={deixadas}
            posicao={acompanhando ? posicao : null}
            rotulo={`Rota com ${paradasOrdenadas.length} paradas a partir da partida`}
          />
        </Suspense>
      ) : null}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {podeGravar ? (
          <Botao
            variante="contorno"
            disabled={!calculo || salvando}
            carregando={salvando}
            onClick={() => void salvar()}
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
          >
            Salvar ordem
          </Botao>
        ) : null}
        <Botao
          variante={acompanhando ? "principal" : "contorno"}
          aria-pressed={acompanhando}
          disabled={!calculo}
          onClick={alternarAcompanhamento}
          sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
        >
          {acompanhando ? "Parar acompanhamento" : "Acompanhar no ônibus"}
        </Botao>
        {links ? (
          <Button
            component="a"
            href={links.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
          >
            {links.truncada ? "Abrir o começo no Google Maps" : "Abrir no Google Maps"}
          </Button>
        ) : null}
        {proxima ? (
          <Button
            component="a"
            href={urlNoWaze({ latitude: proxima.latitude, longitude: proxima.longitude })}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
          >
            Próxima parada no Waze
          </Button>
        ) : null}
      </Stack>
      {acompanhando ? (
        <Typography role="status" variant="body2">
          {avisoGps
            ? avisoGps
            : proxima && distanciaProxima !== null
              ? `Próxima parada: ${proxima.local}. Cerca de ${rotuloDeDistancia(distanciaProxima)} em linha reta.`
              : proxima
                ? `Próxima parada: ${proxima.local}. Aguardando a posição do aparelho.`
                : "Todas as paradas foram marcadas como deixadas."}
        </Typography>
      ) : null}
      <Stack component="ol" aria-label="Paradas da rota" spacing={1.5} sx={{ m: 0, pl: 3 }}>
        {paradasOrdenadas.map((parada, indice) => {
          const chegada = calculo?.trechos[indice];
          const deixada = deixadas.has(parada.chave);
          return (
            <Stack
              component="li"
              key={parada.chave}
              spacing={0.75}
              draggable
              onDragStart={(evento) => {
                evento.dataTransfer.setData("text/plain", String(indice));
                evento.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(evento) => evento.preventDefault()}
              onDrop={(evento) => {
                evento.preventDefault();
                const origemIndice = Number(evento.dataTransfer.getData("text/plain"));
                if (Number.isInteger(origemIndice)) mover(origemIndice, indice);
              }}
              sx={{
                border: 1,
                borderColor: parada.chave === proxima?.chave ? "warning.main" : "divider",
                borderRadius: 1,
                p: 1.5,
                opacity: deixada ? 0.7 : 1,
              }}
            >
              <Typography component="h3" variant="subtitle1">
                {parada.ordem}. {parada.local}
              </Typography>
              <Typography variant="body2">
                {parada.alunos.length === 1 ? "1 aluno" : `${parada.alunos.length} alunos`}
                {chegada ? `. Até aqui: ${medida(chegada)}` : ""}
                {deixada ? ". Deixados" : ""}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {parada.alunos.map((aluno) => aluno.nome).join(", ")}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Botao
                  variante="contorno"
                  tamanho="pequeno"
                  aria-label={`Subir ${parada.local}`}
                  disabled={indice === 0 || reordenando}
                  icone={<ArrowUpwardRoundedIcon />}
                  onClick={() => mover(indice, indice - 1)}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  Subir
                </Botao>
                <Botao
                  variante="contorno"
                  tamanho="pequeno"
                  aria-label={`Descer ${parada.local}`}
                  disabled={indice === paradasOrdenadas.length - 1 || reordenando}
                  icone={<ArrowDownwardRoundedIcon />}
                  onClick={() => mover(indice, indice + 1)}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  Descer
                </Botao>
                <Botao
                  variante="contorno"
                  tamanho="pequeno"
                  aria-pressed={deixada}
                  onClick={() =>
                    setDeixados((atual) =>
                      atual.includes(parada.chave)
                        ? atual.filter((chave) => chave !== parada.chave)
                        : [...atual, parada.chave],
                    )
                  }
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  {deixada ? "Desfazer deixados" : "Marcar deixados"}
                </Botao>
                {podeGravar ? (
                  <Botao
                    variante="contorno"
                    tamanho="pequeno"
                    onClick={() =>
                      void onMarcarPresentes(parada.alunos.map((aluno) => aluno.alunoId)).catch(
                        (erro) =>
                          avisarErro(erro, { contexto: "Não foi possível marcar a presença." }),
                      )
                    }
                    sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                  >
                    Marcar presentes
                  </Botao>
                ) : null}
              </Stack>
            </Stack>
          );
        })}
      </Stack>
      {grupos.semCoordenada.length > 0 ? (
        <Stack component="section" aria-label="Locais sem coordenada" spacing={1}>
          <Typography variant="subtitle1" component="h3">
            Sem coordenada
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Estes grupos ficam fora da rota até o ponto ser marcado.
          </Typography>
          {grupos.semCoordenada.map((grupo) => (
            <Stack key={grupo.chave} spacing={0.5}>
              <Typography variant="body2">
                {grupo.local ?? "Sem local"}:{" "}
                {grupo.alunos.length === 1 ? "1 aluno" : `${grupo.alunos.length} alunos`} (
                {grupo.alunos.map((aluno) => aluno.nome).join(", ")})
              </Typography>
              {podeGravar ? (
                <Botao
                  variante="contorno"
                  tamanho="pequeno"
                  onClick={() => setGrupoDoPonto(grupo)}
                  sx={{ alignSelf: "flex-start", minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  Definir ponto
                </Botao>
              ) : null}
            </Stack>
          ))}
        </Stack>
      ) : null}
      <DialogoMapaLocal
        aberto={mapaAberto}
        ponto={ponto}
        provaId={provaId}
        titulo="Partida da rota"
        descricao="Toque no mapa, ajuste o marcador ou use a posição do aparelho. Nada é gravado até salvar a ordem."
        rotuloMapa="Mapa da partida"
        onFechar={() => setMapaAberto(false)}
        onConfirmar={(escolhido) => {
          setMapaAberto(false);
          if (escolhido) setPonto(escolhido);
        }}
      />
      <DialogoLocalDoAluno
        aberto={grupoDoPonto !== null}
        alunos={grupoDoPonto?.alunos.length ?? 0}
        nome={grupoDoPonto?.alunos.length === 1 ? grupoDoPonto.alunos[0]?.nome : undefined}
        localInicial={grupoDoPonto?.local ?? null}
        pontoInicial={null}
        onFechar={() => setGrupoDoPonto(null)}
        onSalvar={async (local) => {
          if (!grupoDoPonto) return;
          await onDefinirPonto(
            grupoDoPonto.alunos.map((aluno) => aluno.alunoId),
            local,
          );
          setGrupoDoPonto(null);
        }}
      />
    </Stack>
  );
}
