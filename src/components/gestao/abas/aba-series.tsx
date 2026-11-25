"use client";

// Aba de séries: criar, renomear, reordenar e excluir.
import { useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import type { Serie } from "@/domain/frequencia";
import { normalizar } from "@/domain/frequencia";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  series: Serie[];
  onMudanca: () => Promise<void>;
}

interface Formulario {
  nome: string;
  ordem: string;
}

const VAZIO: Formulario = { nome: "", ordem: "1" };

const ESPACO_ACOES = 0.5;
const ALVO_ACAO = {
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
} as const;

export default function AbaSeries({ series, onMudanca }: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Serie | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const { chaveAtiva, executar } = useAcoesPorChave();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [busca, setBusca] = useState("");
  const [excluirAlvo, setExcluirAlvo] = useState<Serie | null>(null);
  const termo = normalizar(busca);
  const filtradas = series.filter(
    (serie) => termo === "" || normalizar(serie.nome).includes(termo),
  );

  function abrirNovo() {
    const proxima = series.length > 0 ? Math.max(...series.map((s) => s.ordem)) + 1 : 1;
    setEmEdicao(null);
    setFormulario({ nome: "", ordem: String(proxima) });
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(serie: Serie) {
    setEmEdicao(serie);
    setFormulario({ nome: serie.nome, ordem: String(serie.ordem) });
    setErro("");
    setDialogoAberto(true);
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    const dados = {
      nome: formulario.nome,
      ordem: Number(formulario.ordem),
    };
    try {
      if (emEdicao) {
        await pedir<{ serie: Serie }>(`/api/series/${emEdicao.id}`, corpoAlteracao("PATCH", dados));
        avisarSucesso("Série atualizada.", "O nome novo já aparece na Chamada e nos Relatórios.");
      } else {
        await pedir<{ serie: Serie }>("/api/series", corpoJson(dados));
        avisarSucesso("Série criada.", "Agora é possível cadastrar turmas nesta série.");
      }
      setDialogoAberto(false);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a série.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar a série." });
    } finally {
      setEnviando(false);
    }
  }

  function excluir(serie: Serie) {
    void executar(serie.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/series/${serie.id}`, corpoAlteracao("DELETE"));
        avisarSucesso(`Série ${serie.nome} excluída.`);
        await onMudanca();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível excluir a série." });
      }
    });
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {series.length} {series.length === 1 ? "série" : "séries"}
        </Typography>
        <Botao variante="secundario" icone={<AddRoundedIcon />} onClick={abrirNovo}>
          Nova série
        </Botao>
      </Stack>

      {series.length > 0 ? (
        <BarraBusca id="busca-series" valor={busca} onValor={setBusca} placeholder="Buscar série" />
      ) : null}

      {series.length === 0 ? (
        <EstadoVazio
          icone={<SchoolRoundedIcon />}
          titulo="Nenhuma série cadastrada"
          descricao="Comece pelas séries (por exemplo, 1º ano) e depois crie as turmas."
          acao={
            <Botao variante="contorno" icone={<AddRoundedIcon />} onClick={abrirNovo}>
              Criar série
            </Botao>
          }
        />
      ) : filtradas.length === 0 ? (
        <EstadoVazio
          icone={<SearchOffRoundedIcon />}
          titulo="Nenhuma série encontrada"
          descricao="Tente outro termo de busca."
        />
      ) : (
        <TabelaPadrao caption="Séries cadastradas, na ordem de exibição.">
          <TableHead>
            <TableRow>
              <TableCell scope="col">Série</TableCell>
              <TableCell scope="col" align="right">
                Ordem
              </TableCell>
              <TableCell
                scope="col"
                align="right"
                sx={(tema) => ({
                  width: {
                    sm: `calc(${2 * TOKENS_LAYOUT.alvoToque + 2 * TOKENS_LAYOUT.tabela.padding}px + ${tema.spacing(ESPACO_ACOES)})`,
                  },
                })}
              >
                Ações
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtradas.map((serie) => (
              <TableRow key={serie.id}>
                <TableCell component="th" scope="row" sx={{ overflowWrap: "anywhere" }}>
                  <Typography component="span" variant="body1" sx={{ fontWeight: 500 }}>
                    {serie.nome}
                  </Typography>
                </TableCell>
                <TableCell data-numero="true">{String(serie.ordem).padStart(2, "0")}</TableCell>
                <TableCell align="right">
                  <Stack
                    direction="row"
                    spacing={ESPACO_ACOES}
                    useFlexGap
                    sx={{ justifyContent: "flex-end", flexWrap: { xs: "wrap", sm: "nowrap" } }}
                  >
                    <BotaoIcone
                      rotulo={`Editar série ${serie.nome}`}
                      icone={<EditRoundedIcon fontSize="small" />}
                      variante="texto"
                      sx={ALVO_ACAO}
                      onClick={() => abrirEdicao(serie)}
                    />
                    <BotaoIcone
                      rotulo={`Excluir série ${serie.nome}`}
                      icone={<DeleteRoundedIcon fontSize="small" />}
                      variante="texto"
                      sx={[ALVO_ACAO, (tema) => ({ color: tema.vars.palette.falta.texto })]}
                      disabled={chaveAtiva === serie.id}
                      onClick={() => setExcluirAlvo(serie)}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TabelaPadrao>
      )}

      <Dialogo
        aberto={dialogoAberto}
        onFechar={() => setDialogoAberto(false)}
        titulo={emEdicao ? "Editar série" : "Nova série"}
        acoes={
          <>
            <Botao variante="texto" onClick={() => setDialogoAberto(false)}>
              Cancelar
            </Botao>
            <Botao variante="secundario" carregando={enviando} onClick={() => void submeter()}>
              {emEdicao ? "Salvar" : "Criar"}
            </Botao>
          </>
        }
      >
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            void submeter();
          }}
          noValidate
        >
          <Stack spacing={2}>
            <Campo id="nome-serie" rotulo="Nome">
              <CampoTexto
                valor={formulario.nome}
                onValor={(nome) => setFormulario((atual) => ({ ...atual, nome }))}
                required
                maxLength={40}
                autoComplete="off"
                autoFocus
                placeholder="Por exemplo: 1º ano"
              />
            </Campo>
            <Campo
              id="ordem-serie"
              rotulo="Ordem de exibição"
              descricao="Menor número aparece primeiro na listagem."
            >
              <CampoTexto
                valor={formulario.ordem}
                onValor={(ordem) => setFormulario((atual) => ({ ...atual, ordem }))}
                required
                inputMode="numeric"
                maxLength={3}
              />
            </Campo>
            {erro ? (
              <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
            ) : null}
          </Stack>
        </form>
      </Dialogo>

      <DialogoConfirmacao
        aberto={excluirAlvo !== null}
        titulo={`Excluir a série ${excluirAlvo?.nome ?? ""}?`}
        quebrarTitulo
        descricao="A exclusão só é possível quando a série não tem turmas."
        rotuloConfirmar="Excluir"
        destrutivo
        operacaoEmAndamento={excluirAlvo !== null && chaveAtiva === excluirAlvo.id}
        onConfirmar={() => {
          const alvo = excluirAlvo;
          setExcluirAlvo(null);
          if (alvo) excluir(alvo);
        }}
        onCancelar={() => setExcluirAlvo(null)}
      />
    </Stack>
  );
}
