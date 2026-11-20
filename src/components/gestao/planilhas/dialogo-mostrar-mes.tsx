"use client";

// Acesso direto aos meses preparados e transferência conferida das abas antigas.
import { useState } from "react";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { rotuloMes } from "@/domain/frequencia";
import {
  chaveResolucaoAntiga,
  type PreviaAntiga,
  type ResolucaoAntiga,
} from "@/domain/planilha-legado";
import { PendenciasAbaAntiga } from "./pendencias-aba-antiga";
import { IndiceChamadas } from "./indice-chamadas";
import { corpoJson, pedir, ErroApi } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { Selecionar } from "@/components/ui/mui/selecionar";

interface Catalogo {
  abas: { aba: string; mes: string; url: string; oculta: boolean }[];
  legadas: { aba: string }[];
}
interface Previa extends PreviaAntiga {
  planoHash: string;
}
interface Conferencia {
  aba: string;
  previa?: Previa;
  erro?: string;
  concluida?: boolean;
  resolucoes?: ResolucaoAntiga[];
  alterada?: boolean;
}

function temComplementos(previa: Previa): boolean {
  return Boolean(
    previa.complementos &&
    previa.complementos.formulas + previa.complementos.notas + previa.complementos.totais > 0,
  );
}

const CAIXA = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  padding: 2,
  minWidth: 0,
} as const;

export function DialogoMostrarMes({
  mesAtual,
  disabled,
  onAtualizar,
}: {
  mesAtual: string;
  disabled?: boolean;
  onAtualizar: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [mes, setMes] = useState(mesAtual);
  const [mensagem, setMensagem] = useState("");
  const [conferencias, setConferencias] = useState<Conferencia[] | null>(null);
  const [andamento, setAndamento] = useState("");
  const [descartarComplementos, setDescartarComplementos] = useState(false);
  const [senha, setSenha] = useState("");
  const [abasAntigasAbertas, setAbasAntigasAbertas] = useState(false);
  const acoes = useAcoesPorChave();
  const ocupado = acoes.chaveAtiva !== null;
  async function executar(
    tipo: "abrir" | "liberar" | "conferir" | "rever" | "aplicar",
    aba?: string,
  ) {
    return acoes.executar("meses", async () => {
      setMensagem("");
      try {
        if (tipo === "abrir") {
          setDescartarComplementos(false);
          setSenha("");
          setCatalogo(null);
          setConferencias(null);
          setAberto(true);
          const dados = await pedir<Catalogo>("/api/planilha/mensal/visibilidade");
          setCatalogo(dados);
          setMes(
            dados.abas.some((item) => item.mes === mesAtual)
              ? mesAtual
              : (dados.abas[0]?.mes ?? mesAtual),
          );
        }
        if (tipo === "liberar") {
          const resultado = await pedir<{ avisoIndice?: string }>(
            "/api/planilha/mensal/visibilidade",
            corpoJson({ mes }),
          );
          setCatalogo(await pedir<Catalogo>("/api/planilha/mensal/visibilidade"));
          setMensagem(
            resultado.avisoIndice
              ? `Todos os meses preparados estão acessíveis. ${resultado.avisoIndice}`
              : "Todos os meses preparados estão acessíveis.",
          );
          await onAtualizar();
        }
        if (tipo === "conferir" || tipo === "rever") {
          setDescartarComplementos(false);
          setSenha("");
          const resultados: Conferencia[] =
            tipo === "rever"
              ? [...(conferencias ?? [])]
              : (catalogo?.legadas ?? []).map((antiga) => ({ aba: antiga.aba }));
          for (const [indice, antiga] of resultados.entries()) {
            if (tipo === "rever" && antiga.aba !== aba) continue;
            setAndamento(antiga.aba);
            try {
              const dados = await pedir<{ previa: Previa }>(
                "/api/planilha/mensal/legado",
                corpoJson({ aba: antiga.aba, resolucoes: antiga.resolucoes ?? [] }),
              );
              resultados[indice] = {
                aba: antiga.aba,
                previa: dados.previa,
                resolucoes: antiga.resolucoes,
              };
            } catch (erro) {
              resultados[indice] = {
                aba: antiga.aba,
                resolucoes: antiga.resolucoes,
                erro: mensagemAmigavel(erro, "Não foi possível conferir esta aba."),
              };
            }
            setConferencias([...resultados]);
          }
        }
        if (tipo === "aplicar") {
          const resultados = [...(conferencias ?? [])];
          for (const [indice, item] of resultados.entries()) {
            if (
              !item.previa ||
              item.concluida ||
              item.erro ||
              item.alterada ||
              item.previa.totalPendencias > 0
            )
              continue;
            const descartar = temComplementos(item.previa);
            if (descartar && (!descartarComplementos || !senha)) continue;
            if (item.previa.resolucoesAplicadas > 0 && !senha) continue;
            setAndamento(item.aba);
            try {
              await pedir(
                "/api/planilha/mensal/legado",
                corpoJson({
                  aba: item.aba,
                  planoHash: item.previa.planoHash,
                  resolucoes: item.resolucoes ?? [],
                  ...(descartar ? { descartarComplementos: true } : {}),
                  ...(descartar || item.previa.resolucoesAplicadas > 0 ? { senha } : {}),
                }),
              );
              resultados[indice] = { ...item, concluida: true };
            } catch (erro) {
              if (erro instanceof ErroApi && [400, 401, 403, 429].includes(erro.status)) {
                setMensagem(mensagemAmigavel(erro, "Não foi possível confirmar a retirada."));
                break;
              }
              resultados[indice] = {
                ...item,
                previa: undefined,
                erro: mensagemAmigavel(
                  erro,
                  "Resultado não confirmado. Confira a planilha antes de tentar novamente.",
                ),
              };
            }
            setConferencias([...resultados]);
          }
          setCatalogo(await pedir<Catalogo>("/api/planilha/mensal/visibilidade"));
          await onAtualizar();
        }
      } catch (erro) {
        setMensagem(mensagemAmigavel(erro, "Não foi possível conferir os meses agora."));
      } finally {
        if (tipo === "aplicar") setSenha("");
        setAndamento("");
      }
    });
  }
  const meses = [...new Set(catalogo?.abas.map((item) => item.mes) ?? [])];
  const prontas =
    conferencias?.filter(
      (item) =>
        item.previa &&
        !item.erro &&
        !item.concluida &&
        !item.alterada &&
        !(item.previa.totalPendencias > 0) &&
        (!temComplementos(item.previa) || (descartarComplementos && Boolean(senha))) &&
        (!item.previa.resolucoesAplicadas || Boolean(senha)),
    ).length ?? 0;
  const revisadas =
    conferencias?.filter(
      (item) =>
        item.previa &&
        !item.erro &&
        !item.concluida &&
        !item.alterada &&
        !(item.previa.totalPendencias > 0),
    ) ?? [];
  const comComplementos = revisadas.some((item) => item.previa && temComplementos(item.previa));
  const comEscolhas = revisadas.some((item) => (item.previa?.resolucoesAplicadas ?? 0) > 0);
  function escolher(aba: string, escolhas: ResolucaoAntiga[], remover?: string) {
    setSenha("");
    setDescartarComplementos(false);
    setConferencias(
      (anteriores) =>
        anteriores?.map((item) => {
          if (item.aba !== aba) return item;
          const mapa = new Map(
            (item.resolucoes ?? []).map((escolha) => [chaveResolucaoAntiga(escolha), escolha]),
          );
          if (remover) mapa.delete(remover);
          for (const escolha of escolhas) {
            if (escolha.tipo !== "frequencia") {
              for (const [id, anterior] of mapa)
                if (anterior.tipo === "frequencia" && anterior.mes === escolha.mes) mapa.delete(id);
            }
            mapa.set(chaveResolucaoAntiga(escolha), escolha);
          }
          return { ...item, resolucoes: [...mapa.values()], alterada: true };
        }) ?? null,
    );
  }
  return (
    <>
      <Botao
        type="button"
        variante="contorno"
        disabled={disabled || ocupado}
        icone={<CalendarMonthRoundedIcon />}
        sx={{ minWidth: 0, whiteSpace: "normal" }}
        onClick={() => void executar("abrir")}
      >
        Meses da frequência
      </Botao>
      <Dialogo
        aberto={aberto}
        onFechar={() => {
          if (ocupado) return;
          setAberto(false);
          setSenha("");
          setDescartarComplementos(false);
        }}
        titulo="Meses da frequência"
        descricao="Escolha o mês e abra a turma no Google Planilhas."
        tamanho="grande"
      >
        <Stack spacing={2}>
          {!catalogo && ocupado ? (
            <Typography role="status" variant="body2">
              Carregando meses...
            </Typography>
          ) : null}
          {catalogo ? (
            <>
              {meses.length > 0 ? (
                <>
                  <IndiceChamadas disabled={ocupado} />
                  <Selecionar
                    id="planilha-mes-acesso"
                    valor={mes}
                    onValor={setMes}
                    ariaLabel="Mês das frequências"
                    disabled={ocupado}
                    opcoes={meses.map((valor) => ({ valor, rotulo: rotuloMes(valor) }))}
                  />
                  <Box
                    aria-label="Turmas do mês"
                    sx={{
                      display: "grid",
                      gap: 1,
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    }}
                  >
                    {catalogo.abas
                      .filter((item) => item.mes === mes)
                      .map((item) => (
                        <Link
                          key={item.url}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir ${item.aba}`}
                          aria-disabled={item.oculta}
                          underline="hover"
                          onClick={(evento) => {
                            if (item.oculta) {
                              evento.preventDefault();
                              setMensagem("Use Liberar meses para acessar as abas ocultas.");
                            }
                          }}
                          sx={(tema) => ({
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                            minHeight: 48,
                            paddingX: 2,
                            paddingY: 1,
                            border: `1px solid ${tema.vars.palette.divider}`,
                            borderRadius: 2,
                            color: "text.primary",
                            textDecoration: "none",
                            "&:hover": {
                              backgroundColor: tema.vars.palette.action.hover,
                              textDecoration: "none",
                            },
                          })}
                        >
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.aba}
                          </Typography>
                          <LaunchRoundedIcon fontSize="small" aria-hidden="true" />
                        </Link>
                      ))}
                  </Box>
                  <Botao
                    variante="contorno"
                    disabled={ocupado}
                    onClick={() => void executar("liberar")}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Liberar meses
                  </Botao>
                </>
              ) : (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Prepare um mês para criar as abas das turmas.
                </Typography>
              )}
              {catalogo.legadas.length > 0 || conferencias ? (
                <Acordeao
                  titulo="Abas sem mês"
                  nivelTitulo="h4"
                  resumo={
                    <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
                      Transferência conferida das abas antigas
                    </Typography>
                  }
                  aberto={abasAntigasAbertas}
                  onChange={setAbasAntigasAbertas}
                >
                  <Stack spacing={2}>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Move as frequências para os meses preparados e retira as abas antigas após a
                      conferência.
                    </Typography>
                    <Botao
                      variante="contorno"
                      disabled={ocupado || !catalogo.legadas.length}
                      onClick={() => void executar("conferir")}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Conferir abas antigas
                    </Botao>
                    {conferencias?.map((item) => (
                      <Box key={item.aba} sx={CAIXA}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.aba}
                        </Typography>
                        {item.concluida ? (
                          <Typography variant="body2" color="primary">
                            Transferida e retirada
                          </Typography>
                        ) : item.erro ? (
                          <Typography variant="body2" color="error">
                            {item.erro}
                          </Typography>
                        ) : item.previa ? (
                          <>
                            <Typography variant="body2">
                              {item.previa.preenchidas}{" "}
                              {item.previa.preenchidas === 1 ? "marca a mover" : "marcas a mover"} ·{" "}
                              {item.previa.conferidas}{" "}
                              {item.previa.conferidas === 1 ? "já preservada" : "já preservadas"}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {item.previa.destinos.map((destino) => destino.aba).join(", ")}
                            </Typography>
                            {item.previa.substituidas > 0 || item.previa.mantidas > 0 ? (
                              <Typography variant="body2">
                                Marcas mensais: {item.previa.substituidas} a substituir ·{" "}
                                {item.previa.mantidas} a manter
                              </Typography>
                            ) : null}
                            {item.previa.totalPendencias > 0 ? (
                              <PendenciasAbaAntiga
                                pendencias={item.previa.pendencias}
                                total={item.previa.totalPendencias}
                                resolucoes={item.resolucoes ?? []}
                                disabled={ocupado}
                                onEscolher={(escolhas, remover) =>
                                  escolher(item.aba, escolhas, remover)
                                }
                              />
                            ) : null}
                            {item.previa.alunosIncluidos > 0 ? (
                              <Typography variant="body2">
                                Linhas de alunos a incluir: {item.previa.alunosIncluidos}
                              </Typography>
                            ) : null}
                            {temComplementos(item.previa) ? (
                              <Stack spacing={1}>
                                <Typography variant="body2">
                                  Fórmulas: {item.previa.complementos.formulas} · Notas:{" "}
                                  {item.previa.complementos.notas} · Totais:{" "}
                                  {item.previa.complementos.totais}
                                </Typography>
                                <Acordeao
                                  titulo="Ver exemplos de células"
                                  nivelTitulo="h6"
                                  resumo={
                                    <Typography
                                      component="span"
                                      variant="body2"
                                      sx={{ color: "text.secondary" }}
                                    >
                                      Amostra de até 18 ocorrências
                                    </Typography>
                                  }
                                >
                                  <Stack spacing={1}>
                                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                                      {item.previa.complementos.amostras.map((celula) => (
                                        <Link
                                          key={`${celula.celula}:${celula.tipo}`}
                                          href={`${item.previa?.urlAntiga ?? ""}&range=${celula.celula}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          underline="hover"
                                        >
                                          {celula.celula} ({celula.tipo})
                                        </Link>
                                      ))}
                                    </Stack>
                                    {item.previa.complementos.formulas +
                                      item.previa.complementos.notas +
                                      item.previa.complementos.totais >
                                    item.previa.complementos.amostras.length ? (
                                      <Typography
                                        variant="caption"
                                        sx={{ color: "text.secondary" }}
                                      >
                                        Amostra de até 18 ocorrências. Abra a aba antiga para
                                        conferir todas.
                                      </Typography>
                                    ) : null}
                                    <Link
                                      href={item.previa.urlAntiga}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      underline="hover"
                                    >
                                      Abrir aba antiga
                                    </Link>
                                  </Stack>
                                </Acordeao>
                              </Stack>
                            ) : null}
                          </>
                        ) : null}
                        {!item.concluida ? (
                          <Botao
                            type="button"
                            variante="contorno"
                            tamanho="pequeno"
                            disabled={ocupado}
                            onClick={() => void executar("rever", item.aba)}
                            sx={{ alignSelf: "flex-start" }}
                          >
                            {item.alterada ? "Conferir escolhas" : "Conferir esta aba novamente"}
                          </Botao>
                        ) : null}
                      </Box>
                    ))}
                    {comComplementos ? (
                      <Box sx={CAIXA}>
                        <Typography variant="body2">
                          As frequências serão preservadas nos meses. Os totais e as notas listados
                          serão apagados com as abas antigas.
                        </Typography>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={descartarComplementos}
                              disabled={ocupado}
                              onChange={(evento) => setDescartarComplementos(evento.target.checked)}
                            />
                          }
                          label="Autorizo descartar os totais e notas antigos listados"
                          sx={{ minHeight: 48, margin: 0, alignItems: "flex-start" }}
                        />
                      </Box>
                    ) : null}
                    {comEscolhas || (comComplementos && descartarComplementos) ? (
                      <Box sx={CAIXA}>
                        {comEscolhas ? (
                          <Typography variant="body2">
                            As escolhas de alunos e marcas foram conferidas. Confirme a retirada com
                            a senha administrativa.
                          </Typography>
                        ) : null}
                        <Campo id="senha-descarte-abas" rotulo="Senha administrativa">
                          <CampoSenha
                            id="senha-descarte-abas"
                            autoComplete="current-password"
                            valor={senha}
                            onValor={setSenha}
                            disabled={ocupado}
                          />
                        </Campo>
                      </Box>
                    ) : null}
                    {revisadas.length > 0 ? (
                      <Botao
                        disabled={ocupado || !prontas}
                        onClick={() => void executar("aplicar")}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        Transferir e retirar{" "}
                        {prontas === 1 ? "1 aba" : prontas > 1 ? `${prontas} abas` : ""}
                      </Botao>
                    ) : null}
                  </Stack>
                </Acordeao>
              ) : null}
            </>
          ) : null}
          {andamento ? (
            <Typography role="status" variant="body2">
              Conferindo {andamento}...
            </Typography>
          ) : null}
          {mensagem ? (
            <Typography role="status" variant="body2">
              {mensagem}
            </Typography>
          ) : null}
        </Stack>
      </Dialogo>
    </>
  );
}
