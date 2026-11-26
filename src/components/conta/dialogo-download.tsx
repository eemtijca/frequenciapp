"use client";

// Escolha comum a todas as exportações: ZIP protegido por padrão,
// senha apenas em memória e preparação do arquivo após confirmação.
import { useEffect, useId, useRef, useState } from "react";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { erroSenhaZip, MAXIMO_SENHA_ZIP } from "@/domain/downloads";
import { baixarArquivo, protegerArquivo, type ArquivoDownload } from "@/lib/downloads";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  preparar: (senhaAdmin: string) => ArquivoDownload | Promise<ArquivoDownload>;
  confirmarAdmin?: boolean;
  onConcluido: () => void;
}

type Formato = "protegido" | "original";

function ConteudoDownload({
  onAbrir,
  preparar,
  onConcluido,
  confirmarAdmin,
}: Omit<Props, "aberto">) {
  const { avisarErro } = useAvisosDaSessao();
  const id = useId();
  const idFormulario = `${id}-formulario`;
  const [formato, setFormato] = useState<Formato>("protegido");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [senhaAdmin, setSenhaAdmin] = useState("");
  const [erro, setErro] = useState("");
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const protegido = formato === "protegido";
  const { executando, executar } = useAcaoUnica(async () => {
    if (confirmarAdmin && !senhaAdmin) {
      setErro("Informe a senha atual do administrador para baixar a cópia completa.");
      return;
    }
    const problema = protegido ? erroSenhaZip(senha, confirmacao) : "";
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    try {
      // A senha de acesso só segue para a confirmação de cópia, nunca a do ZIP.
      const arquivo = await preparar(senhaAdmin);
      if (!montado.current) return;
      const blob = protegido ? await protegerArquivo(arquivo, senha) : arquivo.blob;
      if (!montado.current) return;
      if (arquivo.registro) {
        await pedir(
          "/api/exportacoes/registro",
          corpoJson({
            tipo: arquivo.registro,
            formato: protegido ? "zip" : "original",
          }),
        );
      }
      if (!montado.current) return;
      baixarArquivo(blob, protegido ? arquivo.nomeZip : arquivo.nome);
      setSenha("");
      setConfirmacao("");
      setSenhaAdmin("");
      onAbrir(false);
      onConcluido();
    } catch (excecao) {
      if (!montado.current) return;
      // Erros do empacotador não expõem conteúdo, nomes nem senha na interface.
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível preparar o download.";
      setErro(mensagem);
      avisarErro(excecao, {
        contexto: "Não foi possível preparar o download.",
        descricao: "Tente novamente. Se o problema persistir, procure a administração.",
      });
    }
  });

  function fechar() {
    if (!executando) onAbrir(false);
  }

  return (
    <Dialogo
      aberto
      onFechar={fechar}
      titulo="Preparar download"
      descricao="O arquivo contém dados escolares. A proteção por senha ajuda a limitar o acesso ao conteúdo ao compartilhar ou guardar a exportação."
      tamanho="medio"
      acoes={
        <>
          <Botao type="button" variante="contorno" disabled={executando} onClick={fechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form={idFormulario} carregando={executando} disabled={executando}>
            {executando
              ? "Preparando..."
              : protegido
                ? "Baixar ZIP protegido"
                : "Baixar arquivo original"}
          </Botao>
        </>
      }
    >
      <Box
        component="form"
        id={idFormulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void executar();
        }}
      >
        <Stack spacing={2}>
          {confirmarAdmin ? (
            <Campo
              id={`${id}-admin`}
              rotulo="Senha atual do administrador"
              descricao="Confirma o acesso à cópia completa da escola. É diferente da senha do ZIP."
              disabled={executando}
            >
              <CampoSenha
                valor={senhaAdmin}
                onValor={setSenhaAdmin}
                autoComplete="current-password"
                maxLength={200}
                disabled={executando}
              />
            </Campo>
          ) : null}
          <FormControl
            component="fieldset"
            disabled={executando}
            sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
          >
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Formato do download
            </FormLabel>
            <RadioGroup
              value={formato}
              onChange={(evento) => {
                const escolhido = evento.target.value === "original" ? "original" : "protegido";
                setFormato(escolhido);
                if (escolhido === "original") {
                  setSenha("");
                  setConfirmacao("");
                }
                setErro("");
              }}
            >
              <FormControlLabel
                value="protegido"
                control={<Radio />}
                label="ZIP protegido por senha"
              />
              <FormControlLabel
                value="original"
                control={<Radio />}
                label="Arquivo original sem senha"
              />
            </RadioGroup>
          </FormControl>
          {protegido ? (
            <>
              <Campo
                id={`${id}-senha`}
                rotulo="Senha do ZIP"
                descricao="De 12 a 128 caracteres. Prefira uma frase longa, diferente da senha de acesso."
                disabled={executando}
              >
                <CampoSenha
                  valor={senha}
                  onValor={setSenha}
                  autoComplete="off"
                  maxLength={MAXIMO_SENHA_ZIP * 2}
                  disabled={executando}
                />
              </Campo>
              <Campo id={`${id}-confirmacao`} rotulo="Confirmar senha do ZIP" disabled={executando}>
                <CampoSenha
                  valor={confirmacao}
                  onValor={setConfirmacao}
                  autoComplete="off"
                  maxLength={MAXIMO_SENHA_ZIP * 2}
                  disabled={executando}
                />
              </Campo>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                A senha do ZIP não é enviada ao servidor nem guardada pelo app e não pode ser
                recuperada. Compartilhe a senha por outro canal. Para abrir, use um extrator
                compatível com ZIP AES, como 7-Zip ou Keka. Extraia o arquivo antes de importar uma
                cópia ou relação.
              </Typography>
            </>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              O conteúdo ficará acessível a quem tiver o arquivo. Guarde em local seguro e
              compartilhe somente com pessoas autorizadas.
            </Typography>
          )}
          {erro ? (
            <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
          ) : null}
        </Stack>
      </Box>
    </Dialogo>
  );
}

export default function DialogoDownload({ aberto, ...props }: Props) {
  // Desmontar o conteúdo limpa a senha também ao fechar ou trocar de visão.
  return aberto ? <ConteudoDownload {...props} /> : null;
}
