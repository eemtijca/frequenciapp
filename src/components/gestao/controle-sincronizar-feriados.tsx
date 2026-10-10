"use client";

// Botão que grava os feriados do ano e fica bloqueado até a senha do administrador.
import { useEffect, useId, useRef, useState } from "react";
import { Download, LoaderCircle, LockKeyhole } from "lucide-react";
import type {
  AbrangenciaFeriados,
  EstadoSincronizacaoFeriados,
  ResumoSincronizacaoFeriados,
} from "@/domain/feriados-externos";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";

interface Props {
  ano: string;
  anoValido: boolean;
  revisao: string;
  desabilitado: boolean;
  onExecutandoChange: (executando: boolean) => void;
  onAtualizar: () => Promise<void>;
}

interface Leitura {
  chave: string;
  erro: boolean;
  estado: EstadoSincronizacaoFeriados;
}

const ESTADO_VAZIO: EstadoSincronizacaoFeriados = {
  sincronizado: false,
  configurado: false,
  abrangencia: "nacionais",
};

function textoDaBusca(abrangencia: AbrangenciaFeriados, ano: string): string {
  if (abrangencia === "municipais") {
    return `Busca os feriados nacionais, estaduais e municipais de ${ano} e grava as datas no calendário.`;
  }
  if (abrangencia === "estaduais") {
    return `Busca os feriados nacionais e estaduais de ${ano} e grava as datas no calendário.`;
  }
  return `Busca os feriados nacionais de ${ano} e grava as datas no calendário.`;
}

export default function ControleSincronizarFeriados({
  ano,
  anoValido,
  revisao,
  desabilitado,
  onExecutandoChange,
  onAtualizar,
}: Props) {
  const ajudaId = useId();
  const senhaId = useId();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const focar = useRef(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const chaveLeitura = `${ano}:${revisao}:${tentativa}`;
  const [prova, setProva] = useState<{ ano: string; valor: string } | null>(null);
  const [forcarBloqueio, setForcarBloqueio] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [varianteErro, setVarianteErro] = useState<VarianteEstado>("indisponivel");
  const [erroSenha, setErroSenha] = useState<{ mensagem: string; status: number } | null>(null);
  const desbloqueado = prova?.ano === ano && prova.valor.length > 0;
  const leituraAtual = leitura?.chave === chaveLeitura ? leitura : null;
  const carregando = anoValido && leituraAtual === null;
  const estado = leituraAtual?.estado ?? ESTADO_VAZIO;
  const sincronizado = (leituraAtual?.estado.sincronizado ?? false) || forcarBloqueio;

  useEffect(() => {
    if (!anoValido) return;
    let ativo = true;
    const chave = chaveLeitura;
    void pedir<EstadoSincronizacaoFeriados>("/api/calendario-letivo/sincronizacao")
      .then((dados) => {
        if (!ativo) return;
        setLeitura({ chave, erro: false, estado: dados });
        if (!dados.sincronizado) setForcarBloqueio(false);
      })
      .catch(() => {
        if (!ativo) return;
        setLeitura({ chave, erro: true, estado: ESTADO_VAZIO });
      });
    return () => {
      ativo = false;
    };
  }, [anoValido, chaveLeitura]);

  const { executando, executar } = useAcaoUnica(async () => {
    setErro("");
    try {
      const resumo = await pedir<ResumoSincronizacaoFeriados>(
        "/api/calendario-letivo/sincronizar",
        corpoJson({
          ano: Number(ano),
          ...(desbloqueado && prova ? { prova: prova.valor } : {}),
        }),
      );
      setProva(null);
      setForcarBloqueio(resumo.sincronizado);
      const aviso = !resumo.sincronizado
        ? "Nenhuma data nova foi gravada. As datas consultadas já têm chamada salva."
        : resumo.ignorados > 0
          ? "Feriados sincronizados. Datas com chamada salva foram mantidas."
          : "Feriados sincronizados.";
      try {
        await onAtualizar();
      } catch {
        const pendente = resumo.sincronizado
          ? "Feriados sincronizados. Atualize o calendário para conferir."
          : "Nenhuma data nova foi gravada. Atualize o calendário para conferir.";
        setVarianteErro("indisponivel");
        setErro(pendente);
        avisarInfo(pendente);
        return;
      }
      if (resumo.sincronizado) avisarSucesso(aviso);
      else avisarInfo(aviso);
    } catch (excecao) {
      if (excecao instanceof ErroApi && excecao.status === 409) {
        setProva(null);
        setForcarBloqueio(true);
        setTentativa((atual) => atual + 1);
      }
      setVarianteErro(estadoDeErro(excecao));
      setErro(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível sincronizar os feriados.",
      );
      avisarErro(excecao, { contexto: "Não foi possível sincronizar os feriados." });
    }
  });

  const desbloqueio = useAcaoUnica(async () => {
    if (!senha.trim()) {
      setErroSenha({ mensagem: "Informe a senha do administrador.", status: 400 });
      return;
    }
    setErroSenha(null);
    try {
      const dados = await pedir<{ prova: string }>(
        "/api/calendario-letivo/sincronizar/desbloqueio",
        corpoJson({ ano: Number(ano), senha }),
      );
      setProva({ ano, valor: dados.prova });
      setSenha("");
      setDialogoAberto(false);
      focar.current = true;
      avisarSucesso("Sincronização desbloqueada.");
    } catch (excecao) {
      setErroSenha({
        mensagem:
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível desbloquear a sincronização.",
        status: excecao instanceof ErroApi ? excecao.status : 500,
      });
      avisarErro(excecao, { contexto: "Não foi possível desbloquear a sincronização." });
    }
  });

  useEffect(() => {
    onExecutandoChange(executando || desbloqueio.executando);
  }, [desbloqueio.executando, executando, onExecutandoChange]);

  useEffect(() => {
    if (!focar.current || !desbloqueado) return;
    focar.current = false;
    botaoRef.current?.focus();
  }, [desbloqueado]);

  const ocupado = desabilitado || executando || desbloqueio.executando || carregando;
  const podeSincronizar =
    anoValido &&
    !ocupado &&
    leituraAtual !== null &&
    !leituraAtual.erro &&
    estado.configurado &&
    (!sincronizado || desbloqueado);
  const ajuda = !anoValido
    ? "Selecione um ano entre 1900 e 2199 para sincronizar."
    : carregando
      ? "Conferindo o calendário."
      : leituraAtual?.erro
        ? "Não foi possível conferir a sincronização."
        : !estado.configurado
          ? "A consulta de feriados não está configurada."
          : sincronizado && !desbloqueado
            ? "Os feriados já estão gravados. Desbloqueie a sincronização com a senha do administrador."
            : desbloqueado
              ? `A sincronização de ${ano} está liberada. O botão volta a ficar bloqueado depois da gravação.`
              : textoDaBusca(estado.abrangencia, ano);

  function fecharDialogo() {
    if (desbloqueio.executando) return;
    setDialogoAberto(false);
    setSenha("");
    setErroSenha(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p id={ajudaId} className="text-muted-foreground text-sm">
        {ajuda}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={botaoRef}
          type="button"
          disabled={!podeSincronizar}
          aria-describedby={ajudaId}
          onClick={() => void executar()}
        >
          {executando ? (
            <LoaderCircle
              size={16}
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Download size={16} aria-hidden="true" />
          )}
          Sincronizar feriados
        </Button>
        {sincronizado &&
          !desbloqueado &&
          estado.configurado &&
          !leituraAtual?.erro &&
          !carregando && (
            <Button
              type="button"
              variant="outline"
              disabled={ocupado || !anoValido}
              onClick={() => {
                setErro("");
                setErroSenha(null);
                setDialogoAberto(true);
              }}
            >
              <LockKeyhole size={16} aria-hidden="true" />
              Desbloquear
            </Button>
          )}
        {leituraAtual?.erro && (
          <Button
            type="button"
            variant="outline"
            disabled={desabilitado || executando}
            onClick={() => setTentativa((atual) => atual + 1)}
          >
            Tentar de novo
          </Button>
        )}
      </div>
      {erro && (
        <AvisoCompacto
          variante={varianteErro}
          titulo="Confira a sincronização"
          descricao={erro}
          tamanho="linha"
        />
      )}
      <Dialog
        open={dialogoAberto}
        onOpenChange={(aberto) => {
          if (aberto) setDialogoAberto(true);
          else fecharDialogo();
        }}
      >
        <DialogContent
          showCloseButton={!desbloqueio.executando}
          onEscapeKeyDown={(evento) => {
            evento.preventDefault();
            fecharDialogo();
          }}
          onPointerDownOutside={(evento) => {
            evento.preventDefault();
            fecharDialogo();
          }}
        >
          <DialogHeader>
            <DialogTitle>Desbloquear sincronização</DialogTitle>
            <DialogDescription>
              Informe a senha do administrador para liberar uma nova sincronização de {ano}. A senha
              evita um clique acidental.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              void desbloqueio.executar();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={senhaId}>Senha do administrador</Label>
              <CampoSenha
                id={senhaId}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                autoComplete="current-password"
                maxLength={200}
                disabled={desbloqueio.executando}
                className="h-11"
              />
            </div>
            {erroSenha && (
              <AvisoCompacto
                variante={estadoDeErro(new ErroApi(erroSenha.mensagem, erroSenha.status))}
                titulo="Confira a senha"
                descricao={erroSenha.mensagem}
                tamanho="linha"
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={desbloqueio.executando}
                onClick={fecharDialogo}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={desbloqueio.executando || !senha.trim()}>
                {desbloqueio.executando && (
                  <LoaderCircle
                    size={16}
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                Desbloquear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
