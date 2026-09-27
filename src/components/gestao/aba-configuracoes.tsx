"use client";

// Configurações de recursos, catálogos de justificativas e de quem libera as
// saídas, e cópia de segurança em JSON. Restrita à administração, com
// auditoria no servidor.
import { useRef, useState } from "react";
import {
  Archive,
  Check,
  Download,
  LoaderCircle,
  Pencil,
  Plus,
  ScrollText,
  Settings2,
  Trash2,
  Upload,
  UserCheck,
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
} from "@/domain/frequencia";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selo } from "@/components/ui/selo";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import IntegracaoPlanilha from "@/components/gestao/integracao-planilha";
import IntegracaoSaidas from "@/components/gestao/integracao-saidas";
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
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  turmas: { id: string; rotulo: string }[];
  diaCorrente: string;
  onMudanca: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
  onLiberadoresMudaram: () => Promise<void>;
  onAbrirSaidas?: () => void;
}

interface ResultadoImportacao {
  adicionadas: number;
  identicas: number;
  conflitos: number;
}

const LIMITE_ARQUIVO = 25 * 1024 * 1024;

export default function AbaConfiguracoes({
  configuracoes,
  justificativas,
  liberadores,
  turmas,
  diaCorrente,
  onMudanca,
  onJustificativasMudaram,
  onLiberadoresMudaram,
  onAbrirSaidas,
}: Props) {
  const [abertoRecursos, setAbertoRecursos] = useState(true);
  const [abertoJustificativas, setAbertoJustificativas] = useState(false);
  const [abertoLiberadores, setAbertoLiberadores] = useState(false);
  const [abertoCopia, setAbertoCopia] = useState(false);
  const [salvando, setSalvando] = useState<"frequenciaPorAula" | "saidaAntecipada" | null>(null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [baixando, setBaixando] = useState(false);
  const [importando, setImportando] = useState(false);
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
              ? "Saída antecipada ativada."
              : "Saída antecipada desativada.",
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

  async function baixarCopia() {
    const aviso = "backup-baixar";
    await executarPorChave(aviso, async () => {
      setBaixando(true);
      setErro("");
      toast.loading("Baixando a cópia de segurança...", { id: aviso });
      try {
        const dados = await pedir<unknown>("/api/backup");
        const conteudo = JSON.stringify(dados, null, 2);
        const blob = new Blob([conteudo], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `frequenciapp-copia-${diaCorrente}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        avisarSucesso(
          "Cópia preparada. Confira o download no navegador.",
          "Guarde o arquivo em lugar seguro: é com ele que os dados voltam, se precisar.",
          aviso,
        );
      } catch (excecao) {
        setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível gerar a cópia.");
        setErroVariante(estadoDeErro(excecao));
        avisarErro(excecao, { contexto: "Não foi possível gerar a cópia.", id: aviso });
      } finally {
        setBaixando(false);
      }
    });
  }

  async function importar(arquivo: File) {
    const aviso = "backup-importar";
    await executarPorChave(aviso, async () => {
      setImportando(true);
      setErro("");
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
        setErro(mensagem);
        setErroVariante("dados_invalidos");
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

  return (
    <div className="flex flex-col gap-4">
      <SecaoRecolhivel
        dataSecao="config-recursos"
        titulo="Recursos da escola"
        descricao="O que estiver desligado continua preservado nos dados e pode ser religado depois."
        icone={Settings2}
        aberto={abertoRecursos}
        onAbertoChange={setAbertoRecursos}
        resumo={
          <>
            <Selo variante={configuracoes.frequenciaPorAula ? "sucesso" : "neutro"}>
              Chamada por aula {configuracoes.frequenciaPorAula ? "ligada" : "desligada"}
            </Selo>
            <Selo variante={configuracoes.saidaAntecipada ? "sucesso" : "neutro"}>
              Saída antecipada {configuracoes.saidaAntecipada ? "ligada" : "desligada"}
            </Selo>
          </>
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-frequencia-aula">Chamada por aula</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Com o recurso ligado, a Chamada registra falta por aula, a Grade mostra a marca S e a
              gestão de aulas volta a valer. Desligado, a chamada é única por dia.
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
            <Label htmlFor="config-saida-antecipada">Saída antecipada</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Mostra a área Saídas, com registro, saídas do dia e relatório semanal. Desligado, os
              registros existentes continuam preservados nos relatórios.
            </p>
          </div>
          <Switch
            id="config-saida-antecipada"
            checked={configuracoes.saidaAntecipada}
            disabled={salvando !== null}
            onCheckedChange={(valor) => void alternar("saidaAntecipada", valor)}
          />
        </div>

        {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
      </SecaoRecolhivel>

      <IntegracaoPlanilha turmas={turmas} diaCorrente={diaCorrente} />

      <IntegracaoSaidas onAbrirSaidas={onAbrirSaidas} />

      <SecaoRecolhivel
        dataSecao="config-justificativas"
        titulo="Justificativas"
        descricao="Valem para a falta justificada e para a saída antecipada. O código é fixo depois de criado; rótulo e situação podem mudar."
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
        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end">
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
            className="h-11 rounded-lg sm:w-auto"
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

        <ul className="divide-y overflow-hidden rounded-lg border">
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
                className="bg-falta text-falta-foreground hover:bg-falta/90"
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
        descricao="Vale para o registro de saída antecipada. O código é fixo depois de criado; rótulo e situação podem mudar."
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
        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end">
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
            className="h-11 rounded-lg sm:w-auto"
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

        <ul className="divide-y overflow-hidden rounded-lg border">
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
                className="bg-falta text-falta-foreground hover:bg-falta/90"
                onClick={() => excluirAlvoLiberador && void removerLiberador(excluirAlvoLiberador)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SecaoRecolhivel>

      <SecaoRecolhivel
        dataSecao="config-copia"
        titulo="Cópia de segurança"
        descricao="A cópia reúne séries, turmas, aulas, alunos, chamadas, saídas, justificativas, quem libera e configurações em um arquivo JSON. A importação adiciona o que falta e nunca sobrescreve o que já existe."
        icone={Archive}
        aberto={abertoCopia}
        onAbertoChange={setAbertoCopia}
        resumo={<Selo>Arquivo JSON com todos os dados</Selo>}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg"
            onClick={() => void baixarCopia()}
            disabled={baixando || importando}
          >
            {baixando ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Baixar cópia
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-lg"
                disabled={importando}
              >
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
    </div>
  );
}
