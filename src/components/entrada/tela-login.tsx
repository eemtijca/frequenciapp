"use client";

// Entrada no layout sign-in-side: marca e destaques no desktop, formulário único no celular.
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import WifiOffRoundedIcon from "@mui/icons-material/WifiOffRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Alerta } from "@/components/ui/mui/alerta";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { Logotipo } from "@/components/ui/mui/logotipo";
import { SeletorTema } from "@/components/ui/mui/seletor-tema";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { CampoTexto } from "@/components/ui/mui/text-field";
import DialogoSobre from "@/components/dialogo-sobre";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { avisarSucesso } from "@/lib/avisos";
import { ROTA_PRIVACIDADE } from "@/lib/rotas-publicas";
import { TOKENS_LAYOUT } from "@/theme/layout";

const CHAVE_EMAIL = "frequenciapp:email";
const CHAVE_AVISO = "frequenciapp:aviso-entrada";

const DESTAQUES = [
  {
    Icone: EventAvailableRoundedIcon,
    titulo: "Chamada em poucos toques",
    texto: "Todos começam presentes. Marque só quem faltou e salve.",
  },
  {
    Icone: CalendarMonthRoundedIcon,
    titulo: "Resumo semanal da escola",
    texto: "Frequência, movimentações e pendências da Seduc em um só lugar.",
  },
  {
    Icone: WifiOffRoundedIcon,
    titulo: "Funciona offline",
    texto: "Instale no celular e continue com o rascunho local quando a rede falhar.",
  },
];

const LINK_DISCRETO = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 48,
  minHeight: 48,
  px: 0.5,
  whiteSpace: "nowrap",
  color: "text.secondary",
  fontWeight: 400,
} as const;

interface Props {
  /** URL do índice para agentes de IA, montada a partir da requisição. */
  urlIndiceAgentes: string;
}

export default function TelaLogin({ urlIndiceAgentes }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado | null>(null);
  const [avisoEntrada, setAvisoEntrada] = useState<VarianteEstado | null>(null);
  const [sobreAberto, setSobreAberto] = useState(false);

  // Preenche o e-mail lembrado neste dispositivo, se houver. O armazenamento
  // local só existe no cliente, depois da hidratação, e semear o campo durante
  // a renderização do servidor divergiria a hidratação: exceção registrada no
  // ADR 047.
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE_EMAIL);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento local (ADR 047)
      if (salvo) setEmail(salvo);
    } catch {
      // Sem armazenamento local: segue sem lembrar.
    }
  }, []);

  // Aviso deixado pelo shell quando a sessão expira, mostrado uma única vez.
  // Mesma exceção da linha lembrada: consumo único do armazenamento da sessão.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(CHAVE_AVISO) === "sessao_expirada") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- consumo único do armazenamento da sessão (ADR 047)
        setAvisoEntrada("sessao_expirada");
        window.sessionStorage.removeItem(CHAVE_AVISO);
      }
    } catch {
      // Sem armazenamento local: segue sem o aviso.
    }
  }, []);

  async function submeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    setErroVariante(null);
    try {
      await pedir<{ usuario: { nome: string } }>(
        "/api/auth/entrar",
        corpoJson({ login: email, senha, lembrar }),
      );
      try {
        if (lembrar) window.localStorage.setItem(CHAVE_EMAIL, email.trim().toLowerCase());
        else window.localStorage.removeItem(CHAVE_EMAIL);
      } catch {
        // Sem armazenamento local: o login continua.
      }
      avisarSucesso("Entrada confirmada.");
      router.refresh();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível entrar. Tente novamente.";
      setErro(mensagem);
      const status = excecao instanceof ErroApi ? excecao.status : 0;
      setErroVariante(status === 403 ? "conta_desativada" : status === 429 ? "limite" : null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box
      sx={{
        position: "relative",
        boxSizing: "border-box",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: "calc(8px + env(safe-area-inset-top, 0px))",
          right: "calc(8px + env(safe-area-inset-right, 0px))",
          zIndex: 2,
        }}
      >
        <SeletorTema />
      </Box>

      <Grid container component="main" sx={{ flex: 1 }}>
        <Grid
          component="aside"
          size={{ xs: 12, lg: 6 }}
          sx={{
            display: { xs: "none", lg: "flex" },
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "background.paper",
            borderRight: 1,
            borderColor: "divider",
            px: { lg: 5, xl: 7 },
            py: 6,
          }}
        >
          <Stack spacing={4} sx={{ width: "100%", maxWidth: 460 }}>
            <Stack spacing={1.5} sx={{ alignItems: "center", textAlign: "center" }}>
              <Logotipo tamanho={56} prioridade alt="" />
              <Typography component="p" variant="h6" sx={{ fontWeight: 600 }}>
                FrequenciApp
              </Typography>
              <Typography component="h2" variant="h4">
                A frequência da escola em um só lugar.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Chamada, saídas e relatórios da equipe da escola.
              </Typography>
            </Stack>
            <Stack component="ul" spacing={1.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {DESTAQUES.map(({ Icone, titulo, texto }) => (
                <Paper
                  key={titulo}
                  component="li"
                  variant="outlined"
                  sx={{ p: 2, boxShadow: "none" }}
                >
                  <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        border: 1,
                        borderColor: "primary.main",
                        borderRadius: 1,
                        color: "primary.main",
                      }}
                    >
                      <Icone fontSize="small" aria-hidden="true" />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography component="p" variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {titulo}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="p">
                        {texto}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>
        </Grid>

        <Grid
          size={{ xs: 12, lg: 6 }}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: { xs: 2, sm: 5 },
            py: { xs: 9, sm: 8, lg: 6 },
          }}
        >
          <Paper
            component="section"
            aria-labelledby="titulo-entrada"
            variant="outlined"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              width: "100%",
              maxWidth: 448,
              p: { xs: 2, sm: 4 },
              borderRadius: `${TOKENS_LAYOUT.cartao.raio}px`,
            }}
          >
            <Stack
              spacing={1}
              sx={{
                alignItems: { xs: "center", lg: "flex-start" },
                textAlign: { xs: "center", lg: "left" },
              }}
            >
              <Box sx={{ display: { xs: "flex", lg: "none" }, justifyContent: "center" }}>
                <Logotipo tamanho={48} prioridade alt="" />
              </Box>
              <Typography id="titulo-entrada" component="h1" variant="h5">
                FrequenciApp
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Registro de frequência dos alunos da escola.
              </Typography>
            </Stack>

            {avisoEntrada ? <AlertaCompacto variante={avisoEntrada} tamanho="linha" /> : null}

            <Box
              component="form"
              onSubmit={submeter}
              noValidate
              sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
            >
              <Campo id="email" rotulo="E-mail ou identificador">
                <CampoTexto
                  id="email"
                  valor={email}
                  onValor={(valor) => {
                    setEmail(valor);
                    if (erro) setErro("");
                  }}
                  name="email"
                  autoComplete="username"
                  required
                  placeholder="ana@escola.br ou 3a-maria"
                  erro={erro || undefined}
                />
              </Campo>

              <Campo id="senha" rotulo="Senha">
                <CampoSenha
                  id="senha"
                  valor={senha}
                  onValor={(valor) => {
                    setSenha(valor);
                    if (erro) setErro("");
                  }}
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="Sua senha de acesso"
                  erro={erro || undefined}
                />
              </Campo>

              <FormControlLabel
                control={
                  <Checkbox
                    name="lembrar"
                    checked={lembrar}
                    onChange={(evento) => setLembrar(evento.target.checked)}
                    sx={{ p: 1.5 }}
                  />
                }
                label="Manter conectado neste dispositivo"
                sx={{
                  minHeight: 48,
                  mr: 0,
                  "& .MuiFormControlLabel-label": { typography: "body2" },
                }}
              />

              {erro ? (
                erroVariante ? (
                  <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
                ) : (
                  <Alerta id="erro-entrada" severity="error" role="alert">
                    {erro}
                  </Alerta>
                )
              ) : null}

              <Botao
                type="submit"
                variante="principal"
                carregando={enviando}
                fullWidth
                sx={{ mt: 0.5, height: TOKENS_LAYOUT.alvoToque }}
              >
                {enviando ? "Entrando..." : "Entrar"}
              </Botao>
            </Box>

            <Divider />

            <Box>
              <Stack
                component="nav"
                aria-label="Projeto e ferramentas"
                direction="row"
                spacing={0.5}
                useFlexGap
                sx={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <Link
                  href="/bi"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="caption"
                  sx={LINK_DISCRETO}
                >
                  FrequenciBI
                </Link>
                <Link
                  href="https://github.com/eemtijca/frequenciapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="caption"
                  sx={LINK_DISCRETO}
                >
                  GitHub
                </Link>
                <Link
                  href="/api/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="caption"
                  sx={LINK_DISCRETO}
                >
                  API
                </Link>
                <Link
                  component="button"
                  type="button"
                  variant="caption"
                  onClick={() => setSobreAberto(true)}
                  sx={LINK_DISCRETO}
                >
                  Sobre
                </Link>
              </Stack>
              <Box component="footer" sx={{ display: "flex", justifyContent: "center" }}>
                <Link href={ROTA_PRIVACIDADE} variant="caption" sx={LINK_DISCRETO}>
                  Política de privacidade
                </Link>
              </Box>
            </Box>

            {/* Link oculto para agentes de IA: a raiz anônima aponta o índice do projeto. */}
            <Link href={urlIndiceAgentes} hidden aria-hidden="true" tabIndex={-1}>
              llms.txt
            </Link>

            <DialogoSobre aberto={sobreAberto} onAbrir={setSobreAberto} />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
