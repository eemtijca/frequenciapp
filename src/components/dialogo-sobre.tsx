"use client";

// Diálogo institucional: privacidade, projeto e licença em cartões, com folha no celular.
import { useId } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import pacote from "../../package.json";
import { Logotipo } from "@/components/ui/mui/logotipo";
import { ROTA_PRIVACIDADE } from "@/lib/rotas-publicas";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onDevolverFoco?: () => void;
}

const DESENVOLVEDORES = [
  { nome: "Emanuel Lázaro", url: "https://github.com/emanuellcs" },
  { nome: "Prof. Josué Cavalcante", url: "https://github.com/wolf9611" },
];

const SALVAGUARDAS = [
  "Acesso por conta e permissão.",
  "Registro de operações administrativas.",
  "Integrações opcionais sob controle da gestão.",
];

const REPOSITORIO = "https://github.com/eemtijca/frequenciapp";

const ACAO = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 1,
  width: "100%",
  minHeight: 48,
  px: 1.5,
  borderRadius: 1,
  color: "primary.main",
  "&:hover": { backgroundColor: "action.hover" },
} as const;

const TITULO_SECAO = {
  display: "flex",
  alignItems: "center",
  gap: 1,
} as const;

export default function DialogoSobre({ aberto, onAbrir, onDevolverFoco }: Props) {
  const tituloId = useId();
  const descricaoId = useId();
  const tema = useTheme();
  const telaPequena = useMediaQuery(tema.breakpoints.down("sm"));

  function fechar() {
    onAbrir(false);
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
      slotProps={{
        paper: {
          elevation: 0,
          sx: [
            { boxShadow: "none" },
            telaPequena
              ? {
                  position: "fixed",
                  top: "auto",
                  right: 0,
                  bottom: 0,
                  left: 0,
                  width: "100%",
                  maxWidth: "100%",
                  maxHeight: "90dvh",
                  margin: 0,
                  borderRadius: "16px 16px 0 0",
                }
              : {},
          ],
        },
        transition: {
          onExited: () => {
            onDevolverFoco?.();
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 2,
          p: { xs: 2, sm: 3 },
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "background.default",
        }}
      >
        <Logotipo tamanho={48} alt="" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={tituloId} component="h2" variant="h6">
            Sobre o FrequenciApp
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            EEMTI José Cláudio de Araújo
          </Typography>
          <Typography id={descricaoId} variant="caption" color="text.secondary" component="p">
            Chamada, movimentações e indicadores da escola.
          </Typography>
        </Box>
        <IconButton
          aria-label="Fechar"
          onClick={fechar}
          sx={{ width: 48, height: 48, flexShrink: 0 }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          pb: {
            xs: "calc(16px + env(safe-area-inset-bottom, 0px))",
            sm: 3,
          },
          "& a::before": { content: "none" },
        }}
      >
        <Stack spacing={2} sx={{ pt: { xs: 2, sm: 3 } }}>
          <Paper
            component="section"
            variant="outlined"
            aria-labelledby="sobre-privacidade"
            sx={{ p: 2, borderColor: "primary.main" }}
          >
            <Stack spacing={1.5}>
              <Box sx={TITULO_SECAO}>
                <ShieldRoundedIcon color="primary" aria-hidden="true" />
                <Typography
                  id="sobre-privacidade"
                  component="h3"
                  variant="subtitle1"
                  sx={{ fontWeight: 600 }}
                >
                  Privacidade e LGPD
                </Typography>
              </Box>
              <Typography variant="body2">
                Dados de alunos restritos à equipe da escola, com tratamento conforme a LGPD.
              </Typography>
              <Stack
                component="ul"
                spacing={1}
                sx={{ listStyle: "none", m: 0, p: 0, color: "text.secondary" }}
              >
                {SALVAGUARDAS.map((texto) => (
                  <Stack component="li" key={texto} direction="row" spacing={1}>
                    <CheckRoundedIcon
                      color="primary"
                      fontSize="small"
                      aria-hidden="true"
                      sx={{ flexShrink: 0, mt: 0.25 }}
                    />
                    <Typography variant="body2" component="span">
                      {texto}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Solicitações de dados: gestão da escola.
              </Typography>
              <Link href={ROTA_PRIVACIDADE} variant="body2" underline="none" sx={ACAO}>
                Como os dados são tratados
              </Link>
            </Stack>
          </Paper>

          <Paper
            component="section"
            variant="outlined"
            aria-labelledby="sobre-projeto"
            sx={{ p: 2 }}
          >
            <Stack spacing={1.5}>
              <Box sx={TITULO_SECAO}>
                <CodeRoundedIcon color="primary" aria-hidden="true" />
                <Typography
                  id="sobre-projeto"
                  component="h3"
                  variant="subtitle1"
                  sx={{ fontWeight: 600 }}
                >
                  Projeto
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Código aberto mantido pela equipe da escola.
              </Typography>
              <Link
                href={REPOSITORIO}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                underline="none"
                sx={ACAO}
              >
                Repositório no GitHub
                <OpenInNewRoundedIcon fontSize="small" aria-hidden="true" />
              </Link>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Desenvolvedores
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                  {DESENVOLVEDORES.map(({ nome, url }) => (
                    <Link
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="body2"
                      underline="none"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                        minHeight: 48,
                        px: 1.5,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 999,
                        color: "text.primary",
                        "&:hover": { borderColor: "primary.main" },
                      }}
                    >
                      {nome}
                      <OpenInNewRoundedIcon
                        fontSize="small"
                        aria-hidden="true"
                        sx={{ color: "text.secondary" }}
                      />
                    </Link>
                  ))}
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Paper
            component="section"
            variant="outlined"
            aria-labelledby="sobre-licenca"
            sx={{ p: 2 }}
          >
            <Stack spacing={1.5}>
              <Box sx={TITULO_SECAO}>
                <GavelRoundedIcon color="primary" aria-hidden="true" />
                <Typography
                  id="sobre-licenca"
                  component="h3"
                  variant="subtitle1"
                  sx={{ fontWeight: 600 }}
                >
                  Licença
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 24,
                    px: 1,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 999,
                    backgroundColor: "action.hover",
                    typography: "caption",
                    fontWeight: 600,
                  }}
                >
                  MIT
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Texto completo no repositório.
                </Typography>
              </Stack>
              <Link
                href={`${REPOSITORIO}/blob/main/LICENSE`}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                underline="none"
                sx={ACAO}
              >
                Ler a licença
                <OpenInNewRoundedIcon fontSize="small" aria-hidden="true" />
              </Link>
            </Stack>
          </Paper>

          <Divider />
          <Stack
            direction="row"
            useFlexGap
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Versão {pacote.version}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Código aberto
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
