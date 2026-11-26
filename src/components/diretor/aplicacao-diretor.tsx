"use client";

// Tela do diretor de turma: só leitura das estatísticas das turmas do vínculo.
// No primeiro acesso, a troca da palavra-chave vem antes de qualquer dado.
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import { useSaidaSessao } from "@/components/entrada/transicao-sessao";
import { primeiroNome, rotuloDePapel, type Identidade } from "@/domain/usuarios";
import type { ContextoDiretor } from "@/domain/estatisticas-diretor";
import { LayoutConteudo } from "@/components/layout/layout-conteudo";
import { LayoutPagina } from "@/components/layout/layout-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { AtualizadoEm } from "@/components/ui/mui/atualizado-em";
import { BotaoAtualizar } from "@/components/ui/mui/botao-atualizar";
import { BotaoIcone } from "@/components/ui/mui/botao";
import { SeletorTema } from "@/components/ui/mui/seletor-tema";
import { SeletorAnimacoes } from "@/components/conta/seletor-animacoes";
import DialogoSenha from "@/components/conta/dialogo-senha";
import DialogoNotificacoes from "@/components/conta/dialogo-notificacoes";
import DialogoSobre from "@/components/dialogo-sobre";
import RegistroPwa from "@/components/pwa/registro-pwa";
import VistaMinhasTurmas from "@/components/diretor/vista-minhas-turmas";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  usuario: Identidade;
  contexto: ContextoDiretor;
  fuso: string;
}

const ALVO_ACAO = { width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque } as const;

export default function AplicacaoDiretor({ usuario, contexto, fuso }: Props) {
  const router = useRouter();
  const [trocaAberta, setTrocaAberta] = useState(false);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const [sobreAberto, setSobreAberto] = useState(false);
  const [atualizacao, setAtualizacao] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState<string>();
  const marcarAtualizado = useCallback(() => setAtualizadoEm(new Date().toISOString()), []);

  const { saindo, sair } = useSaidaSessao();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        "& > main": { flex: 1, minHeight: 0 },
      }}
    >
      <AppBar
        position="sticky"
        sx={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: { xs: "env(safe-area-inset-left, 0px)", sm: 0 },
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <Toolbar
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: { xs: 1, sm: 0 },
            rowGap: 0.5,
            paddingY: { xs: 1, sm: 0 },
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1, mr: { sm: 1 } }}>
            <Typography variant="subtitle1" component="p" noWrap sx={{ fontWeight: 600 }}>
              FrequenciApp
            </Typography>
            <Typography
              variant="caption"
              component="p"
              sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
            >
              {primeiroNome(usuario.nome)} · {rotuloDePapel(usuario.papel)}
            </Typography>
            <AtualizadoEm instante={atualizadoEm} fuso={fuso} sx={{ whiteSpace: "normal" }} />
          </Box>
          <BotaoAtualizar
            variante="texto"
            onAtualizar={() => setAtualizacao((valor) => valor + 1)}
            sx={{ mr: { sm: 0.5 } }}
          />
          <Stack
            direction="row"
            useFlexGap
            sx={{
              alignItems: "center",
              flexWrap: "wrap",
              flex: { xs: "0 0 100%", sm: "0 0 auto" },
              justifyContent: { xs: "space-evenly", sm: "flex-end" },
              columnGap: { sm: 0.5 },
              rowGap: 0.5,
              maxWidth: "100%",
            }}
          >
            <Box
              sx={{
                display: "inline-flex",
                "& > button": {
                  width: TOKENS_LAYOUT.alvoToque,
                  height: TOKENS_LAYOUT.alvoToque,
                  backgroundColor: "transparent",
                  borderColor: "transparent",
                  "&:hover": { backgroundColor: "action.hover" },
                },
              }}
            >
              <SeletorTema />
            </Box>
            <SeletorAnimacoes />
            {!contexto.trocaObrigatoria ? (
              <BotaoIcone
                rotulo="Configurar notificações"
                icone={<NotificationsRoundedIcon />}
                variante="texto"
                onClick={() => setNotificacoesAbertas(true)}
                sx={ALVO_ACAO}
              />
            ) : null}
            <BotaoIcone
              rotulo="Sobre"
              icone={<InfoRoundedIcon />}
              variante="texto"
              onClick={() => setSobreAberto(true)}
              sx={ALVO_ACAO}
            />
            <BotaoIcone
              rotulo="Trocar minha palavra-chave"
              icone={<KeyRoundedIcon />}
              variante="texto"
              onClick={() => setTrocaAberta(true)}
              sx={ALVO_ACAO}
            />
            <BotaoIcone
              rotulo="Sair da conta"
              icone={<LogoutRoundedIcon />}
              variante="texto"
              carregando={saindo}
              onClick={() => void sair()}
              sx={ALVO_ACAO}
            />
            {saindo ? <TextoDeCarregamento anunciar>Saindo...</TextoDeCarregamento> : null}
          </Stack>
        </Toolbar>
      </AppBar>

      <LayoutPagina>
        <LayoutConteudo largura="leitura">
          <Box data-visao="diretor">
            {contexto.trocaObrigatoria ? (
              <EstadoVazio
                icone={<KeyRoundedIcon />}
                titulo="Palavra-chave necessária"
                descricao="Crie sua palavra-chave para ver as estatísticas."
              />
            ) : (
              <VistaMinhasTurmas
                contexto={contexto}
                atualizacao={atualizacao}
                onAtualizado={marcarAtualizado}
              />
            )}
          </Box>
        </LayoutConteudo>
      </LayoutPagina>

      <DialogoSenha
        palavraChave
        obrigatoria={contexto.trocaObrigatoria}
        aberto={contexto.trocaObrigatoria || trocaAberta}
        onAbrir={setTrocaAberta}
        onTrocada={() => {
          if (contexto.trocaObrigatoria) router.refresh();
        }}
      />
      <DialogoNotificacoes aberto={notificacoesAbertas} onAbrir={setNotificacoesAbertas} />
      <DialogoSobre aberto={sobreAberto} onAbrir={setSobreAberto} />
      <RegistroPwa />
    </Box>
  );
}
