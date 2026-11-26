"use client";

// Troca da própria senha: exige a atual, orienta a política e avisa
// que outros dispositivos serão desconectados. Para o diretor de turma, o
// mesmo formulário troca a palavra-chave, e no primeiro acesso não fecha.
import { useId, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onDevolverFoco?: () => void;
  /** Troca a palavra-chave do diretor de turma, com os rótulos dela. */
  palavraChave?: boolean;
  /** Troca obrigatória: sem cancelar, e o diálogo não fecha sozinho. */
  obrigatoria?: boolean;
  onTrocada?: () => void;
}

export default function DialogoSenha({
  aberto,
  onAbrir,
  palavraChave = false,
  obrigatoria = false,
  onTrocada,
  onDevolverFoco,
}: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const termo = palavraChave ? "palavra-chave" : "senha";
  const Termo = palavraChave ? "Palavra-chave" : "Senha";
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const tituloId = useId();
  const descricaoId = useId();
  const formId = useId();
  const padding = `${TOKENS_LAYOUT.dialogo.padding}px`;

  function fechar(abertoNovo: boolean) {
    if (enviando || (obrigatoria && !abertoNovo)) return;
    onAbrir(abertoNovo);
    if (!abertoNovo) {
      setSenhaAtual("");
      setSenhaNova("");
      setConfirmacao("");
      setErro("");
    }
  }

  async function submeter() {
    if (enviando) return;
    if (senhaNova !== confirmacao) {
      setErro(`A confirmação não confere com a nova ${termo}.`);
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await pedir<{ ok: boolean }>("/api/conta/senha", corpoJson({ senhaAtual, senhaNova }));
      avisarSucesso(`${Termo} trocada. Nos outros dispositivos, entre de novo.`);
      setSenhaAtual("");
      setSenhaNova("");
      setConfirmacao("");
      onTrocada?.();
      if (!obrigatoria) fechar(false);
    } catch (excecao) {
      const contexto = `Não foi possível trocar a ${termo}.`;
      setErro(excecao instanceof ErroApi ? excecao.message : contexto);
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={aberto}
      onClose={(_evento, motivo) => {
        if (obrigatoria && motivo === "escapeKeyDown") return;
        fechar(false);
      }}
      fullWidth
      maxWidth="sm"
      role="dialog"
      aria-labelledby={tituloId}
      aria-describedby={obrigatoria ? descricaoId : undefined}
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
      <Box
        component="form"
        id={formId}
        onSubmit={(evento) => {
          evento.preventDefault();
          void submeter();
        }}
        noValidate
        sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <DialogTitle
          id={tituloId}
          sx={{ display: "flex", alignItems: "flex-start", gap: 2, padding, paddingBottom: 0 }}
        >
          <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
            {obrigatoria ? `Crie sua ${termo}` : `Trocar minha ${termo}`}
          </Box>
          {!obrigatoria ? (
            <IconButton
              aria-label="Fechar"
              onClick={() => fechar(false)}
              sx={{
                flexShrink: 0,
                width: TOKENS_LAYOUT.alvoToque,
                height: TOKENS_LAYOUT.alvoToque,
              }}
            >
              <CloseRoundedIcon />
            </IconButton>
          ) : null}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, padding }}>
          {obrigatoria ? (
            <DialogContentText id={descricaoId}>
              A palavra-chave recebida serve só para o primeiro acesso. Escolha uma própria para
              continuar.
            </DialogContentText>
          ) : null}
          <Campo
            id="senha-atual"
            rotulo={obrigatoria ? "Palavra-chave recebida" : `${Termo} atual`}
          >
            <CampoSenha
              id="senha-atual"
              valor={senhaAtual}
              onValor={setSenhaAtual}
              required
              autoComplete="current-password"
            />
          </Campo>
          <Campo
            id="senha-nova"
            rotulo={`Nova ${termo}`}
            descricao="Mínimo de 8 caracteres, com pelo menos uma letra e um número."
          >
            <CampoSenha
              id="senha-nova"
              valor={senhaNova}
              onValor={setSenhaNova}
              required
              autoComplete="new-password"
            />
          </Campo>
          <Campo id="senha-confirmacao" rotulo={`Confirmar nova ${termo}`}>
            <CampoSenha
              id="senha-confirmacao"
              valor={confirmacao}
              onValor={setConfirmacao}
              required
              autoComplete="new-password"
            />
          </Campo>
          {erro ? (
            <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
          ) : null}
        </DialogContent>
        <DialogActions sx={{ padding, paddingTop: 0 }}>
          {!obrigatoria ? (
            <Botao type="button" variante="contorno" onClick={() => fechar(false)}>
              Cancelar
            </Botao>
          ) : null}
          <Botao type="submit" variante="secundario" carregando={enviando}>
            {obrigatoria ? "Salvar e continuar" : `Trocar ${termo}`}
          </Botao>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
