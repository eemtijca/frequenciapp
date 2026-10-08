"use client";

// Configurações da escola agrupadas por assunto, preservando os formulários
// ao trocar de categoria. Restrita à administração, com auditoria no servidor.
import { useRef, useState } from "react";
import {
  Archive,
  Check,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Pencil,
  Plus,
  ScrollText,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type {
  Configuracoes,
  JustificativaConfigurada,
  LiberadorConfigurado,
  Serie,
  Turma,
} from "@/domain/frequencia";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selo } from "@/components/ui/selo";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import DialogoDownload from "@/components/conta/dialogo-download";
import SecaoAcessoDiretores from "@/components/gestao/secao-acesso-diretores";
import SecaoNotificacoes from "@/components/gestao/secao-notificacoes";
import IntegracaoPlanilha from "@/components/gestao/integracao-planilha";
import IntegracaoSaidas from "@/components/gestao/integracao-saidas";
import IntegracaoParcial from "@/components/gestao/integracao-parcial";
import SecaoIndicadores from "@/components/gestao/secao-indicadores";
import SecaoFilaPlanilha from "@/components/gestao/secao-fila-planilha";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  planilhaInicial?: "FREQUENCIA" | "SAIDAS" | "PARCIAL";
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  series: Serie[];
  turmas: Turma[];
  diaCorrente: string;
  onMudanca: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
  onLiberadoresMudaram: () => Promise<void>;
  onAbrirSaidas?: () => void;
  onAbrirParcial?: () => void;
}

interface ResultadoImportacao {
  adicionadas: number;
  identicas: number;
  conflitos: number;
}

const LIMITE_ARQUIVO = 25 * 1024 * 1024;
const CATEGORIAS = [
  { valor: "escola", rotulo: "Escola", icone: Settings2 },
  { valor: "planilhas", rotulo: "Planilhas", icone: FileSpreadsheet },
  { valor: "acesso", rotulo: "Acesso e avisos", icone: ShieldCheck },
  { valor: "dados", rotulo: "Dados", icone: Archive },
] as const;
type Categoria = (typeof CATEGORIAS)[number]["valor"];

export default function AbaConfiguracoes({
  planilhaInicial,
  configuracoes,
  justificativas,
  liberadores,
  series,
  turmas,
  diaCorrente,
  onMudanca,
  onJustificativasMudaram,
  onLiberadoresMudaram,
  onAbrirSaidas,
  onAbrirParcial,
}: Props) {
  const [categoria, setCategoria] = useState<Categoria>(planilhaInicial ? "planilhas" : "escola");
  const [abertoRecursos, setAbertoRecursos] = useState(true);
  const [abertoJustificativas, setAbertoJustificativas] = useState(false);
  const [abertoLiberadores, setAbertoLiberadores] = useState(false);
  const [abertoCopia, setAbertoCopia] = useState(false);
  const [abertoTurmasOrigem, setAbertoTurmasOrigem] = useState(false);
  const [salvando, setSalvando] = useState<
    "frequenciaPorAula" | "saidaAntecipada" | "origemNaChamada" | null
  >(null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [downloadAberto, setDownloadAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erroCopia, setErroCopia] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const [novaCodigo, setNovaCodigo] = useState("");
  const [novaRotulo, setNovaRotulo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [rotuloEdicao, setRotuloEdicao] = useState("");
  const [erroJustificativa, setErroJustificativa] = useState("");
  const [erroJustificativaVariante, setErroJustificativaVariante] =
    useState<VarianteEstado>("dados_invalidos");
  const [enviandoJustificativa, setEnviandoJustificativa] = useState(false);
  const [excluirAlvo, setExcluirAlvo] = useState<JustificativaConfigurada | null>(null);
  const { executar: executarPorChave } = useAcoesPorChave();

  const [novaCodigoLiberador, setNovaCodigoLiberador] = useState("");
  const [novaRotuloLiberador, setNovaRotuloLiberador] = useState("");
  const [editandoLiberador, setEditandoLiberador] = useState<string | null>(null);
  const [rotuloEdicaoLiberador, setRotuloEdicaoLiberador] = useState("");
  const [erroLiberador, setErroLiberador] = useState("");
  const [erroLiberadorVariante, setErroLiberadorVariante] =
    useState<VarianteEstado>("dados_invalidos");
  const [enviandoLiberador, setEnviandoLiberador] = useState(false);
  const [excluirAlvoLiberador, setExcluirAlvoLiberador] = useState<LiberadorConfigurado | null>(
    null,
  );

  async function alternar(chave: "frequenciaPorAula" | "saidaAntecipada", valor: boolean) {
    await executarPorChave(`recurso-${chave}`, async () => {
      setSalvando(chave);
      setErro("");
      try {
        const dados = await pedir<{ configuracoes: Configuracoes }>(
          "/api/configuracoes",
          corpoAlteracao("PATCH", { [chave]: valor }),
        );
        onMudanca(dados.configuracoes);
        toast.success(
          chave === "frequenciaPorAula"
            ? valor
              ? "Chamada por aula ativada."
              : "Chamada por aula desativada."
            : valor
              ? "Saídas e entradas ativadas."
              : "Saídas e entradas desativadas.",
        );
      } catch (excecao) {
        setErro(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a configuração.",
        );
        setErroVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível salvar a configuração." });
      } finally {
        setSalvando(null);
      }
    });
  }

  async function salvarOrigem(
    entrada: Partial<
      Pick<Configuracoes, "origemNaChamada" | "origemNaChamadaSerieIds" | "origemNaChamadaTurmaIds">
    >,
  ) {
    await executarPorChave("recurso-origem", async () => {
      setSalvando("origemNaChamada");
      setErro("");
      try {
        const dados = await pedir<{ configuracoes: Configuracoes }>(
          "/api/configuracoes",
          corpoAlteracao("PATCH", entrada),
        );
        onMudanca(dados.configuracoes);
        toast.success("Indicação de origem atualizada.");
      } catch (excecao) {
        setErro(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a configuração.",
        );
        setErroVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível salvar a configuração." });
      } finally {
        setSalvando(null);
      }
    });
  }

  function selecaoAlterada(ids: string[], id: string, marcado: boolean): string[] {
    return marcado ? [...ids, id] : ids.filter((atual) => atual !== id);
  }

  async function criarJustificativa() {
    await executarPorChave("justificativa-nova", async () => {
      if (enviandoJustificativa) return;
      setEnviandoJustificativa(true);
      setErroJustificativa("");
      try {
        await pedir<{ justificativa: JustificativaConfigurada }>(
          "/api/justificativas",
          corpoJson({ codigo: novaCodigo, rotulo: novaRotulo }),
        );
        setNovaCodigo("");
        setNovaRotulo("");
        await onJustificativasMudaram();
        avisarSucesso(
          "Justificativa adicionada.",
          "Ela já aparece no seletor da Chamada e das Saídas.",
        );
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível adicionar a justificativa.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível adicionar a justificativa." });
      } finally {
        setEnviandoJustificativa(false);
      }
    });
  }

  async function salvarRotulo(codigo: string) {
    await executarPorChave(`justificativa-rotulo-${codigo}`, async () => {
      if (enviandoJustificativa) return;
      setEnviandoJustificativa(true);
      setErroJustificativa("");
      try {
        await pedir<{ justificativa: JustificativaConfigurada }>(
          `/api/justificativas/${encodeURIComponent(codigo)}`,
          corpoAlteracao("PATCH", { rotulo: rotuloEdicao }),
        );
        setEditando(null);
        setRotuloEdicao("");
        await onJustificativasMudaram();
        avisarSucesso("Justificativa atualizada.", "O seletor da Chamada já mostra o rótulo novo.");
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível atualizar a justificativa.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível atualizar a justificativa." });
      } finally {
        setEnviandoJustificativa(false);
      }
    });
  }

  async function alternarAtivo(item: JustificativaConfigurada) {
    await executarPorChave(`justificativa-${item.codigo}`, async () => {
      setErroJustificativa("");
      try {
        await pedir<{ justificativa: JustificativaConfigurada }>(
          `/api/justificativas/${encodeURIComponent(item.codigo)}`,
          corpoAlteracao("PATCH", { ativo: !item.ativo }),
        );
        await onJustificativasMudaram();
        avisarSucesso(
          item.ativo ? "Justificativa desativada." : "Justificativa reativada.",
          item.ativo
            ? "O histórico que usa o código continua intacto."
            : "Ela volta a aparecer no seletor da Chamada.",
        );
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível alterar a situação.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível alterar a situação." });
      }
    });
  }

  async function removerJustificativa(item: JustificativaConfigurada) {
    await executarPorChave(`justificativa-excluir-${item.codigo}`, async () => {
      setErroJustificativa("");
      try {
        await pedir<{ ok: boolean }>(`/api/justificativas/${encodeURIComponent(item.codigo)}`, {
          method: "DELETE",
        });
        await onJustificativasMudaram();
        toast.success("Justificativa excluída.");
      } catch (excecao) {
        setErroJustificativa(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível excluir a justificativa.",
        );
        setErroJustificativaVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível excluir a justificativa." });
      } finally {
        setExcluirAlvo(null);
      }
    });
  }

  async function criarLiberador() {
    await executarPorChave("liberador-novo", async () => {
      if (enviandoLiberador) return;
      setEnviandoLiberador(true);
      setErroLiberador("");
      try {
        await pedir<{ liberador: LiberadorConfigurado }>(
          "/api/liberadores",
          corpoJson({ codigo: novaCodigoLiberador, rotulo: novaRotuloLiberador }),
        );
        setNovaCodigoLiberador("");
        setNovaRotuloLiberador("");
        await onLiberadoresMudaram();
        avisarSucesso(
          "Responsável adicionado.",
          "Ele já aparece no seletor de quem liberou, nas Saídas.",
        );
      } catch (excecao) {
        setErroLiberador(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível adicionar o responsável.",
        );
        setErroLiberadorVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível adicionar o responsável." });
      } finally {
        setEnviandoLiberador(false);
      }
    });
  }

  async function salvarRotuloLiberador(codigo: string) {
    await executarPorChave(`liberador-rotulo-${codigo}`, async () => {
      if (enviandoLiberador) return;
      setEnviandoLiberador(true);
      setErroLiberador("");
      try {
        await pedir<{ liberador: LiberadorConfigurado }>(
          `/api/liberadores/${encodeURIComponent(codigo)}`,
          corpoAlteracao("PATCH", { rotulo: rotuloEdicaoLiberador }),
        );
        setEditandoLiberador(null);
        setRotuloEdicaoLiberador("");
        await onLiberadoresMudaram();
        avisarSucesso("Responsável atualizado.", "O seletor das Saídas já mostra o rótulo novo.");
      } catch (excecao) {
        setErroLiberador(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível atualizar o responsável.",
        );
        setErroLiberadorVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível atualizar o responsável." });
      } finally {
        setEnviandoLiberador(false);
      }
    });
  }

  async function alternarAtivoLiberador(item: LiberadorConfigurado) {
    await executarPorChave(`liberador-${item.codigo}`, async () => {
      setErroLiberador("");
      try {
        await pedir<{ liberador: LiberadorConfigurado }>(
          `/api/liberadores/${encodeURIComponent(item.codigo)}`,
          corpoAlteracao("PATCH", { ativo: !item.ativo }),
        );
        await onLiberadoresMudaram();
        avisarSucesso(
          item.ativo ? "Responsável desativado." : "Responsável reativado.",
          item.ativo
            ? "As saídas antigas continuam mostrando o nome dele."
            : "Ele volta a aparecer no seletor das Saídas.",
        );
      } catch (excecao) {
        setErroLiberador(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível alterar a situação do responsável.",
        );
        setErroLiberadorVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível alterar a situação do responsável." });
      }
    });
  }

  async function removerLiberador(item: LiberadorConfigurado) {
    await executarPorChave(`liberador-excluir-${item.codigo}`, async () => {
      setErroLiberador("");
      try {
        await pedir<{ ok: boolean }>(`/api/liberadores/${encodeURIComponent(item.codigo)}`, {
          method: "DELETE",
        });
        await onLiberadoresMudaram();
        toast.success("Responsável excluído.");
      } catch (excecao) {
        setErroLiberador(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível excluir o responsável.",
        );
        setErroLiberadorVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível excluir o responsável." });
      } finally {
        setExcluirAlvoLiberador(null);
      }
    });
  }

  async function prepararCopia(senha: string) {
    const dados = await pedir<unknown>("/api/backup/exportar", corpoJson({ senha }));
    return {
      blob: new Blob([JSON.stringify(dados, null, 2)], { type: "application/json;charset=utf-8" }),
      nome: `frequenciapp-copia-${diaCorrente}.json`,
      nomeNoZip: "copia.json",
      nomeZip: "frequenciapp-copia.zip",
    };
  }

  async function importar(arquivo: File) {
    const aviso = "backup-importar";
    await executarPorChave(aviso, async () => {
      setImportando(true);
      setErroCopia("");
      setResultado(null);
      toast.loading("Importando a cópia de segurança...", { id: aviso });
      try {
        if (arquivo.size > LIMITE_ARQUIVO) {
          throw new Error("A cópia é muito grande. Use um arquivo de até 25 MB.");
        }
        let corpo: unknown;
        try {
          corpo = JSON.parse(await arquivo.text());
        } catch {
          throw new Error("Não foi possível ler a cópia. Selecione o arquivo JSON correto.");
        }
        const dados = await pedir<ResultadoImportacao>("/api/backup", corpoJson(corpo));
        setResultado(dados);
        avisarSucesso(
          "Importação concluída.",
          "Confira o resumo na tela antes de continuar.",
          aviso,
        );
      } catch (excecao) {
        const mensagem = excecao instanceof ErroApi ? excecao.message : (excecao as Error).message;
        setErroCopia(mensagem);
        toast.error(mensagem, {
          id: aviso,
          description: "Confira o arquivo e tente de novo.",
          duration: 8000,
        });
      } finally {
        setImportando(false);
        if (arquivoRef.current) arquivoRef.current.value = "";
      }
    });
  }

  const escola = (
    <>
      <SecaoRecolhivel
        dataSecao="config-recursos"
        titulo="Recursos da escola"
        icone={Settings2}
        aberto={abertoRecursos}
        onAbertoChange={setAbertoRecursos}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-frequencia-aula">Chamada por aula</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Ligada: faltas por aula. Desligada: chamada diária.
            </p>
          </div>
          <Switch
            id="config-frequencia-aula"
            checked={configuracoes.frequenciaPorAula}
            disabled={salvando !== null}
            onCheckedChange={(valor) => void alternar("frequenciaPorAula", valor)}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-saida-antecipada">Saídas e entradas</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Desligar oculta a área e preserva os registros.
            </p>
          </div>
          <Switch
            id="config-saida-antecipada"
            checked={configuracoes.saidaAntecipada}
            disabled={salvando !== null}
            onCheckedChange={(valor) => void alternar("saidaAntecipada", valor)}
          />
        </div>

        <div
          className="superficie-vidro flex flex-col gap-3 p-3"
          role="group"
          aria-label="Turma de origem na Chamada"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="config-origem-chamada">Turma de origem na Chamada</Label>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Mostra a origem e o remanejamento nas séries e turmas selecionadas.
              </p>
            </div>
            <Switch
              id="config-origem-chamada"
              checked={configuracoes.origemNaChamada}
              disabled={salvando !== null}
              onCheckedChange={(valor) => void salvarOrigem({ origemNaChamada: valor })}
            />
          </div>
          {configuracoes.origemNaChamada && (
            <>
              <fieldset disabled={salvando !== null} className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Séries completas</legend>
                <p className="text-muted-foreground text-xs">Inclui as turmas atuais e futuras.</p>
                {series.map((serie) => (
                  <label
                    key={serie.id}
                    className="faixa-toque flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary size-4 shrink-0"
                      aria-label={`Mostrar origem na série ${serie.nome}`}
                      checked={configuracoes.origemNaChamadaSerieIds.includes(serie.id)}
                      onChange={(evento) =>
                        void salvarOrigem({
                          origemNaChamadaSerieIds: selecaoAlterada(
                            configuracoes.origemNaChamadaSerieIds,
                            serie.id,
                            evento.target.checked,
                          ),
                        })
                      }
                    />
                    {serie.nome}
                  </label>
                ))}
              </fieldset>
              <SecaoRecolhivel
                dataSecao="config-origem-turmas"
                nivel="interna"
                titulo="Turmas específicas"
                icone={Users}
                aberto={abertoTurmasOrigem}
                onAbertoChange={setAbertoTurmasOrigem}
                resumo={
                  <Selo
                    variante={
                      configuracoes.origemNaChamadaTurmaIds.length > 0 ? "sucesso" : "neutro"
                    }
                  >
                    {configuracoes.origemNaChamadaTurmaIds.length === 0
                      ? "Nenhuma"
                      : `${configuracoes.origemNaChamadaTurmaIds.length} selecionada${
                          configuracoes.origemNaChamadaTurmaIds.length === 1 ? "" : "s"
                        }`}
                  </Selo>
                }
              >
                <fieldset disabled={salvando !== null} className="flex flex-col gap-2">
                  <legend className="sr-only">Turmas específicas</legend>
                  {turmas.map((item) => (
                    <label
                      key={item.id}
                      className="faixa-toque flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary size-4 shrink-0"
                        aria-label={`Mostrar origem na turma ${item.rotulo}`}
                        checked={configuracoes.origemNaChamadaTurmaIds.includes(item.id)}
                        onChange={(evento) =>
                          void salvarOrigem({
                            origemNaChamadaTurmaIds: selecaoAlterada(
                              configuracoes.origemNaChamadaTurmaIds,
                              item.id,
                              evento.target.checked,
                            ),
                          })
                        }
                      />
                      {item.rotulo}
                    </label>
                  ))}
                </fieldset>
              </SecaoRecolhivel>
              {configuracoes.origemNaChamadaSerieIds.length === 0 &&
                configuracoes.origemNaChamadaTurmaIds.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    Nenhuma série ou turma selecionada.
                  </p>
                )}
            </>
          )}
          {salvando === "origemNaChamada" && (
            <p role="status" className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoaderCircle size={14} className="animate-spin" />
              Salvando indicação de origem...
            </p>
          )}
        </div>

        {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
      </SecaoRecolhivel>

      <SecaoRecolhivel
        dataSecao="config-justificativas"
        titulo="Justificativas"
        descricao="Códigos fixos após o cadastro."
        icone={ScrollText}
        aberto={abertoJustificativas}
        onAbertoChange={setAbertoJustificativas}
        resumo={
          <>
            <Selo>{justificativas.length} no catálogo</Selo>
            <Selo>{justificativas.filter((item) => item.ativo).length} ativas</Selo>
          </>
        }
      >
        <div className="superficie-vidro flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 sm:w-32">
            <Label htmlFor="justificativa-codigo">Código</Label>
            <Input
              id="justificativa-codigo"
              value={novaCodigo}
              maxLength={10}
              autoComplete="off"
              disabled={enviandoJustificativa}
              onChange={(evento) => setNovaCodigo(evento.target.value)}
              placeholder="Ex.: At"
              className="h-11"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="justificativa-rotulo">Rótulo</Label>
            <Input
              id="justificativa-rotulo"
              value={novaRotulo}
              maxLength={60}
              autoComplete="off"
              disabled={enviandoJustificativa}
              onChange={(evento) => setNovaRotulo(evento.target.value)}
              placeholder="Ex.: Atestado"
              className="h-11"
            />
          </div>
          <Button
            type="button"
            className="h-11 sm:w-auto"
            onClick={() => void criarJustificativa()}
            disabled={enviandoJustificativa || novaCodigo.trim() === "" || novaRotulo.trim() === ""}
          >
            {enviandoJustificativa ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            Adicionar
          </Button>
        </div>

        {erroJustificativa && (
          <AvisoCompacto
            variante={erroJustificativaVariante}
            descricao={erroJustificativa}
            tamanho="linha"
          />
        )}

        <ul className="superficie-vidro divide-y overflow-hidden">
          {justificativas.map((item) => (
            <li
              key={item.codigo}
              className={`flex min-h-14 items-center gap-3 px-3 py-2 last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)] ${
                item.ativo ? "" : "opacity-60"
              }`}
            >
              <span className="bg-secondary text-secondary-foreground numerais-tabulares w-12 shrink-0 rounded-md px-1.5 py-1 text-center text-xs font-semibold">
                {item.codigo}
              </span>
              {editando === item.codigo ? (
                <>
                  <Input
                    value={rotuloEdicao}
                    maxLength={60}
                    autoComplete="off"
                    aria-label={`Rótulo de ${item.codigo}`}
                    onChange={(evento) => setRotuloEdicao(evento.target.value)}
                    className="h-10 min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Salvar rótulo de ${item.codigo}`}
                    onClick={() => void salvarRotulo(item.codigo)}
                    disabled={enviandoJustificativa || rotuloEdicao.trim().length < 2}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Cancelar edição de ${item.codigo}`}
                    onClick={() => {
                      setEditando(null);
                      setRotuloEdicao("");
                    }}
                  >
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.rotulo}
                    {item.ativo ? "" : " · desativada"}
                  </span>
                  <Switch
                    checked={item.ativo}
                    aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.codigo}`}
                    onCheckedChange={() => void alternarAtivo(item)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Editar rótulo de ${item.codigo}`}
                    onClick={() => {
                      setEditando(item.codigo);
                      setRotuloEdicao(item.rotulo);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-falta-texto size-10 shrink-0"
                    aria-label={`Excluir ${item.codigo}`}
                    onClick={() => setExcluirAlvo(item)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <AlertDialog
          open={excluirAlvo !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setExcluirAlvo(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a justificativa {excluirAlvo?.codigo}?</AlertDialogTitle>
              <AlertDialogDescription>
                A exclusão só é possível quando não há faltas nem saídas usando o código. Com
                histórico, o caminho é desativar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => excluirAlvo && void removerJustificativa(excluirAlvo)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SecaoRecolhivel>

      <SecaoRecolhivel
        dataSecao="config-liberadores"
        titulo="Quem libera as saídas"
        descricao="Códigos fixos após o cadastro."
        icone={UserCheck}
        aberto={abertoLiberadores}
        onAbertoChange={setAbertoLiberadores}
        resumo={
          <>
            <Selo>{liberadores.length} no catálogo</Selo>
            <Selo>{liberadores.filter((item) => item.ativo).length} ativos</Selo>
          </>
        }
      >
        <div className="superficie-vidro flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 sm:w-32">
            <Label htmlFor="liberador-codigo">Código</Label>
            <Input
              id="liberador-codigo"
              value={novaCodigoLiberador}
              maxLength={20}
              autoComplete="off"
              disabled={enviandoLiberador}
              onChange={(evento) => setNovaCodigoLiberador(evento.target.value)}
              placeholder="Ex.: maria"
              className="h-11"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="liberador-rotulo">Rótulo</Label>
            <Input
              id="liberador-rotulo"
              value={novaRotuloLiberador}
              maxLength={60}
              autoComplete="off"
              disabled={enviandoLiberador}
              onChange={(evento) => setNovaRotuloLiberador(evento.target.value)}
              placeholder="Ex.: Coordenadora Maria"
              className="h-11"
            />
          </div>
          <Button
            type="button"
            className="h-11 sm:w-auto"
            onClick={() => void criarLiberador()}
            disabled={
              enviandoLiberador ||
              novaCodigoLiberador.trim() === "" ||
              novaRotuloLiberador.trim() === ""
            }
          >
            {enviandoLiberador ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            Adicionar
          </Button>
        </div>

        {erroLiberador && (
          <AvisoCompacto
            variante={erroLiberadorVariante}
            descricao={erroLiberador}
            tamanho="linha"
          />
        )}

        {liberadores.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum nome cadastrado.</p>
        )}

        <ul className="superficie-vidro divide-y overflow-hidden">
          {liberadores.map((item) => (
            <li
              key={item.codigo}
              className={`flex min-h-14 items-center gap-3 px-3 py-2 last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)] ${
                item.ativo ? "" : "opacity-60"
              }`}
            >
              <span className="bg-secondary text-secondary-foreground numerais-tabulares w-20 shrink-0 truncate rounded-md px-1.5 py-1 text-center text-xs font-semibold">
                {item.codigo}
              </span>
              {editandoLiberador === item.codigo ? (
                <>
                  <Input
                    value={rotuloEdicaoLiberador}
                    maxLength={60}
                    autoComplete="off"
                    aria-label={`Rótulo de ${item.codigo}`}
                    onChange={(evento) => setRotuloEdicaoLiberador(evento.target.value)}
                    className="h-10 min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Salvar rótulo de ${item.codigo}`}
                    onClick={() => void salvarRotuloLiberador(item.codigo)}
                    disabled={enviandoLiberador || rotuloEdicaoLiberador.trim().length < 2}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Cancelar edição de ${item.codigo}`}
                    onClick={() => {
                      setEditandoLiberador(null);
                      setRotuloEdicaoLiberador("");
                    }}
                  >
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.rotulo}
                    {item.ativo ? "" : " · desativado"}
                  </span>
                  <Switch
                    checked={item.ativo}
                    aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.codigo}`}
                    onCheckedChange={() => void alternarAtivoLiberador(item)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Editar rótulo de ${item.codigo}`}
                    onClick={() => {
                      setEditandoLiberador(item.codigo);
                      setRotuloEdicaoLiberador(item.rotulo);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-falta-texto size-10 shrink-0"
                    aria-label={`Excluir ${item.codigo}`}
                    onClick={() => setExcluirAlvoLiberador(item)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <AlertDialog
          open={excluirAlvoLiberador !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setExcluirAlvoLiberador(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {excluirAlvoLiberador?.rotulo}?</AlertDialogTitle>
              <AlertDialogDescription>
                A exclusão só é possível quando não há saídas com este código. Com histórico, o
                caminho é desativar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => excluirAlvoLiberador && void removerLiberador(excluirAlvoLiberador)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SecaoRecolhivel>
    </>
  );
  const dados = (
    <>
      <SecaoRecolhivel
        dataSecao="config-copia"
        titulo="Cópia de segurança"
        descricao="A importação adiciona dados ausentes, sem sobrescrever os existentes."
        icone={Archive}
        aberto={abertoCopia}
        onAbertoChange={setAbertoCopia}
        resumo={<Selo>Arquivo JSON</Selo>}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setDownloadAberto(true)}
            disabled={importando}
          >
            <Download size={16} />
            Baixar cópia
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="h-11" disabled={importando}>
                {importando ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                Importar cópia
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Importar cópia?</AlertDialogTitle>
                <AlertDialogDescription>
                  O arquivo é mesclado ao banco: registros que já existem são mantidos e apenas os
                  que faltam são adicionados. Confira o resultado depois da importação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => arquivoRef.current?.click()}>
                  Escolher arquivo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <input
            ref={arquivoRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void importar(arquivo);
            }}
          />
        </div>
        {erroCopia && (
          <AvisoCompacto variante="dados_invalidos" descricao={erroCopia} tamanho="linha" />
        )}
        {resultado && (
          <p role="status" className="bg-secondary/60 rounded-lg px-4 py-3 text-sm">
            {resultado.adicionadas}{" "}
            {resultado.adicionadas === 1 ? "registro adicionado" : "registros adicionados"},{" "}
            {resultado.identicas} {resultado.identicas === 1 ? "já era igual" : "já eram iguais"} e{" "}
            {resultado.conflitos}{" "}
            {resultado.conflitos === 1 ? "conflito mantido" : "conflitos mantidos"}.
          </p>
        )}
      </SecaoRecolhivel>
    </>
  );

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
      <nav
        aria-label="Categorias de configurações"
        className="superficie-vidro grid grid-cols-2 gap-1.5 p-1.5 lg:grid-cols-1"
      >
        {CATEGORIAS.map(({ valor, rotulo, icone: Icone }) => (
          <Button
            key={valor}
            id={`categoria-config-${valor}`}
            type="button"
            variant="ghost"
            aria-pressed={categoria === valor}
            aria-controls={`config-grupo-${valor}`}
            onClick={() => setCategoria(valor)}
            className={`h-12 min-w-0 justify-start px-3 text-xs sm:text-sm ${
              categoria === valor ? "vidro-selecionado" : "text-muted-foreground"
            }`}
          >
            <Icone size={16} aria-hidden="true" />
            {rotulo}
          </Button>
        ))}
      </nav>
      <div className="min-w-0">
        <section
          id="config-grupo-escola"
          aria-labelledby="categoria-config-escola"
          hidden={categoria !== "escola"}
          inert={categoria !== "escola"}
          className="flex min-w-0 flex-col gap-4"
        >
          {escola}
        </section>
        <section
          id="config-grupo-planilhas"
          aria-labelledby="categoria-config-planilhas"
          hidden={categoria !== "planilhas"}
          inert={categoria !== "planilhas"}
          className="flex min-w-0 flex-col gap-4"
        >
          <IntegracaoPlanilha
            turmas={turmas}
            diaCorrente={diaCorrente}
            abertoInicial={planilhaInicial === "FREQUENCIA"}
          />
          <IntegracaoSaidas
            onAbrirSaidas={onAbrirSaidas}
            abertoInicial={planilhaInicial === "SAIDAS"}
          />
          <IntegracaoParcial
            onAbrirParcial={onAbrirParcial}
            abertoInicial={planilhaInicial === "PARCIAL"}
          />
          <SecaoIndicadores />
          <SecaoFilaPlanilha />
        </section>
        <section
          id="config-grupo-acesso"
          aria-labelledby="categoria-config-acesso"
          hidden={categoria !== "acesso"}
          inert={categoria !== "acesso"}
          className="flex min-w-0 flex-col gap-4"
        >
          <SecaoAcessoDiretores />
          <SecaoNotificacoes />
        </section>
        <section
          id="config-grupo-dados"
          aria-labelledby="categoria-config-dados"
          hidden={categoria !== "dados"}
          inert={categoria !== "dados"}
          className="flex min-w-0 flex-col gap-4"
        >
          {dados}
        </section>
      </div>
      <DialogoDownload
        confirmarAdmin
        aberto={downloadAberto}
        onAbrir={setDownloadAberto}
        preparar={prepararCopia}
        onConcluido={() =>
          avisarSucesso(
            "Cópia preparada. Confira o download no navegador.",
            "Guarde a cópia em local seguro e, se protegida, mantenha a senha separada.",
          )
        }
      />
    </div>
  );
}
