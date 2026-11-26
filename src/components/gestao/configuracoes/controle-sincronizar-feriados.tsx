"use client";

// Botão que grava os feriados do ano e fica bloqueado até a senha do administrador.
import { useEffect, useId, useRef, useState } from "react";
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type {
  AbrangenciaFeriados,
  EstadoSincronizacaoFeriados,
  ResumoSincronizacaoFeriados,
} from "@/domain/feriados-externos";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import { Dialogo } from "@/components/ui/mui/dialogo";

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
    return `Feriados nacionais, estaduais e municipais de ${ano}. Gravação imediata.`;
  }
  if (abrangencia === "estaduais") {
    return `Feriados nacionais e estaduais de ${ano}. Gravação imediata.`;
  }
  return `Feriados nacionais de ${ano}. Gravação imediata.`;
}

export default function ControleSincronizarFeriados({
  ano,
  anoValido,
  revisao,
  desabilitado,
  onExecutandoChange,
  onAtualizar,
}: Props) {
  const { avisarErro, avisarInfo, avisarSucesso } = useAvisosDaSessao();
  const ajudaId = useId();
  const idBotao = useId();
  const senhaId = useId();
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
    document.getElementById(idBotao)?.focus();
  }, [desbloqueado, idBotao]);

  const ocupado = desabilitado || executando || desbloqueio.executando || carregando;
  const podeSincronizar =
    anoValido &&
    !ocupado &&
    leituraAtual !== null &&
    !leituraAtual.erro &&
    estado.configurado &&
    (!sincronizado || desbloqueado);
  const ajuda = !anoValido
    ? "Selecione um ano de 1900 a 2199."
    : carregando
      ? "Conferindo o calendário."
      : leituraAtual?.erro
        ? "Não foi possível conferir a sincronização."
        : !estado.configurado
          ? "A consulta de feriados não está configurada."
          : sincronizado && !desbloqueado
            ? "Feriados sincronizados. Nova consulta exige a senha do administrador."
            : desbloqueado
              ? `Sincronização de ${ano} liberada para uma gravação imediata.`
              : textoDaBusca(estado.abrangencia, ano);

  function fecharDialogo() {
    if (desbloqueio.executando) return;
    setDialogoAberto(false);
    setSenha("");
    setErroSenha(null);
  }

  return (
    <Box
      sx={(tema) => ({
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: 2,
        borderRadius: 2,
        border: `1px solid ${tema.vars.palette.divider}`,
        backgroundColor: `color-mix(in srgb, ${tema.vars.palette.text.primary} 4%, transparent)`,
        minWidth: 0,
      })}
    >
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <Botao
          id={idBotao}
          type="button"
          variante="primario"
          disabled={!podeSincronizar}
          carregando={executando || (anoValido && carregando)}
          icone={<CloudDownloadRoundedIcon />}
          aria-describedby={ajudaId}
          onClick={() => void executar()}
        >
          Sincronizar feriados
        </Botao>
        {sincronizado &&
        !desbloqueado &&
        estado.configurado &&
        !leituraAtual?.erro &&
        !carregando ? (
          <Botao
            type="button"
            variante="contorno"
            disabled={ocupado || !anoValido}
            icone={<LockRoundedIcon />}
            onClick={() => {
              setErro("");
              setErroSenha(null);
              setDialogoAberto(true);
            }}
          >
            Desbloquear
          </Botao>
        ) : null}
        {leituraAtual?.erro ? (
          <Botao
            type="button"
            variante="contorno"
            disabled={desabilitado || executando}
            icone={<RefreshRoundedIcon />}
            onClick={() => setTentativa((atual) => atual + 1)}
          >
            Tentar de novo
          </Botao>
        ) : null}
        {desbloqueado ? (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <LockOpenRoundedIcon fontSize="small" aria-hidden="true" />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Liberado para uma gravação
            </Typography>
          </Stack>
        ) : null}
      </Stack>
      <Typography id={ajudaId} variant="caption" sx={{ color: "text.secondary" }}>
        {anoValido && carregando ? (
          <TextoDeCarregamento anunciar>{ajuda}</TextoDeCarregamento>
        ) : (
          ajuda
        )}
      </Typography>
      {erro ? (
        <AlertaCompacto
          variante={varianteErro}
          titulo="Confira a sincronização"
          descricao={erro}
          tamanho="linha"
        />
      ) : null}
      <Dialogo
        aberto={dialogoAberto}
        onFechar={fecharDialogo}
        titulo="Desbloquear sincronização"
        descricao={`A senha do administrador libera uma nova gravação dos feriados de ${ano}.`}
      >
        <Box
          component="form"
          onSubmit={(evento) => {
            evento.preventDefault();
            void desbloqueio.executar();
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Campo id={senhaId} rotulo="Senha do administrador">
            <CampoSenha
              id={senhaId}
              valor={senha}
              onValor={setSenha}
              autoComplete="current-password"
              disabled={desbloqueio.executando}
            />
          </Campo>
          {erroSenha ? (
            <AlertaCompacto
              variante={estadoDeErro(new ErroApi(erroSenha.mensagem, erroSenha.status))}
              titulo="Confira a senha"
              descricao={erroSenha.mensagem}
              tamanho="linha"
            />
          ) : null}
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao
              type="button"
              variante="contorno"
              disabled={desbloqueio.executando}
              onClick={fecharDialogo}
            >
              Cancelar
            </Botao>
            <Botao
              type="submit"
              variante="secundario"
              carregando={desbloqueio.executando}
              disabled={!senha.trim()}
            >
              Desbloquear
            </Botao>
          </Stack>
        </Box>
      </Dialogo>
    </Box>
  );
}
