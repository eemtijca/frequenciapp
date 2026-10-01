"use client";

// Escolha comum a todas as exportações: ZIP protegido por padrão,
// senha apenas em memória e preparação do arquivo após confirmação.
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { erroSenhaZip, MAXIMO_SENHA_ZIP } from "@/domain/downloads";
import { baixarArquivo, protegerArquivo, type ArquivoDownload } from "@/lib/downloads";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro } from "@/lib/avisos";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  preparar: (senhaAdmin: string) => ArquivoDownload | Promise<ArquivoDownload>;
  confirmarAdmin?: boolean;
  onConcluido: () => void;
}

function ConteudoDownload({
  onAbrir,
  preparar,
  onConcluido,
  confirmarAdmin,
}: Omit<Props, "aberto">) {
  const id = useId();
  const [protegido, setProtegido] = useState(true);
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
    <DialogContent
      showCloseButton={!executando}
      onEscapeKeyDown={(evento) => {
        evento.preventDefault();
        fechar();
      }}
      onPointerDownOutside={(evento) => {
        evento.preventDefault();
        fechar();
      }}
    >
      <DialogHeader>
        <DialogTitle>Preparar download</DialogTitle>
        <DialogDescription>
          O arquivo contém dados escolares. A proteção por senha ajuda a limitar o acesso ao
          conteúdo ao compartilhar ou guardar a exportação.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void executar();
        }}
      >
        {confirmarAdmin && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-admin`}>Senha atual do administrador</Label>
            <CampoSenha
              id={`${id}-admin`}
              value={senhaAdmin}
              onChange={(evento) => setSenhaAdmin(evento.target.value)}
              autoComplete="current-password"
              maxLength={200}
              disabled={executando}
              className="h-11"
            />
            <p className="text-muted-foreground text-xs">
              Confirma o acesso à cópia completa da escola. É diferente da senha do ZIP.
            </p>
          </div>
        )}
        <fieldset disabled={executando} className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Formato do download</legend>
          <Label className="flex min-h-11 items-center gap-3 rounded-lg border p-3">
            <input
              type="radio"
              name={`${id}-formato`}
              checked={protegido}
              onChange={() => {
                setProtegido(true);
                setErro("");
              }}
            />
            ZIP protegido por senha
          </Label>
          <Label className="flex min-h-11 items-center gap-3 rounded-lg border p-3">
            <input
              type="radio"
              name={`${id}-formato`}
              checked={!protegido}
              onChange={() => {
                setProtegido(false);
                setSenha("");
                setConfirmacao("");
                setErro("");
              }}
            />
            Arquivo original sem senha
          </Label>
        </fieldset>
        {protegido ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-senha`}>Senha do ZIP</Label>
              <CampoSenha
                id={`${id}-senha`}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                autoComplete="off"
                maxLength={MAXIMO_SENHA_ZIP * 2}
                disabled={executando}
                spellCheck={false}
                autoCapitalize="none"
                aria-describedby={`${id}-ajuda`}
                className="h-11"
              />
              <p id={`${id}-ajuda`} className="text-muted-foreground text-xs">
                De 12 a 128 caracteres. Prefira uma frase longa, diferente da senha de acesso.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-confirmacao`}>Confirmar senha do ZIP</Label>
              <CampoSenha
                id={`${id}-confirmacao`}
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
                autoComplete="off"
                maxLength={MAXIMO_SENHA_ZIP * 2}
                disabled={executando}
                spellCheck={false}
                autoCapitalize="none"
                className="h-11"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              A senha do ZIP não é enviada ao servidor nem guardada pelo app e não pode ser
              recuperada. Compartilhe a senha por outro canal. Para abrir, use um extrator
              compatível com ZIP AES, como 7-Zip ou Keka. Extraia o arquivo antes de importar uma
              cópia ou relação.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            O conteúdo ficará acessível a quem tiver o arquivo. Guarde em local seguro e compartilhe
            somente com pessoas autorizadas.
          </p>
        )}
        {erro && (
          <p role="alert" className="text-destructive text-sm">
            {erro}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={executando} onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={executando}>
            {executando && <LoaderCircle size={16} className="animate-spin" />}
            {executando
              ? "Preparando..."
              : protegido
                ? "Baixar ZIP protegido"
                : "Baixar arquivo original"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function DialogoDownload({ aberto, ...props }: Props) {
  // Desmontar o conteúdo limpa a senha também ao fechar ou trocar de visão.
  return (
    <Dialog open={aberto} onOpenChange={props.onAbrir}>
      {aberto && <ConteudoDownload {...props} />}
    </Dialog>
  );
}
