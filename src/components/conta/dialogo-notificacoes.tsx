"use client";

// Preferência de push do dispositivo atual. A permissão só é pedida após
// toque explícito; falhas de ativação desfazem a assinatura recém-criada.
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import {
  ROTULOS_NOTIFICACAO,
  DESCRICOES_NOTIFICACAO,
  type TipoDeAviso,
  type PreferenciasNotificacoes,
} from "@/domain/notificacoes";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onDevolverFoco?: () => void;
}

interface Estado {
  configurada: boolean;
  chavePublica: string | null;
  ativa: boolean;
  preferencias: PreferenciasNotificacoes;
  tipos: { tipo: TipoDeAviso; disponivel: boolean }[];
  horarioResumo: string;
  horarioPendencias: string;
}

// A base ligada avança 20 px; o trilho começa a 12 px da borda.
const EXTENSAO_TRILHO_LIGADO = 20 - 12;

const VISUALMENTE_OCULTO = {
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

function chaveDoServidor(chave: string): Uint8Array<ArrayBuffer> {
  const texto = atob(chave.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(texto, (caractere) => caractere.charCodeAt(0));
}

function suportaNotificacoes(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registroPronto(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  let alarme: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_resolver, recusar) => {
        alarme = setTimeout(
          () => recusar(new Error("Não foi possível iniciar as notificações. Tente novamente.")),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(alarme);
  }
}

export default function DialogoNotificacoes({ aberto, onAbrir, onDevolverFoco }: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  // O suporte é uma leitura do navegador, não um estado: vem do cliente depois
  // da hidratação e evita o estado escrito dentro de um efeito de montagem.
  const suportado = useSyncExternalStore(
    () => () => undefined,
    suportaNotificacoes,
    () => false,
  );
  const [carregando, setCarregando] = useState(true);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [assinatura, setAssinatura] = useState<PushSubscription | null>(null);
  const [permissao, setPermissao] = useState<NotificationPermission>("default");
  const [erro, setErro] = useState("");
  const acaoDesejada = useRef<"ativar" | "desativar" | "testar" | "salvar">("ativar");
  const preferenciaDesejada = useRef<Partial<PreferenciasNotificacoes>>({});
  const tituloId = useId();
  const descricaoId = useId();
  const padding = `${TOKENS_LAYOUT.dialogo.padding}px`;

  // O diálogo é limpo ao abrir. A comparação durante o render substitui o
  // reinício dentro do efeito, que a regra set-state-in-effect reprova.
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setCarregando(true);
      setEstado(null);
      setAssinatura(null);
      setErro("");
    }
  }

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    async function carregar() {
      const suporta = suportaNotificacoes();
      try {
        const atual = suporta ? await (await registroPronto()).pushManager.getSubscription() : null;
        const dados = await pedir<Estado>(
          `/api/notificacoes/assinatura${atual ? `?endpoint=${encodeURIComponent(atual.endpoint)}` : ""}`,
        );
        if (cancelado) return;
        // Reassocia uma preferência já ativa à sessão atual, sem pedir permissão.
        if (dados.ativa && atual)
          await pedir("/api/notificacoes/assinatura", corpoJson(atual.toJSON()));
        if (cancelado) return;
        setAssinatura(atual);
        setEstado(dados);
        if (suporta) setPermissao(Notification.permission);
      } catch (excecao) {
        if (!cancelado)
          setErro(
            excecao instanceof Error
              ? excecao.message
              : "Não foi possível consultar as notificações.",
          );
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void carregar();
    return () => {
      cancelado = true;
    };
  }, [aberto]);

  const { executando, executar } = useAcaoUnica(async () => {
    const acao = acaoDesejada.current;
    setErro("");
    try {
      if (acao === "salvar") {
        const dados = await pedir<{ preferencias: PreferenciasNotificacoes }>(
          "/api/notificacoes/preferencias",
          { ...corpoJson(preferenciaDesejada.current), method: "PATCH" },
        );
        setEstado((atual) => (atual ? { ...atual, preferencias: dados.preferencias } : atual));
        avisarSucesso("Preferências de notificações salvas.");
      } else if (acao === "ativar") {
        if (!estado?.chavePublica) return;
        // Safari exige a solicitação dentro da ação do usuário, antes de outras esperas.
        const autorizacao =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        setPermissao(autorizacao);
        if (autorizacao !== "granted") {
          setErro("A permissão não foi concedida. Os avisos continuam desativados.");
          return;
        }
        const registro = await registroPronto();
        let atual = await registro.pushManager.getSubscription();
        const chave = chaveDoServidor(estado.chavePublica);
        const anterior = atual?.options.applicationServerKey;
        if (
          atual &&
          anterior &&
          new Uint8Array(anterior).some((byte, indice) => byte !== chave[indice])
        ) {
          await atual.unsubscribe();
          atual = null;
        }
        const criada = !atual;
        atual ??= await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chave,
        });
        try {
          await pedir("/api/notificacoes/assinatura", corpoJson(atual.toJSON()));
        } catch (excecao) {
          if (criada) await atual.unsubscribe().catch(() => false);
          throw excecao;
        }
        setAssinatura(atual);
        setEstado({ ...estado, ativa: true });
        avisarSucesso("Notificações ativadas neste dispositivo.");
      } else if (assinatura) {
        if (acao === "desativar") {
          await pedir("/api/notificacoes/assinatura", {
            ...corpoJson({ endpoint: assinatura.endpoint }),
            method: "DELETE",
          });
          setEstado((atual) => (atual ? { ...atual, ativa: false } : atual));
          await assinatura.unsubscribe();
          setAssinatura(null);
          avisarSucesso("Notificações desativadas neste dispositivo.");
        } else {
          await pedir("/api/notificacoes/teste", corpoJson({ endpoint: assinatura.endpoint }));
          avisarSucesso("Teste enviado. Confira as notificações do dispositivo.");
        }
      }
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "Não foi possível alterar as notificações.",
      );
      if (excecao instanceof ErroApi && excecao.status === 410) {
        await assinatura?.unsubscribe().catch(() => false);
        setAssinatura(null);
        setEstado((atual) => (atual ? { ...atual, ativa: false } : atual));
      }
      avisarErro(excecao, { contexto: "Não foi possível concluir a ação de notificações." });
    }
  });

  function executarAcao(acao: "ativar" | "desativar" | "testar" | "salvar") {
    if (executando) return;
    acaoDesejada.current = acao;
    void executar();
  }

  function fechar() {
    if (!executando) onAbrir(false);
  }

  return (
    <Dialog
      open={aberto}
      onClose={fechar}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      role="dialog"
      aria-labelledby={tituloId}
      aria-describedby={descricaoId}
      disableRestoreFocus={Boolean(onDevolverFoco)}
      slotProps={{
        paper: {
          sx: {
            maxWidth: `${TOKENS_LAYOUT.dialogo.larguraMaxima}px`,
            borderRadius: `${TOKENS_LAYOUT.dialogo.raio}px`,
          },
        },
        transition: {
          onExited: () => {
            if (onDevolverFoco) onDevolverFoco();
          },
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <DialogTitle
          id={tituloId}
          sx={{
            padding,
            paddingBottom: 0,
            paddingRight: `calc(${padding} + ${TOKENS_LAYOUT.alvoToque}px)`,
          }}
        >
          Notificações
        </DialogTitle>
        <IconButton
          aria-label="Fechar"
          onClick={fechar}
          sx={{
            position: "absolute",
            top: padding,
            right: padding,
            width: TOKENS_LAYOUT.alvoToque,
            height: TOKENS_LAYOUT.alvoToque,
          }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </Box>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, padding }}>
        <DialogContentText id={descricaoId} sx={VISUALMENTE_OCULTO}>
          Escolher os avisos da conta e ativar o recebimento neste dispositivo.
        </DialogContentText>
        {carregando ? (
          <Stack direction="row" spacing={1} role="status" sx={{ alignItems: "center" }}>
            <CircularProgress size={16} />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Consultando notificações...
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={2}>
            {estado?.preferencias ? (
              <Box>
                <Typography variant="body2" component="p" sx={{ fontWeight: 600, mb: 1 }}>
                  Tipos de aviso
                </Typography>
                <List disablePadding aria-label="Tipos de aviso">
                  {estado.tipos.map(({ tipo, disponivel }) => {
                    const idRotulo = `${tituloId}-${tipo}`;
                    const contexto = !disponivel
                      ? "Este aviso está desligado pela Gestão."
                      : tipo === "novasChamadas"
                        ? undefined
                        : `A partir das ${tipo === "resumoDiario" ? estado.horarioResumo : estado.horarioPendencias} (horário da escola).`;
                    const idContexto = contexto ? `${descricaoId}-${tipo}` : undefined;
                    return (
                      <ListItem
                        key={tipo}
                        disableGutters
                        sx={{ alignItems: "flex-start", gap: 2, py: 1 }}
                      >
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, flex: 1 }}>
                          <Typography
                            id={idRotulo}
                            component="p"
                            variant="body2"
                            sx={{ fontWeight: 500 }}
                          >
                            {ROTULOS_NOTIFICACAO[tipo]}
                          </Typography>
                          <Typography
                            component="p"
                            variant="caption"
                            sx={{ color: "text.secondary" }}
                          >
                            {DESCRICOES_NOTIFICACAO[tipo]}
                          </Typography>
                          {contexto ? (
                            <Typography
                              id={idContexto}
                              component="p"
                              variant="caption"
                              sx={{ color: "text.secondary" }}
                            >
                              {contexto}
                            </Typography>
                          ) : null}
                        </Box>
                        <Switch
                          edge="end"
                          checked={estado.preferencias[tipo]}
                          disabled={executando || !disponivel}
                          onChange={(evento) => {
                            preferenciaDesejada.current = { [tipo]: evento.target.checked };
                            executarAcao("salvar");
                          }}
                          slotProps={{
                            input: ({ checked }) => ({
                              "aria-labelledby": idRotulo,
                              "aria-describedby": idContexto,
                              "aria-checked": checked ? "true" : "false",
                              // Cobre o trilho à esquerda sem ampliar a borda direita da base.
                              style: checked
                                ? {
                                    width: `calc(100% + ${EXTENSAO_TRILHO_LIGADO}px)`,
                                    left: -EXTENSAO_TRILHO_LIGADO,
                                  }
                                : { width: "100%", left: 0 },
                            }),
                          }}
                        />
                      </ListItem>
                    );
                  })}
                </List>
                <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
                  Preferências para toda a conta; ativação por dispositivo.
                </Typography>
              </Box>
            ) : null}
            {!suportado ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Este navegador não oferece notificações push. No iPhone ou iPad, adicione o
                aplicativo à Tela de Início pelo Safari e abra por esse ícone. É necessário iOS 16.4
                ou posterior.
              </Typography>
            ) : null}
            {estado && !estado.configurada ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                As notificações ainda não foram configuradas pela administração.
              </Typography>
            ) : null}
            {suportado && permissao === "denied" ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                As notificações estão bloqueadas. Libere a permissão nas configurações deste site no
                navegador e abra esta opção novamente.
              </Typography>
            ) : null}
            {estado?.ativa ? (
              <Typography role="status" variant="body2">
                Notificações ativadas neste dispositivo.
              </Typography>
            ) : null}
            {suportado && estado?.configurada ? (
              <Stack spacing={1}>
                <Botao
                  variante={estado.ativa ? "contorno" : "secundario"}
                  disabled={executando || (!estado.ativa && permissao === "denied")}
                  carregando={executando}
                  onClick={() => executarAcao(estado.ativa ? "desativar" : "ativar")}
                >
                  {estado.ativa ? "Desativar notificações" : "Ativar notificações"}
                </Botao>
                {estado.ativa ? (
                  <Botao
                    variante="contorno"
                    disabled={executando}
                    onClick={() => executarAcao("testar")}
                  >
                    Enviar notificação de teste
                  </Botao>
                ) : null}
              </Stack>
            ) : null}
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Os avisos não mostram nomes de alunos. Ao sair da conta neste dispositivo, as
              notificações são desativadas.
            </Typography>
          </Stack>
        )}
        {erro ? (
          <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
